import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { del, get, put } from "@vercel/blob";

const PORT = Number(process.env.WHATSAPP_BRIDGE_PORT || 4190);
const MIRA_BASE_URL = (process.env.MIRA_BASE_URL || "https://fashion-recommendation-app.vercel.app").replace(/\/$/, "");
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const WHATSAPP_SEND_SPACING_MS = Number(process.env.WHATSAPP_SEND_SPACING_MS || 1300);
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
const SESSION_BLOB_PREFIX = "whatsapp/sessions";

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
    askedFor: null
  };
}

function pruneSessions() {
  const cutoff = now() - SESSION_TTL_MS;
  for (const [from, session] of sessions.entries()) {
    if ((session.updatedAt || session.createdAt || 0) < cutoff) sessions.delete(from);
  }
}

function createSession(from) {
  const session = {
    from,
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
    previewRecommendation: null,
    previewSwap: null
  };
  sessions.set(from, session);
  return session;
}

function normalizeSession(session, from) {
  return {
    ...createSession(from),
    ...(session || {}),
    from,
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
      }
    }
  };
}

function sessionBlobPath(from) {
  const id = Buffer.from(String(from)).toString("base64url");
  return `${SESSION_BLOB_PREFIX}/${id}.json`;
}

function getMemorySession(from) {
  pruneSessions();
  const session = sessions.get(from) || createSession(from);
  session.updatedAt = now();
  return session;
}

async function loadSession(from) {
  pruneSessions();
  if (!BLOB_READ_WRITE_TOKEN) return getMemorySession(from);

  try {
    const blob = await get(sessionBlobPath(from), {
      access: "private",
      useCache: false,
      token: BLOB_READ_WRITE_TOKEN
    });
    if (!blob) return createSession(from);
    const text = await new Response(blob.stream).text();
    const session = normalizeSession(JSON.parse(text), from);
    if ((session.updatedAt || session.createdAt || 0) < now() - SESSION_TTL_MS) {
      await deleteSession(from);
      return createSession(from);
    }
    session.updatedAt = now();
    sessions.set(from, session);
    return session;
  } catch (error) {
    console.warn(`Using in-memory WhatsApp session: ${error.message}`);
    return getMemorySession(from);
  }
}

async function saveSession(session) {
  session.updatedAt = now();
  sessions.set(session.from, session);
  if (!BLOB_READ_WRITE_TOKEN) return;
  await put(sessionBlobPath(session.from), JSON.stringify(session), {
    access: "private",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: BLOB_READ_WRITE_TOKEN
  });
}

