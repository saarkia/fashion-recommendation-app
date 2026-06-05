import { createServer } from "node:http";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { del, get, put } from "@vercel/blob";

const PORT = Number(process.env.WHATSAPP_BRIDGE_PORT || 4190);
const MIRA_BASE_URL = (process.env.MIRA_BASE_URL || "https://fashion-recommendation-app.vercel.app").replace(/\/$/, "");
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const TWILIO_TYPING_API_URL = "https://messaging.twilio.com/v2/Indicators/Typing.json";
const TWILIO_TYPING_INDICATORS_ENABLED = process.env.TWILIO_TYPING_INDICATORS_ENABLED !== "false";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const WHATSAPP_SEND_SPACING_MS = Number(process.env.WHATSAPP_SEND_SPACING_MS || 1300);
const WHATSAPP_FAST_REPLY_TYPING_DELAY_MS = Number(process.env.WHATSAPP_FAST_REPLY_TYPING_DELAY_MS || 650);
const WHATSAPP_ASYNC_TYPING_PULSE_DELAYS_MS = (process.env.WHATSAPP_ASYNC_TYPING_PULSE_DELAYS_MS || "1500,8000,16000")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
const SESSION_BLOB_PREFIX = "whatsapp/sessions";
const WHATSAPP_RECOMMENDATION_CARD_LIMIT = Number(process.env.WHATSAPP_RECOMMENDATION_CARD_LIMIT || 4);
const WHATSAPP_DRY_RUN_OUTBOX = process.env.WHATSAPP_DRY_RUN_OUTBOX || "";
const RECOMMENDATION_PENDING_TTL_MS = Number(process.env.WHATSAPP_RECOMMENDATION_PENDING_TTL_MS || 2 * 60 * 1000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL_FAST = process.env.OPENAI_MODEL_FAST || process.env.OPENAI_MODEL || "gpt-5.4-nano";
const OPENAI_TEXT_VERBOSITY = process.env.OPENAI_TEXT_VERBOSITY || "low";
const OPENAI_REASONING_EFFORT_FAST = process.env.OPENAI_REASONING_EFFORT_FAST || process.env.OPENAI_REASONING_EFFORT || "low";
const OPENAI_TIMEOUT_MS = Number(process.env.WHATSAPP_INTAKE_OPENAI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 8000);

const sessions = new Map();

const demoDefaults = {
  eventType: "first-day-new-job",
  stylePreference: "minimal",
  store: "Chicago Loop",
  budgetMax: 400,
  gender: "Men",
  urgency: "today",
  customerSizing: {
    shirt: "M",
    trouser: "32W",
    shoe: "US 9"
  }
};

const eventLabels = {
  "first-day-new-job": "first day at a new job",
  "holiday-party": "holiday party",
  "business-conference": "business conference",
  vacation: "vacation",
  "outdoor-spring-wedding": "outdoor spring wedding"
};

const styleLabels = {
  minimal: "minimal",
  classic: "classic",
  comfortable: "comfortable",
  "trend-forward": "trend-forward"
};

const requiredIntakeFields = ["eventType", "budgetMax", "stylePreference"];
const allowedEventTypes = new Set(Object.keys(eventLabels));
const allowedStylePreferences = new Set(Object.keys(styleLabels));
const allowedGenders = new Set(["Men", "Women", "Unisex"]);
const allowedUrgencies = new Set(["today", "tomorrow", "soon"]);
const allowedStores = new Set(["Chicago Loop", "Dallas NorthPark", "New York Herald Square", "San Francisco Centre"]);

function now() {
  return Date.now();
}

function createIntake() {
  return {
    payload: {
      store: demoDefaults.store,
      gender: demoDefaults.gender,
      urgency: demoDefaults.urgency,
      customerSizing: { ...demoDefaults.customerSizing }
    },
    collected: {},
    history: [],
    askedFor: null
  };
}

function pruneSessions() {
  const cutoff = now() - SESSION_TTL_MS;
  for (const [key, session] of sessions.entries()) {
    if ((session.updatedAt || session.createdAt || 0) < cutoff) sessions.delete(key);
  }
}

function sessionKey(from, to = "") {
  return `${compactText(to, "unknown-to")}|${compactText(from, "unknown-from")}`;
}

function createSession(from, to = "") {
  const key = sessionKey(from, to);
  const session = {
    sessionKey: key,
    from,
    to,
    createdAt: now(),
    updatedAt: now(),
    recommendation: null,
    recommendationPayload: null,
    chatState: {
      likedProductIds: [],
      dislikedProductIds: [],
      lockedProductIds: [],
      preferences: []
    },
    history: [],
    intake: createIntake(),
    recommendationPending: null,
    previewRecommendation: null,
    previewSwap: null
  };
  sessions.set(key, session);
  return session;
}

function normalizeSession(session, from, to = "") {
  const key = sessionKey(from, to);
  return {
    sessionKey: key,
    from,
    to,
    createdAt: now(),
    updatedAt: now(),
    recommendation: null,
    recommendationPayload: null,
    recommendationPending: null,
    previewRecommendation: null,
    previewSwap: null,
    ...(session || {}),
    from,
    to,
    sessionKey: key,
    chatState: {
      likedProductIds: [],
      dislikedProductIds: [],
      lockedProductIds: [],
      preferences: [],
      ...(session?.chatState || {})
    },
    history: Array.isArray(session?.history) ? session.history.slice(-12) : [],
    intake: {
      ...createIntake(),
      ...(session?.intake || {}),
      payload: {
        ...createIntake().payload,
        ...(session?.intake?.payload || {})
      },
      collected: {
        ...(session?.intake?.collected || {})
      },
      history: Array.isArray(session?.intake?.history) ? session.intake.history.slice(-10) : []
    }
  };
}

function sessionBlobPath(key) {
  const id = Buffer.from(String(key)).toString("base64url");
  return `${SESSION_BLOB_PREFIX}/${id}.json`;
}

function getMemorySession(from, to = "") {
  pruneSessions();
  const key = sessionKey(from, to);
  const session = sessions.get(key) || createSession(from, to);
  session.updatedAt = now();
  return session;
}

async function loadSession(from, to = "") {
  pruneSessions();
  const key = sessionKey(from, to);
  if (!BLOB_READ_WRITE_TOKEN) return getMemorySession(from, to);

  try {
    const blob = await get(sessionBlobPath(key), {
      access: "private",
      useCache: false,
      token: BLOB_READ_WRITE_TOKEN
    });
    if (!blob) return createSession(from, to);
    const text = await new Response(blob.stream).text();
    const session = normalizeSession(JSON.parse(text), from, to);
    if ((session.updatedAt || session.createdAt || 0) < now() - SESSION_TTL_MS) {
      await deleteSession(session);
      return createSession(from, to);
    }
    session.updatedAt = now();
    sessions.set(key, session);
    return session;
  } catch (error) {
    console.warn(`Using in-memory WhatsApp session: ${error.message}`);
    return getMemorySession(from, to);
  }
}

async function saveSession(session) {
  session.updatedAt = now();
  const key = session.sessionKey || sessionKey(session.from, session.to);
  session.sessionKey = key;
  sessions.set(key, session);
  if (!BLOB_READ_WRITE_TOKEN) return;
  await put(sessionBlobPath(key), JSON.stringify(session), {
    access: "private",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: BLOB_READ_WRITE_TOKEN
  });
}

async function deleteSession(sessionOrFrom, to = "") {
  const key = typeof sessionOrFrom === "object"
    ? sessionOrFrom.sessionKey || sessionKey(sessionOrFrom.from, sessionOrFrom.to)
    : sessionKey(sessionOrFrom, to);
  sessions.delete(key);
  if (!BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(sessionBlobPath(key), { token: BLOB_READ_WRITE_TOKEN });
  } catch (error) {
    console.warn(`Could not delete WhatsApp session: ${error.message}`);
  }
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function twiml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

function sendXml(res, message) {
  const body = twiml(message);
  res.writeHead(200, {
    "content-type": "text/xml; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body too large");
  }
  return body;
}

async function readTwilioForm(req) {
  const raw = await readBody(req);
  const form = new URLSearchParams(raw);
  return Object.fromEntries(form.entries());
}

function compactText(value, fallback = "") {
  return String(value || fallback || "").replace(/\s+/g, " ").trim();
}

function waFormat(value, marker) {
  const text = compactText(value);
  if (!text) return "";
  return `${marker}${text.replaceAll(marker, "")}${marker}`;
}

function waBold(value) {
  return waFormat(value, "*");
}

function waItalic(value) {
  return waFormat(value, "_");
}

function cleanJson(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed || "{}");
}

function isGpt5Family(model = "") {
  return /^gpt-5(?:[.\-]|$)/.test(String(model));
}

function toResponsesInput(messages) {
  return messages.map((message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map((part) => part?.type === "text" ? { type: "input_text", text: part.text || "" } : part)
      : message.content
  }));
}