async function deleteSession(from) {
  sessions.delete(from);
  if (!BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(sessionBlobPath(from), { token: BLOB_READ_WRITE_TOKEN });
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

function inferBudget(message, fallback = null, { allowBare = false, allowDefaultText = false } = {}) {
  const text = String(message || "");
  const match = text.match(/(?:[$£]\s*(\d{2,5})|\bbudget(?:\s+is|\s+of|\s*:)?\s*[$£]?\s*(\d{2,5})|\b(?:under|below|around|about|max|maximum)\s*[$£]?\s*(\d{2,5}))/i)
    || (allowBare ? text.match(/^\s*(\d{2,5})\s*$/) : null);
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
  if (/\b(minimal|simple|clean|understated|neutral|not loud)\b/.test(text)) return "minimal";
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

async function postMiraJson(path, body) {
  const response = await fetch(`${MIRA_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `${path} returned ${response.status}`);
  }
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWhatsApp(to, body, { mediaUrl = "" } = {}) {
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

function formatRecommendation(recommendation) {
  const event = recommendation.event || "your event";
  const starter = recommendation.reference?.productDisplayName || recommendation.analysis?.item || "your starter item";
  const isFresh = isFreshRecommendation(recommendation);
  const business = recommendation.business || {};
  const basketValue = business.basketValue || (recommendation.outfit || []).reduce((sum, product) => sum + Number(product.price || 0), 0);
  const availableToday = business.availableToday ?? (recommendation.outfit || []).filter((product) => inventoryCount(product, recommendation.store) > 0).length;
  const introLines = (recommendation.analysis?.introLines || [])
    .map((line) => compactText(line))
    .filter(Boolean)
    .slice(0, 2);
  const mission = compactText(recommendation.agent?.mission);
  const styleSignal = compactText(recommendation.agent?.styleSignal);
  const openAiSignal = recommendation.ai?.copyGeneration === "openai" || recommendation.agent?.source === "openai"
    ? "OpenAI-written styling notes, grounded in RetailNEXT catalogue and store data."
    : "Styling notes grounded in RetailNEXT catalogue and store data.";

  return [
    introLines[0] || (isFresh ? `I built a complete outfit for ${String(event).toLowerCase()}.` : `I built this around ${starter} for ${String(event).toLowerCase()}.`),
    introLines[1] || mission || styleSignal || `I checked the look against ${recommendation.store} availability before showing it to you.`,
    "",
    `Basket: $${basketValue} | Available today: ${availableToday}/${(recommendation.outfit || []).length} at ${recommendation.store}`,
    openAiSignal,
    "",
    "I’ll send the pieces with images next.",
    "",
    `Reply "change shoes", "apply", "save", or "reset".`
  ].filter((line) => line !== undefined && line !== null).join("\n");
}

function formatProductCaption(product, recommendation) {
  const store = recommendation.store || "selected store";
  const stock = inventoryCount(product, store);
  return [
    `${roleLabel(product.role || product.articleType)}: ${product.productDisplayName}`,
    `$${product.price} | ${stock} at ${store}`,
    compactText(product.why)
  ].filter(Boolean).join("\n");
}

async function sendRecommendationMessages(from, recommendation) {
  await safeSendWhatsApp(from, formatRecommendation(recommendation));
  for (const product of (recommendation.outfit || []).slice(0, 4)) {
    const imageUrl = absoluteImageUrl(product);
    if (!imageUrl) continue;
    await sleep(WHATSAPP_SEND_SPACING_MS);
    await safeSendWhatsApp(from, formatProductCaption(product, recommendation), { mediaUrl: imageUrl });
  }
  await sleep(WHATSAPP_SEND_SPACING_MS);
  await safeSendWhatsApp(from, `Open the live stylist: ${MIRA_BASE_URL}`);
}

function formatPreview(data) {
  const lines = [compactText(data.assistantMessage, "I found a preview update for this outfit.")];
  if (data.previewSwap?.from && data.previewSwap?.to) {
    lines.push("");
    lines.push(`Preview: ${data.previewSwap.from.productDisplayName} -> ${data.previewSwap.to.productDisplayName}`);
  }
  lines.push("");
  lines.push(`Reply "apply" to update the outfit, or ask for another change.`);
  return lines.join("\n");
}

function formatLookup(data) {
  const lookup = data.lookupResults;
  if (!lookup?.matches?.length) return compactText(data.assistantMessage, "I checked store availability.");
  const matches = lookup.matches.slice(0, 3).map((item, index) => `${index + 1}. ${item.productDisplayName} - $${item.price} (${item.inventoryCount} in store)`);
  return [
    compactText(data.assistantMessage, lookup.summary),
    "",
    matches.join("\n")
  ].join("\n");
}

function formatChatResult(data) {
  if (data.action === "preview_update") return formatPreview(data);
  if (data.action === "availability_lookup") return formatLookup(data);
  return compactText(data.assistantMessage, "I checked the basket.");
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
  return session.intake;
}

function isGreetingOnly(message) {
  return /^(hi|hello|hey|hiya|yo|start|morning|afternoon|evening|good morning|good afternoon|good evening)$/i.test(compactText(message));
}

function intakeIntroPrompt() {
  return [
    "Hi, I’m Mira, RetailNEXT’s stylist. I can build a complete outfit from the catalogue, keep it inside budget, check store availability, and send the pieces with images here.",
    "",
    "What event or moment are you dressing for? For example: first day at a new job, outdoor wedding, business conference, holiday party, or vacation."
  ].join("\n");
}

function intakeQuestion(field, intake) {
  const payload = intake.payload || {};
  if (field === "eventType") return intakeIntroPrompt();
  if (field === "budgetMax") {
    return `Got it — ${eventLabel(payload.eventType)}. What budget should I keep the full outfit under? For example: $400.`;
  }
  if (field === "stylePreference") {
    const budget = payload.budgetMax ? `$${payload.budgetMax}` : "that budget";
    return `Great, I’ll keep it under ${budget}. What style direction do you want: minimal, classic, comfortable, or trend-forward?`;
  }
  return intakeIntroPrompt();
}

function applyIntakeSlots(session, message) {
  const intake = ensureIntake(session);
  const slots = inferPayloadSlots(message, { askedFor: intake.askedFor });
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
    `Perfect — I’ve got ${eventLabel(payload.eventType)}, ${styleLabel(payload.stylePreference)}, and a $${payload.budgetMax} budget.`,
    `Mira is checking the RetailNEXT catalogue, budget and ${payload.store} availability now.`
  ].join("\n");
}

function handleIntakeMessage(session, message) {
  const intake = ensureIntake(session);
  const slots = applyIntakeSlots(session, message);
  const hasUsefulSlot = Object.keys(slots).some((key) => requiredIntakeFields.includes(key) || ["store", "gender", "urgency"].includes(key));

  if (!hasUsefulSlot && isGreetingOnly(message)) {
    intake.askedFor = "eventType";
    return { action: "ask", response: intakeIntroPrompt() };
  }

  const missing = nextMissingIntakeField(intake);
  if (missing) {
    intake.askedFor = missing;
    return { action: "ask", response: intakeQuestion(missing, intake) };
  }

  const payload = finaliseIntakePayload(intake);
  session.recommendationPayload = payload;
  intake.askedFor = null;
  return {
    action: "build",
    payload,
    response: readyToRecommendPrompt(payload)
  };
}

async function buildRecommendation(from, message, session, recommendationPayload = null) {
  const payload = recommendationPayload || session.recommendationPayload || inferRecommendationPayload(message);
  session.recommendationPayload = payload;
  session.previewRecommendation = null;
  session.previewSwap = null;
  session.history.push({ role: "user", content: message });

  const recommendation = await postMiraJson("/api/recommend-fresh", payload);
  session.recommendation = recommendation;
  session.chatState = {
    likedProductIds: [],
    dislikedProductIds: [],
    lockedProductIds: [],
    preferences: []
  };
  session.history.push({ role: "assistant", content: "Mira generated a RetailNEXT outfit recommendation." });
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

async function handleAsyncMessage(from, message, session, recommendationPayload = null) {
  try {
    if (!session.recommendation) {
      await buildRecommendation(from, message, session, recommendationPayload);
      return;
    }
    await continueChat(from, message, session);
  } catch (error) {
    console.error(error);
    await safeSendWhatsApp(from, `Mira hit a demo issue: ${error.message}. Reply "reset" and try the full-outfit prompt again.`);
  }
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

async function handleImmediateCommand(session, message) {
  const text = String(message || "").trim().toLowerCase();

  if (!text || text === "help") {
    return {
      handled: true,
      response: intakeIntroPrompt()
    };
  }

  if (text === "reset" || text === "start over") {
    await deleteSession(session.from);
    return {
      handled: true,
      response: `Mira has reset this WhatsApp demo session.\n\n${intakeIntroPrompt()}`
    };
  }

  if (text === "apply") {
    const swap = applyPreview(session);
    if (!swap) {
      return {
        handled: true,
        response: `There is no preview waiting to apply. Try "change shoes" after Mira builds the outfit.`
      };
    }
    const swapLine = swap?.from && swap?.to
      ? ` Updated ${swap.from.productDisplayName} to ${swap.to.productDisplayName}.`
      : "";
    await saveSession(session);
    return {
      handled: true,
      response: `Done. Mira updated the WhatsApp outfit preview and kept the basket grounded in RetailNEXT inventory.${swapLine}`
    };
  }

  if (text === "save" || text === "save this outfit") {
    return {
      handled: true,
      response: `Saved-look demo step: Mira can send the full styling notes by email from the RetailNEXT flow, with item rationale and store availability included.`
    };
  }

  return { handled: false, session };
}

export async function handleTwilioWebhook(req, res, { schedule = (promise) => { void promise; } } = {}) {
  const form = await readTwilioForm(req);
  const from = compactText(form.From);
  const message = compactText(form.Body);
  if (!from) return sendXml(res, "Mira could not identify the WhatsApp sender.");

  const session = await loadSession(from);
  const command = await handleImmediateCommand(session, message);
  if (command.handled) return sendXml(res, command.response);

  if (!session.recommendation) {
    const intake = handleIntakeMessage(session, message);
    await saveSession(session);
    if (intake.action === "ask") return sendXml(res, intake.response);
    sendXml(res, intake.response);
    schedule(handleAsyncMessage(from, message, session, intake.payload));
    return;
  }

  const ack = session.recommendation
    ? "Mira is checking the current outfit against the RetailNEXT catalogue and store availability."
    : "Mira is checking the RetailNEXT catalogue, budget and store availability now.";
  sendXml(res, ack);

  schedule(handleAsyncMessage(from, message, session));
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