function responseText(payload) {
  if (payload?.output_text) return payload.output_text;
  const texts = [];
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) texts.push(content.text);
      if (content.type === "text" && content.text) texts.push(content.text);
    }
  }
  return texts.join("\n").trim();
}

function cleanAssistantMessage(text) {
  return normalizeMiraVoice(compactText(text))
    .replace(/\s*\(\s*event\s*type\s*\)\s*/gi, " ")
    .replace(/\bevent\s*type\b/gi, "occasion")
    .replace(/\beventType\b/gi, "occasion")
    .replace(/\bbudgetMax\b/gi, "budget")
    .replace(/\bstylePreference\b/gi, "style direction")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([?.!,])/g, "$1")
    .trim();
}

function normalizeMiraVoice(text, fallback = "") {
  const withoutFixedCommands = String(text || fallback || "")
    .split(/\n+/)
    .filter((line) => !/^\s*Reply\s+["“]/i.test(line))
    .filter((line) => !/\bReply\s+["“](?:change shoes|apply|save|reset)["”]/i.test(line))
    .join("\n");

  return withoutFixedCommands
    .replace(/\bMira(?:'|’)s\b/g, "my")
    .replace(/\bMira is\b/g, "I’m")
    .replace(/\bMira has\b/g, "I’ve")
    .replace(/\bMira can\b/g, "I can")
    .replace(/\bMira will\b/g, "I’ll")
    .replace(/\bMira would\b/g, "I’d")
    .replace(/\bMira could\b/g, "I could")
    .replace(/\bMira found\b/g, "I found")
    .replace(/\bMira built\b/g, "I built")
    .replace(/\bMira generated\b/g, "I generated")
    .replace(/\bMira updated\b/g, "I updated")
    .replace(/\bMira hit\b/g, "I hit")
    .replace(/\bby Mira\b/g, "by me")
    .replace(/\bwith Mira\b/g, "with me")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function openaiFetch(path, body) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.openai.com/v1${path}`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || `${response.status} ${response.statusText}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function chatJson(messages, maxTokens = 650, model = OPENAI_MODEL_FAST) {
  if (isGpt5Family(model)) {
    const payload = await openaiFetch("/responses", {
      model,
      input: toResponsesInput(messages),
      max_output_tokens: maxTokens,
      text: {
        verbosity: OPENAI_TEXT_VERBOSITY,
        format: { type: "json_object" }
      },
      reasoning: { effort: OPENAI_REASONING_EFFORT_FAST }
    });
    return cleanJson(responseText(payload));
  }

  const payload = await openaiFetch("/chat/completions", {
    model,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: maxTokens
  });
  return cleanJson(payload.choices?.[0]?.message?.content || "{}");
}

function inferBudget(message, fallback = null, { allowBare = false, allowDefaultText = false } = {}) {
  const text = String(message || "");
  const match = text.match(/(?:[$£]\s*(\d{2,5})|\bbudget(?:\s+is|\s+of|\s*:)?\s*[$£]?\s*(\d{2,5})|\b(?:under|below|around|about|max|maximum)\s*[$£]?\s*(\d{2,5}))/i)
    || (allowBare ? text.match(/\b(\d{2,5})\b/) : null);
  if (!match) {
    if (allowDefaultText && /\b(no budget|not sure|unsure|you choose|recommend|whatever)\b/i.test(text)) return demoDefaults.budgetMax;
    return fallback;
  }
  const value = Number(match[1] || match[2] || match[3]);
  return Number.isFinite(value) && value >= 50 ? value : fallback;
}

function inferEventType(message) {
  const text = String(message || "").toLowerCase();
  if (/\b(job|work|office|first day|interview|new role|new job)\b/.test(text)) return "first-day-new-job";
  if (/\b(christmas|evening|drinks|party)\b/.test(text)) return "holiday-party";
  if (/\b(conference|business|client|meeting|presentation)\b/.test(text)) return "business-conference";
  if (/\b(vacation|travel|beach|trip)\b/.test(text)) return "vacation";
  if (/\b(wedding|ceremony|garden party|spring wedding)\b/.test(text)) return "outdoor-spring-wedding";
  return null;
}

function inferStylePreference(message, { allowDefaultText = false } = {}) {
  const text = String(message || "").toLowerCase();
  if (/\b(comfortable|comfy|relaxed|easy)\b/.test(text)) return "comfortable";
  if (/\b(trend|bold|fashion|statement|brighter|bright|modern|stand out)\b/.test(text)) return "trend-forward";
  if (/\b(minimal|simple|clean|understated|neutral)\b/.test(text) || /\b(?:not|nothing)\s+(?:too\s+)?(?:loud|flashy|bold|busy)\b/.test(text)) return "minimal";
  if (/\b(classic|timeless|traditional|smart|smart casual|professional|polished)\b/.test(text)) return "classic";
  if (allowDefaultText && /\b(not sure|unsure|you choose|recommend|whatever)\b/.test(text)) return "classic";
  return null;
}

function inferOptionalSlots(message) {
  const text = String(message || "").toLowerCase();
  const slots = {};

  if (/\b(women|woman|female|dress|heels|skirt)\b/.test(text)) slots.gender = "Women";
  if (/\b(men|man|male|mens|men's)\b/.test(text)) slots.gender = "Men";

  if (/\btomorrow\b/.test(text)) slots.urgency = "tomorrow";
  if (/\b(this week|weekend|later)\b/.test(text)) slots.urgency = "soon";
  if (/\b(today|tonight|now|same day)\b/.test(text)) slots.urgency = "today";

  if (/\bdallas\b/.test(text)) slots.store = "Dallas NorthPark";
  if (/\bnew york|herald square|nyc\b/.test(text)) slots.store = "New York Herald Square";
  if (/\bsan francisco|sf centre|sf center\b/.test(text)) slots.store = "San Francisco Centre";
  if (/\bchicago\b/.test(text)) slots.store = "Chicago Loop";

  return slots;
}

function inferPayloadSlots(message, { askedFor = null } = {}) {
  const slots = inferOptionalSlots(message);
  const eventType = inferEventType(message);
  const stylePreference = inferStylePreference(message, { allowDefaultText: askedFor === "stylePreference" });
  const budgetMax = inferBudget(message, null, { allowBare: askedFor === "budgetMax", allowDefaultText: askedFor === "budgetMax" });

  if (eventType) slots.eventType = eventType;
  if (stylePreference) slots.stylePreference = stylePreference;
  if (budgetMax) slots.budgetMax = budgetMax;
  return slots;
}

function sanitizeIntakeSlots(slots = {}) {
  const clean = {};
  if (allowedEventTypes.has(slots.eventType)) clean.eventType = slots.eventType;
  if (allowedStylePreferences.has(slots.stylePreference)) clean.stylePreference = slots.stylePreference;
  if (allowedGenders.has(slots.gender)) clean.gender = slots.gender;
  if (allowedUrgencies.has(slots.urgency)) clean.urgency = slots.urgency;
  if (allowedStores.has(slots.store)) clean.store = slots.store;
  const budget = Number(slots.budgetMax);
  if (Number.isFinite(budget) && budget >= 50 && budget <= 10000) clean.budgetMax = Math.round(budget);
  return clean;
}

async function interpretIntakeWithOpenAI(session, message, fallbackSlots = {}) {
  if (!OPENAI_API_KEY) return null;
  const intake = ensureIntake(session);
  try {
    const result = await chatJson([
      {
        role: "system",
        content: `You are Mira's WhatsApp intake interpreter for RetailNEXT.
Return only valid JSON. Extract shopping constraints from natural language, including short follow-up replies.

Allowed eventType values:
- first-day-new-job: first day at work, new job, interview, office start, first day in a role
- outdoor-spring-wedding: wedding, ceremony, garden party, spring wedding
- holiday-party: party, Christmas party, evening drinks
- business-conference: conference, client meeting, business presentation
- vacation: holiday, travel, beach, trip

Allowed stylePreference values:
- minimal: simple, clean, neutral, understated, not flashy
- classic: timeless, smart, polished, professional, traditional
- comfortable: comfy, relaxed, easy, practical
- trend-forward: bold, statement, fashionable, modern, stand out

Allowed store values: Chicago Loop, Dallas NorthPark, New York Herald Square, San Francisco Centre.
Allowed gender values: Men, Women, Unisex.
Allowed urgency values: today, tomorrow, soon.

Rules:
- Return exactly this shape: {"intent": "intake", "slots": {}, "assistantMessage": "", "confidence": 0}.
- intent must be one of: intake, help, chitchat, off_topic, nonsense, ready.
- Use the current intake state and the field currently being asked for.
- Use recentIntakeHistory to understand short replies and corrections.
- The user may answer in casual language, combine several fields, correct an earlier value, or provide fields out of order.
- If askedFor is budgetMax, messages like "400 is great", "about 500", "let's do 650", or "under £300" are budgets.
- If askedFor is stylePreference, messages like "not too loud", "not flashy", or "nothing too busy" mean minimal; "smart but comfy" can be comfortable; "you choose" means classic.
- If the user gives a budget before the event, extract budgetMax and ask for eventType next.
- Do not invent eventType, budgetMax, or stylePreference if the message does not imply them.
- Prefer extracting values over asking the same question again.
- If the message is rubbish, keyboard smash, or unrelated, set intent to nonsense or off_topic, keep slots empty, and politely ask the next missing required field.
- Write as Mira in first person. Use "I" and "my"; never say "Mira is", "Mira has", or describe Mira in the third person.
- If the user asks what Mira can do, set intent to help and briefly explain that I can build a complete outfit, check local stock, and help them save it for store try-on or buy it online before asking the next missing required field.
- Do not claim a recommendation exists until all required fields are known.
- Do not mention internal schema names like eventType, budgetMax, stylePreference, slots, payload, or fields.
- Do not teach fixed commands such as Reply "save", Reply "apply", Reply "reset", or Reply "change shoes". Ask natural follow-up questions instead.
- Do not use emoji.
- Keep assistantMessage brief and conversational for WhatsApp, but always end with a clear question if required fields are missing.
- If a required field is still missing after applying slots, assistantMessage should ask only for the next missing field.
- If all required fields are known, assistantMessage should briefly confirm and say I am checking the RetailNEXT catalogue, budget, and local availability.`
      },
      {
        role: "user",
        content: JSON.stringify({
          message,
          askedFor: intake.askedFor || null,
          currentPayload: intake.payload || {},
          collected: intake.collected || {},
          recentIntakeHistory: (intake.history || []).slice(-8),
          fallbackSlots,
          requiredFields: requiredIntakeFields
        })
      }
    ]);
    return {
      slots: sanitizeIntakeSlots(result.slots || result),
      assistantMessage: cleanAssistantMessage(result.assistantMessage),
      intent: compactText(result.intent, "intake"),
      confidence: Number(result.confidence || 0)
    };
  } catch (error) {
    console.warn(`OpenAI intake fallback: ${error.message}`);
    return null;
  }
}

function inferRecommendationPayload(message) {
  const payload = { ...demoDefaults, customerSizing: { ...demoDefaults.customerSizing } };
  return { ...payload, ...inferPayloadSlots(message) };
}

function eventLabel(eventType) {
  return eventLabels[eventType] || "your event";
}

function styleLabel(stylePreference) {
  return styleLabels[stylePreference] || "your style";
}

function errorMessage(value, fallback = "Request failed") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (value.message) return String(value.message);
  if (value.error) return errorMessage(value.error, fallback);
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

async function postMiraJson(path, body) {
  const response = await fetch(`${MIRA_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorMessage(payload.error || payload, `${path} returned ${response.status}`));
  }
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWhatsApp(to, body, { mediaUrl = "" } = {}) {
  if (WHATSAPP_DRY_RUN_OUTBOX) {
    await appendFile(WHATSAPP_DRY_RUN_OUTBOX, `${JSON.stringify({
      at: new Date().toISOString(),
      from: TWILIO_WHATSAPP_FROM,
      to,
      body,
      mediaUrl
    })}\n`);
    console.warn(`Dry-run WhatsApp send to ${to}: ${body}${mediaUrl ? `\nMedia: ${mediaUrl}` : ""}`);
    return { dryRun: true };
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn("Skipping outbound WhatsApp send because Twilio credentials are not configured.");
    console.warn(`Would send to ${to}: ${body}${mediaUrl ? `\nMedia: ${mediaUrl}` : ""}`);
    return null;
  }

  const form = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: to,
    Body: body
  });
  if (mediaUrl) form.append("MediaUrl", mediaUrl);
  const response = await fetch(`${TWILIO_API_BASE}/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      "authorization": `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Twilio returned ${response.status}`);
  }
  return payload;
}

async function sendTypingIndicator(messageSid) {
  const messageId = compactText(messageSid);
  if (!TWILIO_TYPING_INDICATORS_ENABLED || !messageId) return null;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn("Skipping WhatsApp typing indicator because Twilio credentials are not configured.");
    return null;
  }

  const form = new URLSearchParams({
    messageId,
    channel: "whatsapp"
  });
  const response = await fetch(TWILIO_TYPING_API_URL, {
    method: "POST",
    headers: {
      "authorization": `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Twilio typing indicator returned ${response.status}`);
  }
  return payload;
}

function safeSendTypingIndicator(messageSid) {
  if (!messageSid) return;
  sendTypingIndicator(messageSid).catch((error) => {
    console.warn(`WhatsApp typing indicator failed: ${error.message}`);
  });
}

function startTypingIndicatorPulse(messageSid, delays = WHATSAPP_ASYNC_TYPING_PULSE_DELAYS_MS) {
  const messageId = compactText(messageSid);
  if (!messageId || !delays.length) return () => {};
  let cancelled = false;
  for (const delay of delays) {
    sleep(delay).then(() => {
      if (!cancelled) safeSendTypingIndicator(messageId);
    });
  }
  return () => {
    cancelled = true;
  };
}

async function showTypingForFastReply(messageSid, { start = true } = {}) {
  if (!messageSid) return;
  if (start) safeSendTypingIndicator(messageSid);
  if (WHATSAPP_FAST_REPLY_TYPING_DELAY_MS > 0) {
    await sleep(WHATSAPP_FAST_REPLY_TYPING_DELAY_MS);
  }
}

async function safeSendWhatsApp(to, body, options = {}) {
  try {
    return await sendWhatsApp(to, body, options);
  } catch (error) {
    console.error(`WhatsApp send failed: ${error.message}`);
    return null;
  }
}

function roleLabel(value) {
  const label = String(value || "item").replaceAll("-", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function inventoryCount(product, store) {
  return Number(product?.inventory?.[store] || 0);
}

function priceLabel(value) {
  const price = Number(value);
  if (!Number.isFinite(price)) return "";
  return `$${Math.round(price)}`;
}

function absoluteImageUrl(product) {
  const image = product?.image;
  if (!image || image.startsWith("data:")) return "";
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  if (image.startsWith("/")) return `${MIRA_BASE_URL}${image}`;
  if (product?.id) return `${MIRA_BASE_URL}/catalog-images/${product.id}.jpg`;
  return "";
}

function isFreshRecommendation(recommendation = {}) {
  return recommendation.reference?.id === "fresh-brief"
    || recommendation.analysis?.structuredAttributes?.item_type === "Complete outfit";
}

function allOutfitProducts(recommendation = {}) {
  return (recommendation.outfit || [])
    .filter((product) => product?.productDisplayName);
}

function cardOutfitProducts(recommendation = {}) {
  return allOutfitProducts(recommendation)
    .slice(0, Math.max(1, WHATSAPP_RECOMMENDATION_CARD_LIMIT));
}

function itemSummaryLine(product, recommendation, index) {
  const store = recommendation.store || "selected store";
  const stock = inventoryCount(product, store);
  const price = priceLabel(product.price);
  const stockLabel = stock > 0 ? `${stock} at ${store}` : `check ${store} stock`;
  return `${index + 1}. ${waBold(`${roleLabel(product.role || product.articleType)}:`)} ${product.productDisplayName}${price ? ` - ${price}` : ""} (${stockLabel})`;
}

function formatOutfitList(recommendation) {
  const products = allOutfitProducts(recommendation);
  if (!products.length) return "";
  return products.map((product, index) => itemSummaryLine(product, recommendation, index)).join("\n");
}

function pluralPiece(count) {
  return count === 1 ? "piece" : "pieces";
}

function outfitActionPrompt(recommendation = {}) {
  const store = recommendation.store || "your local store";
  return `${waBold(`Everything here is available at ${store} today.`)} Would you like me to save the outfit so you can try it on in store, or would you rather buy it now on the site? If you want a tweak, just tell me what you’d change.`;
}

function outfitPurchaseLine() {
  return `${waBold("Buy the look online:")} ${MIRA_BASE_URL}`;
}

function normalizeRecommendationIntro(line) {
  return normalizeMiraVoice(compactText(line))
    .replace(/^Build\b/i, "I built")
    .replace(/^Create\b/i, "I created")
    .replace(/^Put together\b/i, "I put together")
    .replace(/^Pair\b/i, "I paired");
}

function isFirstPersonCopy(line) {
  return /\bI(?:\s|$|[’'](?:m|ve|ll|d)\b)/i.test(String(line || ""));
}

function formatRecommendation(recommendation) {
  const event = recommendation.event || "your event";
  const starter = recommendation.reference?.productDisplayName || recommendation.analysis?.item || "your starter item";
  const isFresh = isFreshRecommendation(recommendation);
  const business = recommendation.business || {};
  const basketValue = business.basketValue || (recommendation.outfit || []).reduce((sum, product) => sum + Number(product.price || 0), 0);
  const allProducts = allOutfitProducts(recommendation);
  const cardProducts = cardOutfitProducts(recommendation);
  const itemCount = business.itemCount || allProducts.length || (recommendation.outfit || []).length;
  const availableToday = business.availableToday ?? allProducts.filter((product) => inventoryCount(product, recommendation.store) > 0).length;
  const introLines = (recommendation.analysis?.introLines || [])
    .map((line) => normalizeRecommendationIntro(line))
    .filter(Boolean)
    .slice(0, 2);
  const openAiSignal = recommendation.ai?.copyGeneration === "openai" || recommendation.agent?.source === "openai"
    ? "I’ve written the styling notes with OpenAI, grounded in RetailNEXT catalogue and store data."
    : "I’ve grounded the styling notes in RetailNEXT catalogue and store data.";
  const outfitList = formatOutfitList(recommendation);
  const firstPersonIntro = introLines.find((line) => isFirstPersonCopy(line));
  const intro = firstPersonIntro || (isFresh
    ? `I found a complete outfit for ${String(event).toLowerCase()}.`
    : `I built this around ${starter} for ${String(event).toLowerCase()}.`);
  const cardNote = cardProducts.length >= allProducts.length
    ? `I’ll send each piece with an image next.`
    : `I’ll send images for the first ${cardProducts.length} ${pluralPiece(cardProducts.length)} next.`;

  return [
    intro,
    `I checked ${itemCount} ${pluralPiece(itemCount)} against ${recommendation.store} availability before showing them to you.`,
    "",
    `${waBold("Basket:")} $${basketValue} | ${waBold("Available today:")} ${availableToday}/${itemCount} at ${recommendation.store}`,
    outfitList ? `${waBold("Pieces:")}\n${outfitList}` : "",
    waItalic(openAiSignal),
    outfitList ? cardNote : "",
    "",
    outfitPurchaseLine(),
    "",
    outfitActionPrompt(recommendation)
  ].filter((line) => line !== undefined && line !== null).join("\n");
}

function formatProductCaption(product, recommendation) {
  const store = recommendation.store || "selected store";
  const stock = inventoryCount(product, store);
  const price = priceLabel(product.price);
  return [
    `${waBold(`${roleLabel(product.role || product.articleType)}:`)} ${product.productDisplayName}`,
    `${waBold(price || "Price in app")} | ${waItalic(`${stock} at ${store}`)}`,
    normalizeMiraVoice(compactText(product.why))
  ].filter(Boolean).join("\n");
}

async function sendRecommendationMessages(from, recommendation) {
  await safeSendWhatsApp(from, formatRecommendation(recommendation));

  for (const product of cardOutfitProducts(recommendation)) {
    const mediaUrl = absoluteImageUrl(product);
    await sleep(WHATSAPP_SEND_SPACING_MS);
    await safeSendWhatsApp(from, formatProductCaption(product, recommendation), { mediaUrl });
  }

  if (cardOutfitProducts(recommendation).length) {
    await sleep(WHATSAPP_SEND_SPACING_MS);
    await safeSendWhatsApp(from, [
      outfitActionPrompt(recommendation),
      outfitPurchaseLine()
    ].join("\n\n"));
  }
}

function formatPreview(data) {
  const lines = [];
  if (data.previewSwap?.from && data.previewSwap?.to) {
    lines.push(`I can switch ${waBold(data.previewSwap.from.productDisplayName)} for ${waBold(data.previewSwap.to.productDisplayName)}.`);
    lines.push(waItalic("I checked that swap against RetailNEXT inventory and local availability."));
  } else {
    lines.push(normalizeMiraVoice(compactText(data.assistantMessage, "I found a preview update for this outfit.")));
  }
  lines.push("");
  lines.push("Would you like me to use that swap, or keep looking?");
  return lines.join("\n");
}

function formatLookup(data) {
  const lookup = data.lookupResults;
  if (!lookup?.matches?.length) return normalizeMiraVoice(compactText(data.assistantMessage, "I checked store availability."));
  const matches = lookup.matches.slice(0, 3).map((item, index) => `${index + 1}. ${waBold(item.productDisplayName)} - $${item.price} (${item.inventoryCount} in store)`);
  return [
    normalizeMiraVoice(compactText(data.assistantMessage, lookup.summary)),
    "",
    matches.join("\n")
  ].join("\n");
}

function formatChatResult(data) {
  if (data.action === "preview_update") return formatPreview(data);
  if (data.action === "availability_lookup") return formatLookup(data);
  return normalizeMiraVoice(compactText(data.assistantMessage, "I checked the basket."));
}

function chatConstraints(session) {
  const payload = session.recommendationPayload || demoDefaults;
  return {
    eventType: payload.eventType,
    stylePreference: payload.stylePreference,
    storeId: payload.store,
    budgetMax: Number(payload.budgetMax),
    urgency: payload.urgency,
    customerSizing: payload.customerSizing || demoDefaults.customerSizing
  };
}

function ensureIntake(session) {
  if (!session.intake) session.intake = createIntake();
  if (!session.intake.payload) session.intake.payload = createIntake().payload;
  if (!session.intake.collected) session.intake.collected = {};
  if (!Array.isArray(session.intake.history)) session.intake.history = [];
  return session.intake;
}

function recordIntakeTurn(session, role, content) {
  const intake = ensureIntake(session);
  const text = compactText(content);
  if (!text) return;
  intake.history.push({ role, content: text });
  intake.history = intake.history.slice(-10);
}

function isGreetingOnly(message) {
  return /^(hi|hello|hey|hiya|yo|start|morning|afternoon|evening|good morning|good afternoon|good evening)$/i.test(compactText(message));
}

function intakeIntroPrompt() {
  return [
    "Hi, I’m Mira, RetailNEXT’s stylist. I can build a complete outfit from the catalogue, keep it inside budget, check store availability, and send the pieces with images here.",
    "",
    `${waBold("What event or moment are you dressing for?")} For example: first day at a new job, outdoor wedding, business conference, holiday party, or vacation.`
  ].join("\n");
}

function intakeQuestion(field, intake) {
  const payload = intake.payload || {};
  if (field === "eventType") {
    if (payload.budgetMax) {
      return `Got it — I’ll keep it under ${waBold(`$${payload.budgetMax}`)}. What event or moment are you dressing for? For example: first day at a new job, outdoor wedding, business conference, holiday party, or vacation.`;
    }
    return intakeIntroPrompt();
  }
  if (field === "budgetMax") {
    return `Got it — ${eventLabel(payload.eventType)}. ${waBold("What budget should I keep the full outfit under?")} For example: $400.`;
  }
  if (field === "stylePreference") {
    const budget = payload.budgetMax ? `$${payload.budgetMax}` : "that budget";
    return `Great, I’ll keep it under ${waBold(budget)}. ${waBold("What style direction do you want?")} Minimal, classic, comfortable, or trend-forward all work.`;
  }
  return intakeIntroPrompt();
}

function intakeRetryQuestion(field, intake) {
  const payload = intake.payload || {};
  if (field === "eventType") {
    if (payload.budgetMax) {
      return `Got it — I’ll keep it under ${waBold(`$${payload.budgetMax}`)}. ${waBold("What event or moment are you dressing for?")}`;
    }
    return `I didn’t catch the occasion yet. ${waBold("What are you dressing for?")} For example: first day at a new job, outdoor wedding, business conference, holiday party, or vacation.`;
  }
  if (field === "budgetMax") {
    return `I’ve got ${eventLabel(payload.eventType)}. ${waBold("What budget should I keep the full outfit under?")}`;
  }
  if (field === "stylePreference") {
    const budget = payload.budgetMax ? `$${payload.budgetMax}` : "that budget";
    return `I’ve got the occasion and ${waBold(budget)} budget. ${waBold("What style direction should I use?")} Minimal, classic, comfortable, or trend-forward all work.`;
  }
  return intakeIntroPrompt();
}

function isUsefulIntakeSlot(key) {
  return requiredIntakeFields.includes(key) || ["store", "gender", "urgency"].includes(key);
}

function hasUsefulIntakeSlots(slots = {}) {
  return Object.keys(slots).some((key) => isUsefulIntakeSlot(key));
}

function responseLooksAlignedWithField(response, field) {
  const text = String(response || "").toLowerCase();
  if (!text) return false;
  if (field === "eventType") return /\b(event|occasion|moment|dressing|dress|outfit|shopping|wearing|what.*for)\b/.test(text);
  if (field === "budgetMax") return /\b(budget|spend|under|max|maximum|price|cost|keep.*under|[$£])\b/.test(text);
  if (field === "stylePreference") return /\b(style|direction|vibe|look|prefer|minimal|classic|comfortable|trend|bold|simple|smart|polished)\b/.test(text);
  return false;
}

function intakeAskResponse(field, intake, aiMessage = "", { retry = false } = {}) {
  const fallback = retry ? intakeRetryQuestion(field, intake) : intakeQuestion(field, intake);
  return responseLooksAlignedWithField(aiMessage, field) ? aiMessage : fallback;
}

function intakeReadyResponse(payload, aiMessage = "") {
  const text = compactText(aiMessage);
  const asksFollowUp = /\?|\b(anything specific|do you want|would you like|or just|need from me|changes? to)\b/i.test(text);
  if (!asksFollowUp && /\b(checking|catalogue|availability|retailnext)\b/i.test(text)) return text;
  return readyToRecommendPrompt(payload);
}

function applyIntakeSlots(session, message, providedSlots = null) {
  const intake = ensureIntake(session);
  const slots = sanitizeIntakeSlots(providedSlots || inferPayloadSlots(message, { askedFor: intake.askedFor }));
  for (const [key, value] of Object.entries(slots)) {
    intake.payload[key] = value;
    if (requiredIntakeFields.includes(key)) intake.collected[key] = true;
  }
  session.updatedAt = now();
  return slots;
}

function nextMissingIntakeField(intake) {
  return requiredIntakeFields.find((field) => !intake.collected[field]);
}

function finaliseIntakePayload(intake) {
  return {
    ...demoDefaults,
    ...intake.payload,
    customerSizing: {
      ...demoDefaults.customerSizing,
      ...(intake.payload.customerSizing || {})
    }
  };
}

function readyToRecommendPrompt(payload) {
  return [
    `Perfect — I’ve got ${waBold(eventLabel(payload.eventType))}, ${waBold(styleLabel(payload.stylePreference))}, and a ${waBold(`$${payload.budgetMax}`)} budget.`,
    `I’m checking the RetailNEXT catalogue, budget and ${waBold(payload.store)} availability now.`
  ].join("\n");
}

async function handleIntakeMessage(session, message) {
  const intake = ensureIntake(session);
  const fallbackSlots = inferPayloadSlots(message, { askedFor: intake.askedFor });
  let response;

  if (!hasUsefulIntakeSlots(fallbackSlots) && isGreetingOnly(message)) {
    intake.askedFor = "eventType";
    response = intakeIntroPrompt();
    recordIntakeTurn(session, "user", message);
    recordIntakeTurn(session, "assistant", response);
    return { action: "ask", response };
  }

  const aiInterpretation = await interpretIntakeWithOpenAI(session, message, fallbackSlots);
  const slots = {
    ...fallbackSlots,
    ...(aiInterpretation?.slots || {})
  };
  applyIntakeSlots(session, message, slots);
  const hasUsefulSlot = hasUsefulIntakeSlots(slots);

  const missing = nextMissingIntakeField(intake);
  if (missing) {
    intake.askedFor = missing;
    response = intakeAskResponse(missing, intake, aiInterpretation?.assistantMessage, {
      retry: !hasUsefulSlot && !isGreetingOnly(message)
    });
    recordIntakeTurn(session, "user", message);
    recordIntakeTurn(session, "assistant", response);
    return {
      action: "ask",
      response
    };
  }

  const payload = finaliseIntakePayload(intake);
  session.recommendationPayload = payload;
  intake.askedFor = null;
  response = intakeReadyResponse(payload, aiInterpretation?.assistantMessage);
  recordIntakeTurn(session, "user", message);
  recordIntakeTurn(session, "assistant", response);
  return {
    action: "build",
    payload,
    response
  };
}

async function buildRecommendation(from, message, session, recommendationPayload = null) {
  const payload = recommendationPayload || session.recommendationPayload || inferRecommendationPayload(message);
  session.recommendationPayload = payload;
  session.recommendationPending = {
    startedAt: now(),
    payload
  };
  session.previewRecommendation = null;
  session.previewSwap = null;
  session.history.push({ role: "user", content: message });

  const recommendation = await postMiraJson("/api/recommend-fresh", payload);
  session.recommendation = recommendation;
  session.recommendationPending = null;
  session.chatState = {
    likedProductIds: [],
    dislikedProductIds: [],
    lockedProductIds: [],
    preferences: []
  };
  session.history.push({ role: "assistant", content: "I generated a RetailNEXT outfit recommendation." });
  session.updatedAt = now();
  await saveSession(session);

  await sendRecommendationMessages(from, recommendation);
}

async function continueChat(from, message, session) {
  const priorHistory = session.history.slice(-8);
  session.history.push({ role: "user", content: message });
  const data = await postMiraJson("/api/chat", {
    message,
    history: priorHistory,
    currentRecommendation: session.recommendation,
    constraints: chatConstraints(session),
    chatState: session.chatState
  });

  session.chatState = data.chatState || session.chatState;
  session.history.push({ role: "assistant", content: compactText(data.assistantMessage, "I checked the basket.") });
  session.updatedAt = now();

  if (data.action === "preview_update" && data.previewRecommendation) {
    session.previewRecommendation = data.previewRecommendation;
    session.previewSwap = data.previewSwap || null;
  }
  await saveSession(session);

  await safeSendWhatsApp(from, formatChatResult(data));
}

async function handleAsyncMessage(from, message, session, recommendationPayload = null, messageSid = "") {
  const stopTypingPulse = startTypingIndicatorPulse(messageSid);
  try {
    safeSendTypingIndicator(messageSid);
    if (!session.recommendation) {
      await buildRecommendation(from, message, session, recommendationPayload);
      return;
    }
    await continueChat(from, message, session);
  } catch (error) {
    console.error(error);
    session.recommendationPending = null;
    await saveSession(session);
    await safeSendWhatsApp(from, `I hit a demo issue: ${error.message}. You can start over and tell me the occasion, budget and style again.`);
  } finally {
    stopTypingPulse();
  }
}

function markRecommendationPending(session, payload) {
  session.recommendationPending = {
    startedAt: now(),
    payload
  };
  session.updatedAt = now();
}

function isRecommendationPending(session) {
  if (!session?.recommendationPending || session.recommendation) return false;
  const startedAt = Number(session.recommendationPending.startedAt || 0);
  const pending = startedAt > 0 && now() - startedAt < RECOMMENDATION_PENDING_TTL_MS;
  if (!pending) session.recommendationPending = null;
  return pending;
}

function recommendationPendingMessage(session) {
  const payload = session.recommendationPending?.payload || session.recommendationPayload || {};
  const store = payload.store || demoDefaults.store;
  return `I’m already checking the RetailNEXT catalogue and ${store} availability. I’ll send the outfit here as soon as it’s ready.`;
}

function applyPreview(session) {
  if (!session.previewRecommendation) return null;
  const swap = session.previewSwap;
  session.recommendation = session.previewRecommendation;
  session.previewRecommendation = null;
  session.previewSwap = null;
  session.updatedAt = now();
  return swap;
}

function wantsPreviewApplied(text, session) {
  if (!session.previewRecommendation) return false;
  const value = String(text || "").toLowerCase();
  if (/\b(no|nah|not that|don'?t|do not|keep looking|keep the current|leave it)\b/.test(value)) return false;
  return /\b(apply|yes|yeah|yep|ok|okay|that works|looks good|do it|make that change|go with (?:that|those|this|them)|use (?:that|those|this|them|the swap))\b/.test(value);
}

function wantsToSaveOutfit(text, session) {
  if (!session.recommendation) return false;
  return /\b(save|saved|reserve|hold|try(?:\s+it|\s+this|\s+them)?\s+on|try.*store|in[-\s]?store|store visit|send.*notes|email.*notes)\b/i.test(text);
}

function wantsToPurchaseOutfit(text, session) {
  if (!session.recommendation) return false;
  return /\b(buy|purchase|checkout|check out|order|pay|website|site|link|online)\b/i.test(text);
}

function savedOutfitMessage(session) {
  const recommendation = session.recommendation || {};
  const store = recommendation.store || session.recommendationPayload?.store || demoDefaults.store;
  const products = allOutfitProducts(recommendation);
  const availableToday = products.filter((product) => inventoryCount(product, store) > 0).length;
  const count = products.length || recommendation.business?.itemCount || 0;
  const availability = count ? `${availableToday}/${count} pieces are available at ${store} today` : `the look is available at ${store}`;
  return [
    `${waBold("I’ve saved this look for your RetailNEXT store visit.")} ${waItalic(availability)}, so the team can pull it together for you to try on.`,
    "",
    `If you’d rather buy now, you can open the outfit here: ${MIRA_BASE_URL}`
  ].join("\n");
}

function purchaseOutfitMessage(session) {
  const recommendation = session.recommendation || {};
  const store = recommendation.store || session.recommendationPayload?.store || demoDefaults.store;
  return [
    `${waBold("You can buy the outfit now here:")} ${MIRA_BASE_URL}`,
    "",
    `${waItalic(`It’s also in stock at ${store} today`)} if you’d rather try it on first. I can save the look for that store visit if that’s easier.`
  ].join("\n");
}

function updatedOutfitActionMessage(session) {
  const recommendation = session.recommendation || {};
  const store = recommendation.store || session.recommendationPayload?.store || demoDefaults.store;
  return [
    `${waBold("The updated outfit is still in stock")} at ${store} today.`,
    "",
    `Would you like me to save it so you can try it on in store, or would you rather buy it now here: ${MIRA_BASE_URL}`
  ].join("\n");
}

async function handleImmediateCommand(session, message) {
  const text = String(message || "").trim().toLowerCase();

  if (!text || text === "help") {
    return {
      handled: true,
      response: intakeIntroPrompt()
    };
  }

  if (text === "reset" || text === "start over") {
    await deleteSession(session);
    return {
      handled: true,
      response: `I’ve reset this WhatsApp demo session.\n\n${intakeIntroPrompt()}`
    };
  }

  if (text === "apply" || wantsPreviewApplied(text, session)) {
    const swap = applyPreview(session);
    if (!swap) {
      return {
        handled: true,
        response: "I don’t have a swap waiting yet. Tell me what you’d like to change in the outfit, for example the shoes, fit, or colour."
      };
    }
    const swapLine = swap?.from && swap?.to
      ? ` I switched ${waBold(swap.from.productDisplayName)} for ${waBold(swap.to.productDisplayName)}.`
      : "";
    await saveSession(session);
    return {
      handled: true,
      response: [
        `Done. I’ve updated the outfit and kept it grounded in RetailNEXT inventory.${swapLine}`,
        "",
        updatedOutfitActionMessage(session)
      ].join("\n")
    };
  }

  if ((text === "save" || text === "save this outfit" || wantsToSaveOutfit(text, session)) && session.recommendation) {
    return {
      handled: true,
      response: savedOutfitMessage(session)
    };
  }

  if (wantsToPurchaseOutfit(text, session)) {
    return {
      handled: true,
      response: purchaseOutfitMessage(session)
    };
  }

  return { handled: false, session };
}

export async function handleTwilioWebhook(req, res, { schedule = (promise) => { void promise; } } = {}) {
  const form = await readTwilioForm(req);
  const from = compactText(form.From);
  const to = compactText(form.To, TWILIO_WHATSAPP_FROM);
  const message = compactText(form.Body);
  const messageSid = compactText(form.MessageSid || form.SmsMessageSid || form.SmsSid);
  if (!from) return sendXml(res, "I couldn’t identify the WhatsApp sender.");

  const session = await loadSession(from, to);
  const command = await handleImmediateCommand(session, message);
  if (command.handled) return sendXml(res, command.response);

  if (!session.recommendation) {
    if (isRecommendationPending(session)) {
      await saveSession(session);
      await showTypingForFastReply(messageSid);
      return sendXml(res, recommendationPendingMessage(session));
    }

    safeSendTypingIndicator(messageSid);
    const intake = await handleIntakeMessage(session, message);
    if (intake.action === "ask") {
      await saveSession(session);
      await showTypingForFastReply(messageSid, { start: false });
      return sendXml(res, intake.response);
    }
    markRecommendationPending(session, intake.payload);
    await saveSession(session);
    sendXml(res, intake.response);
    schedule(handleAsyncMessage(from, message, session, intake.payload, messageSid));
    return;
  }

  safeSendTypingIndicator(messageSid);
  const ack = session.recommendation
    ? "I’m checking the current outfit against the RetailNEXT catalogue and store availability."
    : "I’m checking the RetailNEXT catalogue, budget and store availability now.";
  sendXml(res, ack);

  schedule(handleAsyncMessage(from, message, session, null, messageSid));
}

export async function handleBridgeRequest(req, res, { schedule } = {}) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/whatsapp/twilio") {
      return await handleTwilioWebhook(req, res, { schedule });
    }

    return sendText(res, 404, "Not found");
  } catch (error) {
    console.error(error);
    if (!res.headersSent) return sendText(res, 500, error.message);
    res.end();
  }
}

function startLocalBridge() {
  const server = createServer((req, res) => handleBridgeRequest(req, res));
  server.listen(PORT, () => {
    console.log(`RetailNEXT WhatsApp bridge running at http://localhost:${PORT}`);
    console.log(`Webhook path: http://localhost:${PORT}/api/whatsapp/twilio`);
    console.log(`Mira API base: ${MIRA_BASE_URL}`);
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      console.log("Twilio credentials are not set. Inbound TwiML replies will work, but async outbound messages will be logged only.");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startLocalBridge();
}
