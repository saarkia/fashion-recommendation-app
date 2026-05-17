import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");
const publicDir = join(root, "public");
const dataDir = join(root, "data");
const imageDir = join(publicDir, "catalog-images");
const PORT = Number(process.env.PORT || 4173);
const VECTOR_DIMS = 3072;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 20000);

const productsPath = join(dataDir, "products.json");
const vectorsPath = join(dataDir, "embeddings.f32");

if (!existsSync(productsPath) || !existsSync(vectorsPath)) {
  console.error("Missing prepared data. Run `npm run prepare:data` first.");
  process.exit(1);
}

const products = JSON.parse(await readFile(productsPath, "utf8"));
const vectorBuffer = await readFile(vectorsPath);
const vectors = new Float32Array(vectorBuffer.buffer, vectorBuffer.byteOffset, vectorBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
const articleTypes = [...new Set(products.map((product) => product.articleType).filter(Boolean))].sort();
const genders = ["Men", "Women", "Boys", "Girls", "Unisex"];
const topArticleTypes = new Set(["Shirts", "Tshirts", "Tops", "Kurtas"]);
const bottomArticleTypes = new Set(["Jeans", "Trousers", "Shorts", "Skirts", "Patiala", "Track Pants", "Rain Trousers"]);
const shoeArticleTypes = new Set(["Casual Shoes", "Sports Shoes", "Formal Shoes", "Heels", "Flats", "Sandals", "Flip Flops"]);
const dressArticleTypes = new Set(["Dresses", "Sarees", "Night suits"]);

const events = {
  "outdoor-spring-wedding": {
    label: "Outdoor Spring Wedding",
    intent: "Needs polished, weather-aware pieces for a spring wedding where availability today matters.",
    seasons: ["Spring", "Summer"],
    usages: ["Formal", "Smart Casual", "Ethnic"],
    colours: ["White", "Blue", "Pink", "Green", "Grey", "Navy Blue", "Beige"],
    avoidColours: ["Black"],
    roleTargets: [
      { role: "statement piece", subCategories: ["Dress", "Topwear", "Saree"], articleTypes: ["Dresses", "Tops", "Shirts", "Kurtas", "Sarees"] },
      { role: "shoe", subCategories: ["Shoes", "Sandal"], articleTypes: ["Heels", "Flats", "Sandals", "Formal Shoes"] },
      { role: "layer", subCategories: ["Topwear"], articleTypes: ["Shirts", "Tops", "Kurtas"] },
      { role: "alternate", subCategories: ["Bottomwear"], articleTypes: ["Trousers", "Skirts", "Jeans"] }
    ],
    insight: "Wedding and garden-party searches are converting poorly when formal shoes are not available same day."
  },
  "first-day-new-job": {
    label: "First Day at a New Job",
    intent: "Needs confidence-building smart casual pieces that feel current but not risky.",
    seasons: ["Fall", "Summer", "Spring"],
    usages: ["Formal", "Smart Casual", "Casual"],
    colours: ["White", "Blue", "Black", "Grey", "Navy Blue", "Brown"],
    avoidColours: ["Orange", "Yellow"],
    roleTargets: [
      { role: "top", subCategories: ["Topwear"], articleTypes: ["Shirts", "Tops", "Tshirts", "Kurtas"] },
      { role: "bottom", subCategories: ["Bottomwear"], articleTypes: ["Trousers", "Jeans", "Skirts"] },
      { role: "shoe", subCategories: ["Shoes"], articleTypes: ["Formal Shoes", "Casual Shoes", "Flats", "Heels"] },
      { role: "backup", subCategories: ["Topwear"], articleTypes: ["Shirts", "Tops"] }
    ],
    insight: "New-job searches skew toward versatile pieces, but customers abandon when they cannot build a complete outfit from one store."
  },
  "holiday-party": {
    label: "Holiday Party",
    intent: "Needs elevated evening pieces with a little contrast and immediate stock visibility.",
    seasons: ["Winter", "Fall"],
    usages: ["Formal", "Smart Casual", "Casual"],
    colours: ["Black", "Red", "Maroon", "Navy Blue", "Gold", "Purple", "Grey"],
    avoidColours: [],
    roleTargets: [
      { role: "party piece", subCategories: ["Dress", "Topwear"], articleTypes: ["Dresses", "Tops", "Shirts"] },
      { role: "shoe", subCategories: ["Shoes", "Sandal"], articleTypes: ["Heels", "Formal Shoes", "Flats"] },
      { role: "contrast", subCategories: ["Bottomwear"], articleTypes: ["Jeans", "Trousers", "Skirts"] },
      { role: "backup", subCategories: ["Topwear"], articleTypes: ["Tshirts", "Tops"] }
    ],
    insight: "Holiday demand clusters around black, red, and metallic looks; substitute logic protects conversion when core sizes sell down."
  },
  "business-conference": {
    label: "Business Conference",
    intent: "Needs travel-friendly professional pieces that can work across sessions and dinners.",
    seasons: ["Fall", "Summer", "Spring"],
    usages: ["Formal", "Smart Casual"],
    colours: ["Black", "White", "Blue", "Grey", "Navy Blue", "Brown"],
    avoidColours: ["Pink", "Orange"],
    roleTargets: [
      { role: "polished top", subCategories: ["Topwear"], articleTypes: ["Shirts", "Tops", "Kurtas"] },
      { role: "shoe", subCategories: ["Shoes"], articleTypes: ["Formal Shoes", "Casual Shoes", "Flats", "Heels"] },
      { role: "bottom", subCategories: ["Bottomwear"], articleTypes: ["Trousers", "Jeans", "Skirts"] },
      { role: "extra top", subCategories: ["Topwear"], articleTypes: ["Shirts", "Tops"] }
    ],
    insight: "Conference shoppers are time compressed; ranking inventory by event fit and local stock reduces associate search time."
  },
  "vacation": {
    label: "Vacation",
    intent: "Needs comfortable, light pieces that are easy to pack and available before travel.",
    seasons: ["Summer", "Spring"],
    usages: ["Casual", "Sports"],
    colours: ["White", "Blue", "Green", "Yellow", "Pink", "Orange", "Multi"],
    avoidColours: [],
    roleTargets: [
      { role: "easy top", subCategories: ["Topwear"], articleTypes: ["Tshirts", "Tops", "Shirts"] },
      { role: "shoe", subCategories: ["Flip Flops", "Sandal", "Shoes"], articleTypes: ["Flip Flops", "Sandals", "Casual Shoes", "Sports Shoes"] },
      { role: "bottom", subCategories: ["Bottomwear"], articleTypes: ["Shorts", "Jeans", "Trousers", "Skirts"] },
      { role: "extra", subCategories: ["Dress", "Topwear"], articleTypes: ["Dresses", "Tshirts", "Tops"] }
    ],
    insight: "Vacation shoppers are highly urgent; surfacing nearby substitutions keeps the basket intact when one store is thin."
  }
};

const styleProfiles = {
  "classic": { label: "Classic", colours: ["White", "Black", "Blue", "Grey", "Navy Blue"], usages: ["Formal", "Smart Casual"] },
  "trend-forward": { label: "Trend Forward", colours: ["Red", "Purple", "Pink", "Multi", "Green"], usages: ["Casual", "Smart Casual"] },
  "minimal": { label: "Minimal", colours: ["White", "Black", "Grey", "Brown", "Navy Blue"], usages: ["Formal", "Casual"] },
  "comfortable": { label: "Comfortable", colours: ["Blue", "White", "Grey", "Green", "Yellow"], usages: ["Casual", "Sports"] }
};

const colourFamilies = {
  Black: ["White", "Grey", "Red", "Blue", "Navy Blue", "Pink"],
  White: ["Blue", "Black", "Grey", "Green", "Pink", "Brown"],
  Blue: ["White", "Grey", "Brown", "Navy Blue", "Yellow"],
  "Navy Blue": ["White", "Grey", "Brown", "Red", "Blue"],
  Grey: ["White", "Black", "Blue", "Pink", "Purple"],
  Brown: ["White", "Blue", "Green", "Grey"],
  Red: ["Black", "White", "Grey", "Navy Blue"],
  Green: ["White", "Brown", "Blue", "Yellow"],
  Pink: ["White", "Grey", "Blue", "Black"],
  Yellow: ["Blue", "White", "Green", "Brown"],
  Purple: ["Grey", "Black", "White"],
  Orange: ["White", "Blue", "Brown"],
  Multi: ["White", "Black", "Blue", "Grey"]
};

function getVector(index) {
  const start = index * VECTOR_DIMS;
  return vectors.subarray(start, start + VECTOR_DIMS);
}

function dot(a, b) {
  let total = 0;
  for (let i = 0; i < VECTOR_DIMS; i += 1) total += a[i] * b[i];
  return total;
}

function averageVector(candidates) {
  const avg = new Float32Array(VECTOR_DIMS);
  if (!candidates.length) return avg;
  for (const product of candidates) {
    const vector = getVector(product.index);
    for (let i = 0; i < VECTOR_DIMS; i += 1) avg[i] += vector[i];
  }
  let norm = 0;
  for (let i = 0; i < VECTOR_DIMS; i += 1) {
    avg[i] /= candidates.length;
    norm += avg[i] * avg[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < VECTOR_DIMS; i += 1) avg[i] /= norm;
  return avg;
}

function normalizeVector(values) {
  const vector = new Float32Array(values.map(Number));
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  return vector;
}

function cleanJson(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
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
      const message = payload.error?.message || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function chatJson(messages, maxTokens = 700) {
  const payload = await openaiFetch("/chat/completions", {
    model: OPENAI_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: maxTokens
  });
  return cleanJson(payload.choices?.[0]?.message?.content || "{}");
}

async function responseWithTools(input, tools, maxOutputTokens = 900) {
  const payload = await openaiFetch("/responses", {
    model: OPENAI_MODEL,
    input,
    tools,
    tool_choice: "auto",
    temperature: 0.2,
    max_output_tokens: maxOutputTokens
  });
  return payload;
}

async function getOpenAIEmbeddings(inputs) {
  const payload = await openaiFetch("/embeddings", {
    model: OPENAI_EMBEDDING_MODEL,
    input: inputs
  });
  return payload.data.map((item) => normalizeVector(item.embedding));
}

async function encodeProductImage(product) {
  const imagePath = join(imageDir, `${product.id}.jpg`);
  const bytes = await readFile(imagePath);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

async function imageForReview(product) {
  if (typeof product.image === "string" && product.image.startsWith("data:image/")) return product.image;
  return encodeProductImage(product);
}

async function analyzeReferenceWithOpenAI(reference, event, style, imageDataUrl) {
  const dataUrl = imageDataUrl || await encodeProductImage(reference);
  const roleList = event.roleTargets.map((slot) => slot.role).join(", ");
  const output = await chatJson([
    {
      role: "system",
      content: "You are a retail styling assistant. Return only valid JSON. Use concise catalog-search language, not prose."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Analyze this starter clothing image for a fashion recommendation flow.

Context:
- Event: ${event.label}
- Event intent: ${event.intent}
- Style preference: ${style.label}
- The uploaded/starter item is already owned by the customer and should be treated as the anchor, not as an item to replace.
- Needed outfit roles: ${roleList}
- Allowed genders: ${genders.join(", ")}
- Catalog article types include: ${articleTypes.slice(0, 80).join(", ")}

Return JSON with this shape:
{
  "item_type": "catalog-like article type",
  "category": "catalog-like category",
  "color": "dominant color",
  "gender": "one allowed gender",
  "usage": "Casual, Formal, Smart Casual, Sports, Ethnic, or General",
  "season": "Spring, Summer, Fall, Winter, or General",
  "style_notes": ["short visual/style note", "short visual/style note"],
  "occasion_fit": "one sentence on how the starter item affects the event outfit",
  "suggested_searches": [
    { "role": "statement piece", "query": "search phrase for catalog retrieval" }
  ]
}
Create one suggested_searches item for each needed outfit role. Search phrases should look for complementary pieces that complete the outfit. Avoid near-duplicates of the starter item, such as another plain t-shirt when the customer uploaded a t-shirt.`
        },
        {
          type: "image_url",
          image_url: { url: dataUrl, detail: "low" }
        }
      ]
    }
  ]);

  return {
    item_type: output.item_type || reference.articleType,
    category: output.category || reference.subCategory,
    color: output.color || reference.baseColour,
    gender: genders.includes(output.gender) ? output.gender : reference.gender,
    usage: output.usage || reference.usage || "General",
    season: output.season || reference.season || "General",
    style_notes: Array.isArray(output.style_notes) ? output.style_notes.slice(0, 3) : [],
    occasion_fit: output.occasion_fit || event.intent,
    suggested_searches: Array.isArray(output.suggested_searches) ? output.suggested_searches : []
  };
}

function localAnalysis(reference, event, style) {
  return {
    item_type: reference.articleType,
    category: reference.subCategory,
    color: reference.baseColour,
    gender: reference.gender,
    usage: reference.usage,
    season: reference.season,
    style_notes: [`${reference.baseColour} ${reference.articleType}`, `${reference.usage || "General"} catalog item`],
    occasion_fit: event.intent,
    suggested_searches: event.roleTargets.map((slot) => ({
      role: slot.role,
      query: `${style.label} ${slot.role} for ${event.label}`
    }))
  };
}

function displayStarterName(analysis) {
  const color = analysis.color && analysis.color !== "Neutral" ? `${analysis.color} ` : "";
  return `Uploaded ${color}${analysis.item_type || "clothing item"}`.replace(/\s+/g, " ").trim();
}

function customReferenceFromAnalysis(analysis, imageDataUrl) {
  return {
    id: "uploaded",
    index: null,
    gender: analysis.gender || "Unisex",
    masterCategory: "Apparel",
    subCategory: analysis.category || "Uploaded image",
    articleType: analysis.item_type || "Clothing",
    baseColour: analysis.color || "Neutral",
    season: analysis.season || "General",
    year: "",
    usage: analysis.usage || "General",
    productDisplayName: displayStarterName(analysis),
    price: 0,
    inventory: {},
    trendScore: 75,
    image: imageDataUrl
  };
}

async function buildReferenceVector(reference, analysis, event, style, gender) {
  if (Number.isInteger(reference.index)) return getVector(reference.index);
  if (OPENAI_API_KEY) {
    const text = [
      analysis.color,
      analysis.gender,
      analysis.item_type,
      analysis.category,
      analysis.usage,
      analysis.season,
      ...(analysis.style_notes || []),
      analysis.occasion_fit
    ].filter(Boolean).join(" ");
    const [embedding] = await getOpenAIEmbeddings([text || `${style.label} outfit for ${event.label}`]);
    return embedding;
  }
  const exemplars = products
    .filter((product) => sameAudience(product, gender))
    .map((product) => ({ product, affinity: eventAffinity(product, event, style) }))
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, 12)
    .map((item) => item.product);
  return averageVector(exemplars);
}

function searchForRole(analysis, slot, event, style) {
  const aiSuggestion = analysis.suggested_searches.find((item) => item.role === slot.role);
  return aiSuggestion?.query || `${style.label} ${slot.role} for ${event.label}`;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function sameAudience(product, gender) {
  const adultGender = gender === "Men" || gender === "Women";
  const childProduct = product.gender === "Boys" || product.gender === "Girls" || /\b(kids?|boys?|girls?)\b/i.test(product.productDisplayName);
  if (adultGender && childProduct) return false;
  return product.gender === gender || product.gender === "Unisex" || gender === "Unisex";
}

function eventAffinity(product, event, style) {
  let score = 0.35;
  if (event.usages.includes(product.usage)) score += 0.22;
  if (event.seasons.includes(product.season)) score += 0.14;
  if (event.colours.includes(product.baseColour)) score += 0.12;
  if (event.avoidColours.includes(product.baseColour)) score -= 0.12;
  if (style.usages.includes(product.usage)) score += 0.08;
  if (style.colours.includes(product.baseColour)) score += 0.07;
  return clamp(score);
}

function colourHarmony(reference, product) {
  if (reference.baseColour === product.baseColour) return 0.7;
  const pairings = colourFamilies[reference.baseColour] || [];
  if (pairings.includes(product.baseColour)) return 1;
  if (product.baseColour === "Multi") return 0.72;
  return 0.48;
}

function inventoryScore(product, store, urgency) {
  const localStock = product.inventory[store] || 0;
  const allStock = Object.values(product.inventory).reduce((sum, qty) => sum + qty, 0);
  if (urgency === "today") return localStock > 0 ? Math.min(1, 0.58 + localStock / 10) : 0;
  return allStock > 0 ? Math.min(1, 0.5 + allStock / 22) : 0;
}

function slotMatches(product, slot) {
  if (slot.disallowArticleTypes?.includes(product.articleType)) return false;
  if (slot.articleTypes.length) return slot.articleTypes.includes(product.articleType);
  return slot.subCategories.includes(product.subCategory);
}

function productGroup(articleType = "", subCategory = "") {
  const type = String(articleType);
  const sub = String(subCategory).toLowerCase();
  if (shoeArticleTypes.has(type) || ["shoes", "sandal", "flip flops"].includes(sub)) return "shoe";
  if (bottomArticleTypes.has(type) || sub === "bottomwear") return "bottom";
  if (dressArticleTypes.has(type) || ["dress", "saree", "apparel set"].includes(sub)) return "one-piece";
  if (topArticleTypes.has(type) || sub === "topwear") return "top";
  return "other";
}

function starterGroup(analysis) {
  const text = `${analysis.item_type || ""} ${analysis.category || ""}`.toLowerCase();
  if (/(shoe|sandal|heel|flat|sneaker|boot|flip)/.test(text)) return "shoe";
  if (/(trouser|pant|jean|short|skirt|bottom|legging|stocking)/.test(text)) return "bottom";
  if (/(dress|saree|kurta set|jumpsuit|one[- ]?piece)/.test(text)) return "one-piece";
  if (/(t-?shirt|tee|shirt|top|kurta|blouse|sweater|hoodie)/.test(text)) return "top";
  return "other";
}

function slotGroup(slot) {
  const groups = slot.articleTypes.map((type) => productGroup(type, "")).filter((group) => group !== "other");
  if (groups.includes("shoe")) return "shoe";
  if (groups.includes("bottom")) return "bottom";
  if (groups.includes("one-piece")) return "one-piece";
  if (groups.includes("top")) return "top";
  return "other";
}

function outfitRole(product, slot) {
  const group = productGroup(product.articleType, product.subCategory);
  if (group === "shoe") return "shoes";
  if (group === "bottom") {
    if (/trouser/i.test(product.articleType)) return "trousers";
    if (/jean/i.test(product.articleType)) return "jeans";
    if (/skirt/i.test(product.articleType)) return "skirt";
    if (/short/i.test(product.articleType)) return "shorts";
    return "bottom";
  }
  if (group === "one-piece") return "one-piece";
  if (group === "top" && /layer|overshirt/i.test(slot.role)) return "layer";
  if (group === "top") return "top";
  return slot.role;
}

function uniqueSlots(slots) {
  const seen = new Set();
  return slots.filter((slot) => {
    const group = slot.allowSameGroup ? slot.role : slotGroup(slot);
    const key = `${group}:${slot.allowSameGroup ? slot.articleTypes.join("|") : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function complementarySlots(event, analysis) {
  const group = starterGroup(analysis);
  const topLayer = {
    role: "layer / overshirt",
    subCategories: ["Topwear"],
    articleTypes: ["Shirts", "Kurtas", "Tops"],
    allowSameGroup: true,
    disallowArticleTypes: ["Tshirts"]
  };
  const bottom = { role: "bottom", subCategories: ["Bottomwear"], articleTypes: ["Trousers", "Jeans", "Shorts", "Skirts", "Rain Trousers", "Patiala"] };
  const shoe = { role: "shoe", subCategories: ["Shoes", "Sandal", "Flip Flops"], articleTypes: ["Formal Shoes", "Casual Shoes", "Sports Shoes", "Heels", "Flats", "Sandals", "Flip Flops"] };
  const top = { role: "top", subCategories: ["Topwear"], articleTypes: ["Shirts", "Tops", "Kurtas"] };

  const base = event.roleTargets
    .filter((slot) => {
      const groupMatch = slotGroup(slot) === group;
      const isBackup = /backup|extra|alternate/i.test(slot.role) && groupMatch;
      return !groupMatch && !isBackup;
    })
    .filter((slot) => !/backup/i.test(slot.role));

  const additions = [];
  if (group === "top") additions.push(bottom, shoe);
  else if (group === "bottom") additions.push(top, shoe, topLayer);
  else if (group === "shoe") additions.push(top, bottom, topLayer);
  else if (group === "one-piece") additions.push(shoe, topLayer);
  else additions.push(top, bottom, shoe);

  return uniqueSlots([...base, ...additions]).slice(0, 4);
}

function isTooSimilarToStarter(product, analysis, slot) {
  const pGroup = productGroup(product.articleType, product.subCategory);
  const sGroup = starterGroup(analysis);
  const starterType = String(analysis.item_type || "").toLowerCase();
  const productType = String(product.articleType || "").toLowerCase();
  if (slot.disallowArticleTypes?.includes(product.articleType)) return true;
  if (starterType && productType && starterType.replace(/s$/, "") === productType.replace(/s$/, "")) return true;
  if (sGroup !== "other" && sGroup === pGroup) return true;
  return false;
}

function buildEventQueryVector(event, style, gender, slot) {
  const exemplars = products
    .filter((product) => sameAudience(product, gender))
    .filter((product) => slotMatches(product, slot))
    .map((product) => ({ product, affinity: eventAffinity(product, event, style) }))
    .sort((a, b) => b.affinity - a.affinity || b.product.trendScore - a.product.trendScore)
    .slice(0, 12)
    .map((item) => item.product);
  return averageVector(exemplars);
}

function candidateScore(product, context) {
  const { reference, referenceVector, eventVector, event, style, store, urgency, budgetMax } = context;
  const vector = getVector(product.index);
  const semanticToEvent = (dot(eventVector, vector) + 1) / 2;
  const semanticToReference = (dot(referenceVector, vector) + 1) / 2;
  const eventFit = eventAffinity(product, event, style);
  const stockFit = inventoryScore(product, store, urgency);
  const colourFit = colourHarmony(reference, product);
  const priceFit = product.price <= budgetMax ? 1 : Math.max(0, 1 - (product.price - budgetMax) / budgetMax);
  const trendFit = product.trendScore / 100;

  return (
    semanticToEvent * 0.28 +
    eventFit * 0.24 +
    stockFit * 0.18 +
    semanticToReference * 0.12 +
    colourFit * 0.1 +
    priceFit * 0.05 +
    trendFit * 0.03
  );
}

function guardrail(reference, product, event, store, urgency) {
  const checks = [
    { label: "Different role than starter item", pass: product.articleType !== reference.articleType && product.subCategory !== reference.subCategory },
    { label: "Fits event context", pass: event.usages.includes(product.usage) || event.seasons.includes(product.season) },
    { label: "Color palette works", pass: colourHarmony(reference, product) >= 0.7 },
    { label: urgency === "today" ? "Available today in selected store" : "Available in network", pass: urgency === "today" ? (product.inventory[store] || 0) > 0 : Object.values(product.inventory).some((qty) => qty > 0) }
  ];
  const passCount = checks.filter((check) => check.pass).length;
  return {
    approved: passCount >= 3,
    score: Math.round((passCount / checks.length) * 100),
    checks
  };
}

function whyThisWorks(product, reference, event, store) {
  const parts = [];
  if (event.usages.includes(product.usage)) parts.push(`${product.usage.toLowerCase()} use matches the occasion`);
  if (event.seasons.includes(product.season)) parts.push(`${product.season.toLowerCase()} seasonality fits the event`);
  if (colourHarmony(reference, product) >= 0.7) parts.push(`${product.baseColour.toLowerCase()} pairs with the ${reference.baseColour.toLowerCase()} starter item`);
  if ((product.inventory[store] || 0) > 0) parts.push(`${product.inventory[store]} available at ${store}`);
  return parts.slice(0, 3).join("; ") + ".";
}

function eventByLabel(label) {
  return Object.values(events).find((event) => event.label === label) || events["outdoor-spring-wedding"];
}

function styleByLabel(label) {
  return Object.values(styleProfiles).find((style) => style.label === label) || styleProfiles.classic;
}

function analysisForRecommendation(recommendation) {
  const attrs = recommendation?.analysis?.structuredAttributes || {};
  return {
    item_type: attrs.item_type || recommendation?.reference?.articleType || "Clothing",
    category: attrs.category || recommendation?.reference?.subCategory || "Apparel",
    color: attrs.color || recommendation?.reference?.baseColour || "Neutral",
    gender: attrs.gender || recommendation?.reference?.gender || "Unisex",
    usage: attrs.usage || recommendation?.reference?.usage || "General",
    season: attrs.season || recommendation?.reference?.season || "General",
    style_notes: recommendation?.analysis?.styleNotes || [],
    occasion_fit: recommendation?.analysis?.generatedNeed || ""
  };
}

function roleSlotForProduct(product, role = "alternative") {
  const group = productGroup(product.articleType, product.subCategory);
  if (group === "shoe") {
    return { role, subCategories: ["Shoes", "Sandal", "Flip Flops"], articleTypes: ["Formal Shoes", "Casual Shoes", "Sports Shoes", "Heels", "Flats", "Sandals", "Flip Flops"] };
  }
  if (group === "bottom") {
    return { role, subCategories: ["Bottomwear"], articleTypes: ["Trousers", "Jeans", "Shorts", "Skirts", "Rain Trousers", "Patiala"] };
  }
  if (group === "one-piece") {
    return { role, subCategories: ["Dress", "Saree"], articleTypes: ["Dresses", "Sarees"] };
  }
  if (group === "top") {
    return { role, subCategories: ["Topwear"], articleTypes: ["Shirts", "Tshirts", "Tops", "Kurtas"], allowSameGroup: true };
  }
  return { role, subCategories: [product.subCategory].filter(Boolean), articleTypes: [product.articleType].filter(Boolean) };
}

function mergeChatState(previous = {}, next = {}) {
  const mergeIds = (a, b) => [...new Set([...(a || []), ...(b || [])].map(Number).filter(Boolean))];
  const mergeText = (a, b) => [...new Set([...(a || []), ...(b || [])].map(String).filter(Boolean))].slice(-12);
  return {
    likedProductIds: mergeIds(previous.likedProductIds, next.likedProductIds),
    dislikedProductIds: mergeIds(previous.dislikedProductIds, next.dislikedProductIds),
    lockedProductIds: mergeIds(previous.lockedProductIds, next.lockedProductIds),
    preferences: mergeText(previous.preferences, next.preferences)
  };
}

function inferChatIntent(message, recommendation, chatState = {}) {
  const text = String(message || "").toLowerCase();
  const outfit = recommendation?.outfit || [];
  const locked = new Set((chatState.lockedProductIds || []).map(Number));
  let target = null;
  const findByGroup = (group) => outfit.find((product) => productGroup(product.articleType, product.subCategory) === group && !locked.has(product.id));

  if (/\b(shoe|shoes|sneaker|sneakers|heel|heels|flat|flats|sandal|sandals)\b/.test(text)) target = findByGroup("shoe");
  else if (/\b(trouser|trousers|pant|pants|jean|jeans|bottom|skirt|shorts)\b/.test(text)) target = findByGroup("bottom");
  else if (/\b(shirt|top|tee|tshirt|t-shirt|overshirt|layer)\b/.test(text)) target = findByGroup("top");
  else if (/\b(cheaper|lower|budget|less expensive|price)\b/.test(text)) {
    target = outfit
      .filter((product) => !locked.has(product.id))
      .sort((a, b) => b.price - a.price)[0];
  } else if (/\b(dislike|don't like|dont like|not into|swap|change|replace|alternative|different)\b/.test(text)) {
    target = outfit.find((product) => !locked.has(product.id));
  }

  const preferences = [];
  if (/\b(cheaper|lower|budget|less expensive|price)\b/.test(text)) preferences.push("lower price");
  if (/\b(formal|polished|professional|dressier|elevated)\b/.test(text)) preferences.push("more formal");
  if (/\b(casual|relaxed|comfortable|laid back)\b/.test(text)) preferences.push("more casual");
  if (/\b(color|colour|brighter|darker|different color|different colour)\b/.test(text)) preferences.push("different color");
  if (/\b(today|available|in store|pickup)\b/.test(text)) preferences.push("available today");

  const lockedFromMessage = outfit
    .filter((product) => text.includes(String(product.productDisplayName || "").toLowerCase()) && /\b(keep|like|love|save)\b/.test(text))
    .map((product) => product.id);

  return {
    wantsExplanation: /\b(why|explain|rationale|reason)\b/.test(text),
    wantsChange: Boolean(target) || /\b(cheaper|formal|casual|swap|change|replace|alternative|different|available)\b/.test(text),
    targetProductId: target?.id || null,
    targetRole: target?.role || null,
    goal: preferences.join(", ") || "find a better alternative",
    preferences,
    lockedProductIds: lockedFromMessage
  };
}

function parseFunctionCalls(payload) {
  return (payload?.output || [])
    .filter((item) => item?.type === "function_call")
    .map((item) => {
      let args = {};
      try {
        args = JSON.parse(item.arguments || "{}");
      } catch {
        args = {};
      }
      return { name: item.name, arguments: args, callId: item.call_id };
    });
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

function explainCurrentBasket(recommendation) {
  const lines = [
    recommendation?.analysis?.outfitRationale,
    ...(recommendation?.outfit || []).map((product) => `${product.productDisplayName}: ${product.why}`)
  ].filter(Boolean);
  return lines.join("\n");
}

async function findAlternativeProducts({ recommendation, chatState, args, message }) {
  const event = eventByLabel(recommendation.event);
  const style = styleByLabel(recommendation.style);
  const store = recommendation.store;
  const urgency = recommendation.urgency;
  const reference = recommendation.reference;
  const analysis = analysisForRecommendation(recommendation);
  const outfit = recommendation.outfit || [];
  const inferred = inferChatIntent(message, recommendation, chatState);
  const targetId = Number(args.targetProductId || inferred.targetProductId);
  const target = outfit.find((product) => product.id === targetId) || outfit[0];
  if (!target) return { target: null, candidates: [] };

  const goal = [args.goal, inferred.goal, ...(chatState.preferences || [])].filter(Boolean).join("; ");
  const selected = new Set(outfit.map((product) => product.id));
  selected.delete(target.id);
  const blocked = new Set([...(chatState.dislikedProductIds || []), target.id].map(Number));
  const slot = roleSlotForProduct(target, target.role);
  const gender = analysis.gender || reference.gender;
  const budgetMax = Math.max(target.price + 80, recommendation.business?.basketValue || 300);
  let eventVector;

  try {
    if (OPENAI_API_KEY) {
      [eventVector] = await getOpenAIEmbeddings([`${goal}. Alternative ${target.role || target.articleType} for ${event.label}: ${target.productDisplayName}`]);
    }
  } catch {
    eventVector = null;
  }

  if (!eventVector) eventVector = buildEventQueryVector(event, style, gender, slot);

  const referenceVector = Number.isInteger(reference.index)
    ? getVector(reference.index)
    : buildEventQueryVector(event, style, gender, slot);
  const cheaper = /\b(cheaper|lower|budget|less expensive|price)\b/i.test(goal);
  const formal = /\b(formal|polished|professional|dressier|elevated)\b/i.test(goal);
  const casual = /\b(casual|relaxed|comfortable|laid back)\b/i.test(goal);
  const differentColor = /\b(color|colour|brighter|darker|different color|different colour)\b/i.test(goal);
  const today = urgency === "today" || /\b(today|available|in store|pickup)\b/i.test(goal);

  const candidates = products
    .filter((product) => !selected.has(product.id) && !blocked.has(product.id))
    .filter((product) => sameAudience(product, gender))
    .filter((product) => slotMatches(product, slot))
    .filter((product) => today ? (product.inventory[store] || 0) > 0 : Object.values(product.inventory).some((qty) => qty > 0))
    .filter((product) => cheaper ? product.price < target.price : product.price <= Math.max(target.price + 120, 180))
    .map((product) => {
      let score = candidateScore(product, { reference, referenceVector, eventVector, event, style, store, urgency, budgetMax });
      if (formal && product.usage === "Formal") score += 0.16;
      if (formal && product.usage === "Casual") score -= 0.08;
      if (casual && ["Casual", "Sports"].includes(product.usage)) score += 0.16;
      if (casual && product.usage === "Formal") score -= 0.08;
      if (cheaper) score += Math.max(0, (target.price - product.price) / Math.max(target.price, 1)) * 0.18;
      if (differentColor && product.baseColour !== target.baseColour) score += 0.1;
      return { product, score, fit: guardrail(reference, product, event, store, urgency) };
    })
    .filter((item) => item.fit.approved || !today)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => ({
      ...item.product,
      role: target.role,
      score: Math.round(clamp(item.score, 0, 1) * 100),
      guardrail: item.fit,
      why: whyThisWorks(item.product, reference, event, store),
      retrievalQuery: `${goal || "alternative"} for ${target.role || target.articleType}`
    }));

  return { target, candidates };
}

function substitutionsForOutfit({ outfit, reference, event, style, store, urgency }) {
  const selected = new Set(outfit.map((product) => product.id));
  return outfit.flatMap((product) => {
    const slot = roleSlotForProduct(product, product.role);
    const eventVector = buildEventQueryVector(event, style, product.gender || reference.gender, slot);
    const referenceVector = Number.isInteger(reference.index) ? getVector(reference.index) : eventVector;
    const substitute = products
      .filter((candidate) => !selected.has(candidate.id))
      .filter((candidate) => sameAudience(candidate, product.gender || reference.gender))
      .filter((candidate) => slotMatches(candidate, slot))
      .map((candidate) => ({
        product: candidate,
        score: candidateScore(candidate, { reference, referenceVector, eventVector, event, style, store, urgency, budgetMax: product.price + 90 }),
        fit: guardrail(reference, candidate, event, store, urgency)
      }))
      .filter((item) => item.fit.approved)
      .sort((a, b) => b.score - a.score)[0];
    if (!substitute) return [];
    return [{
      forProductId: product.id,
      ...substitute.product,
      role: product.role,
      score: Math.round(clamp(substitute.score, 0, 1) * 100),
      guardrail: substitute.fit,
      why: `Substitute for ${product.articleType.toLowerCase()} when local stock is low.`
    }];
  }).slice(0, 6);
}

async function finalizeRecommendationPreview({ recommendation, outfit, changeSummary, ai }) {
  const event = eventByLabel(recommendation.event);
  const style = styleByLabel(recommendation.style);
  const store = recommendation.store;
  const urgency = recommendation.urgency;
  const reference = recommendation.reference;
  const analysis = analysisForRecommendation(recommendation);
  const basketValue = outfit.reduce((sum, product) => sum + product.price, 0);
  const availableToday = outfit.filter((product) => (product.inventory[store] || 0) > 0).length;
  const lowStock = outfit.filter((product) => (product.inventory[store] || 0) > 0 && (product.inventory[store] || 0) <= 2);
  const substitutions = substitutionsForOutfit({ outfit, reference, event, style, store, urgency });
  const missed = products
    .filter((product) => sameAudience(product, analysis.gender || reference.gender))
    .filter((product) => event.usages.includes(product.usage) || event.seasons.includes(product.season))
    .filter((product) => (product.inventory[store] || 0) === 0)
    .slice(0, 30);
  let generatedCopy = fallbackBusinessCopy({ reference, event, store, urgency, outfit, missedCount: missed.length, analysis });

  try {
    generatedCopy = await generateBusinessCopy({
      reference,
      event,
      style,
      store,
      urgency,
      outfit,
      substitutions,
      basketValue,
      availableToday,
      missedCount: missed.length,
      analysis
    });
    ai.copyGeneration = generatedCopy.source;
  } catch (error) {
    ai.errors.push(`Chat copy fallback: ${error.message}`);
  }

  try {
    const review = await reviewOutfitWithOpenAI({
      reference,
      event,
      style,
      store,
      urgency,
      outfit,
      basketValue,
      analysis,
      existingCopy: generatedCopy
    });
    generatedCopy = { ...generatedCopy, ...review, itemReasons: review.itemReasons || generatedCopy.itemReasons };
    ai.recommendationReview = review.source;
  } catch (error) {
    ai.errors.push(`Chat recommendation review fallback: ${error.message}`);
  }

  for (const product of outfit) {
    product.why = generatedCopy.itemReasons?.[String(product.id)] || generatedCopy.itemReasons?.[product.id] || product.why;
  }

  return {
    ...recommendation,
    analysis: {
      ...recommendation.analysis,
      introLines: generatedCopy.introLines || recommendation.analysis?.introLines || [],
      outfitRationale: generatedCopy.outfitRationale || changeSummary || recommendation.analysis?.outfitRationale || ""
    },
    ai: {
      ...recommendation.ai,
      ...ai,
      chatAgent: ai.chatAgent || "local"
    },
    outfit,
    substitutions,
    business: {
      basketValue,
      availableToday,
      itemCount: outfit.length,
      lowStockNotes: lowStock.map((product) => `${product.productDisplayName}: ${product.inventory[store]} left at ${store}`),
      demandInsight: generatedCopy.demandInsight,
      associatePrompt: generatedCopy.associatePrompt,
      kpis: [
        { label: "Projected basket", value: `$${basketValue}` },
        { label: "Available today", value: `${availableToday}/${outfit.length}` },
        { label: "Guardrail pass", value: `${Math.round(outfit.reduce((sum, item) => sum + item.guardrail.score, 0) / Math.max(outfit.length, 1))}%` },
        { label: "Substitutes ready", value: substitutions.length.toString() }
      ]
    },
    pipeline: [
      ...(recommendation.pipeline || []),
      "OpenAI stylist chat uses tool calling to explain, capture preferences, retrieve alternatives, and preview basket updates."
    ].slice(-7)
  };
}

function pickInspiration() {
  const preferredIds = new Set([2133, 7143, 4226, 47062, 27152, 2265, 16035, 38932, 53759, 58158]);
  return products
    .filter((product) => preferredIds.has(product.id) || ["Shirts", "Tops", "Tshirts", "Dresses", "Kurtas"].includes(product.articleType))
    .slice(0, 18);
}

function fallbackBusinessCopy({ reference, event, store, urgency, outfit, missedCount, analysis }) {
  const availableToday = outfit.filter((product) => (product.inventory[store] || 0) > 0).length;
  const starter = `${analysis?.color || reference.baseColour} ${analysis?.item_type || reference.articleType}`.toLowerCase();
  return {
    introLines: [
      `I see a ${starter} that can work as the anchor piece for ${event.label.toLowerCase()}.`,
      `I avoided recommending another near-identical item and focused on pieces that complete the outfit.`
    ],
    demandInsight: `${event.insight} In this mock store view, ${missedCount} event-relevant items have no local stock.`,
    associatePrompt: `Hi! I found a ${event.label.toLowerCase()} outfit around your ${reference.baseColour.toLowerCase()} ${reference.articleType.toLowerCase()}. ${availableToday}/${outfit.length} recommended items are available today at ${store}, and I added substitutes in case a size is gone before you arrive.`,
    itemReasons: Object.fromEntries(outfit.map((product) => [product.id, product.why]))
  };
}

async function generateBusinessCopy({ reference, event, style, store, urgency, outfit, substitutions, basketValue, availableToday, missedCount, analysis }) {
  const fallback = fallbackBusinessCopy({ reference, event, store, urgency, outfit, missedCount, analysis });

  if (!OPENAI_API_KEY || outfit.length === 0) return { ...fallback, source: "local" };

  const output = await chatJson([
    {
      role: "system",
      content: "You are a concise retail associate copilot. Return only valid JSON."
    },
    {
      role: "user",
      content: `Write shopper-safe, demo-ready copy for this fashion outfit recommendation.
Address the shopper directly as "you". Do not write "the customer uploaded"; write phrases like "it looks like you uploaded" or "you started with".

Starter item: ${reference.productDisplayName}
Starter image analysis: ${analysis.color} ${analysis.item_type}; category ${analysis.category}; usage ${analysis.usage}; season ${analysis.season}
Event: ${event.label}
Style preference: ${style.label}
Store: ${store}
Urgency: ${urgency}
Basket value: $${basketValue}
Available today: ${availableToday}/${outfit.length}
Mock missed-demand count: ${missedCount}

Outfit items:
${outfit.map((product) => `- id ${product.id}: ${product.productDisplayName}; ${product.articleType}; ${product.baseColour}; $${product.price}; ${product.inventory[store] || 0} in store`).join("\n")}

Substitutions:
${substitutions.slice(0, 4).map((product) => `- for id ${product.forProductId}: ${product.productDisplayName}; ${product.inventory[store] || 0} in store`).join("\n") || "- none"}

Return JSON:
{
  "introLines": ["one sentence speaking directly to the shopper about what they uploaded or selected", "one sentence explaining the recommendation strategy in direct address"],
  "demandInsight": "one sentence about what the recommendation app learns from this request",
  "associatePrompt": "one short SMS/clienteling-style message an associate could send",
  "itemReasons": {
    "PRODUCT_ID": "one concise reason this item works"
  }
}`
    }
  ], 900);

  return {
    demandInsight: output.demandInsight || fallback.demandInsight,
    associatePrompt: output.associatePrompt || fallback.associatePrompt,
    introLines: Array.isArray(output.introLines) ? output.introLines.slice(0, 2) : fallback.introLines,
    itemReasons: output.itemReasons || fallback.itemReasons,
    source: "openai"
  };
}

async function reviewOutfitWithOpenAI({ reference, event, style, store, urgency, outfit, basketValue, analysis, existingCopy }) {
  const fallback = {
    introLines: existingCopy.introLines,
    outfitRationale: "The outfit was built by treating the uploaded item as the anchor, then adding complementary pieces that fit the occasion, budget, and local availability.",
    itemReasons: existingCopy.itemReasons,
    associatePrompt: existingCopy.associatePrompt,
    demandInsight: existingCopy.demandInsight,
    source: "local"
  };

  if (!OPENAI_API_KEY || outfit.length === 0) return fallback;

  const content = [
    {
      type: "text",
      text: `You are the final stylist QA pass for a fashion recommendation system.

Review the uploaded/starter item, the actual retrieved catalog recommendations, and the shopper-facing explanation. The shopper already owns or likes the starter item, so the goal is to complete the outfit, not replace the starter item.
Any shopper-visible copy must address the shopper directly as "you". Do not write "the customer uploaded"; write phrases like "it looks like you uploaded" or "you started with".

This is the final AI guardrail pass. Verify:
- Does this outfit actually work for the starter item, event, style, budget, and availability?
- Are any recommendations too similar to the starter item or otherwise misleading?
- Does the explanation make sense for the specific products shown?
- If the catalog is limited, is the explanation honest about tradeoffs?

Context:
- Event: ${event.label}
- Style preference: ${style.label}
- Store: ${store}
- Urgency: ${urgency}
- Basket value: $${basketValue}
- Starter analysis: ${analysis.color} ${analysis.item_type}; category ${analysis.category}; usage ${analysis.usage}; season ${analysis.season}

Images:
- Image 1 is the uploaded/starter item.
${outfit.map((product, index) => `- Image ${index + 2} is product id ${product.id}: ${product.productDisplayName}; role ${product.role}; ${product.articleType}; ${product.baseColour}; $${product.price}; ${product.inventory[store] || 0} in store; retrieval query "${product.retrievalQuery}"`).join("\n")}

Return JSON:
{
  "introLines": [
    "specific sentence speaking directly to the shopper about what they uploaded or selected",
    "specific sentence explaining the recommendation strategy in direct address"
  ],
  "outfitRationale": "2 short sentences explaining the guardrail verdict: whether this set works as a basket and whether the explanation is faithful, including any tradeoff if the catalog is limited",
  "itemReasons": {
    "PRODUCT_ID": "specific reason this selected product complements the uploaded item and event; do not use generic phrases"
  },
  "associatePrompt": "short associate/clienteling message grounded in the selected products",
  "demandInsight": "one sentence executive insight grounded in this search"
}

Be honest. If a product is only a decent substitute because the sample catalog is limited, say so in polished retail language. Do not claim products are ideal if they are merely the best available match. Do not approve a rationale that is generic or inconsistent with the product images/metadata.`
        + `\nThe itemReasons object must include every product id exactly: ${outfit.map((product) => product.id).join(", ")}.`
    },
    { type: "image_url", image_url: { url: await imageForReview(reference), detail: "low" } }
  ];

  for (const product of outfit) {
    content.push({ type: "image_url", image_url: { url: await imageForReview(product), detail: "low" } });
  }

  const output = await chatJson([
    {
      role: "system",
      content: "You are a precise retail stylist and recommendation quality reviewer. Return only valid JSON."
    },
    { role: "user", content }
  ], 1100);

  return {
    introLines: Array.isArray(output.introLines) ? output.introLines.slice(0, 2) : fallback.introLines,
    outfitRationale: output.outfitRationale || fallback.outfitRationale,
    itemReasons: {
      ...fallback.itemReasons,
      ...(output.itemReasons || {})
    },
    associatePrompt: output.associatePrompt || fallback.associatePrompt,
    demandInsight: output.demandInsight || fallback.demandInsight,
    source: "openai"
  };
}

async function recommend(payload) {
  const event = events[payload.eventType] || events["outdoor-spring-wedding"];
  const style = styleProfiles[payload.stylePreference] || styleProfiles.classic;
  const store = payload.store || "Chicago Loop";
  const urgency = payload.urgency || "today";
  const budgetMax = Number(payload.budgetMax || 325);
  const imageDataUrl = typeof payload.imageDataUrl === "string" && payload.imageDataUrl.startsWith("data:image/") ? payload.imageDataUrl : null;
  let reference = imageDataUrl
    ? {
        id: "uploaded",
        index: null,
        gender: "Unisex",
        masterCategory: "Apparel",
        subCategory: "Uploaded image",
        articleType: "Clothing",
        baseColour: "Neutral",
        season: "General",
        year: "",
        usage: "General",
        productDisplayName: "Uploaded starter item",
        price: 0,
        inventory: {},
        trendScore: 75,
        image: imageDataUrl
      }
    : products.find((product) => product.id === Number(payload.inspirationId)) || products[0];
  const ai = {
    enabled: Boolean(OPENAI_API_KEY),
    imageAnalysis: "local",
    queryEmbeddings: "local",
    copyGeneration: "local",
    recommendationReview: "local",
    model: OPENAI_MODEL,
    embeddingModel: OPENAI_EMBEDDING_MODEL,
    errors: []
  };

  let analysis = localAnalysis(reference, event, style);
  if (OPENAI_API_KEY) {
    try {
      analysis = await analyzeReferenceWithOpenAI(reference, event, style, imageDataUrl);
      ai.imageAnalysis = "openai";
    } catch (error) {
      ai.errors.push(`Image analysis fallback: ${error.message}`);
    }
  }

  if (imageDataUrl) reference = customReferenceFromAnalysis(analysis, imageDataUrl);
  const gender = payload.gender || analysis.gender || reference.gender;
  let referenceVector;
  try {
    referenceVector = await buildReferenceVector(reference, analysis, event, style, gender);
  } catch (error) {
    ai.errors.push(`Reference embedding fallback: ${error.message}`);
    referenceVector = buildEventQueryVector(event, style, gender, event.roleTargets[0]);
  }
  const slots = complementarySlots(event, analysis);
  const selected = new Set([reference.id]);
  const queryStrings = slots.map((slot) => searchForRole(analysis, slot, event, style));
  let liveQueryVectors = null;

  if (OPENAI_API_KEY) {
    try {
      liveQueryVectors = await getOpenAIEmbeddings(queryStrings);
      ai.queryEmbeddings = "openai";
    } catch (error) {
      ai.errors.push(`Embedding fallback: ${error.message}`);
    }
  }

  const outfit = [];
  const substitutions = [];
  let remainingBudget = budgetMax;

  for (const [slotIndex, slot] of slots.entries()) {
    const remainingSlots = slots.length - slotIndex - 1;
    const slotBudget = Math.max(45, remainingBudget - remainingSlots * 45);
    const eventVector = liveQueryVectors?.[slotIndex] || buildEventQueryVector(event, style, gender, slot);
    const ranked = products
      .filter((product) => !selected.has(product.id))
      .filter((product) => sameAudience(product, gender))
      .filter((product) => slotMatches(product, slot))
      .filter((product) => !isTooSimilarToStarter(product, analysis, slot))
      .filter((product) => product.price <= slotBudget)
      .map((product) => {
        const score = candidateScore(product, { reference, referenceVector, eventVector, event, style, store, urgency, budgetMax: slotBudget });
        const fit = guardrail(reference, product, event, store, urgency);
        return { product, score, fit };
      })
      .filter((item) => item.fit.approved || urgency !== "today")
      .sort((a, b) => b.score - a.score);

    const primary = ranked[0];
    if (!primary) continue;
    selected.add(primary.product.id);
    remainingBudget -= primary.product.price;
    outfit.push({
      ...primary.product,
      role: outfitRole(primary.product, slot),
      score: Math.round(primary.score * 100),
      guardrail: primary.fit,
      why: whyThisWorks(primary.product, reference, event, store),
      retrievalQuery: queryStrings[slotIndex]
    });

    const substitute = ranked.find((item) => item.product.id !== primary.product.id && (item.product.inventory[store] || 0) >= (primary.product.inventory[store] || 0));
    if (substitute) {
      substitutions.push({
        forProductId: primary.product.id,
        ...substitute.product,
        role: outfitRole(substitute.product, slot),
        score: Math.round(substitute.score * 100),
        why: `Substitute for ${primary.product.articleType.toLowerCase()} when local stock is low.`
      });
    }
  }

  const basketValue = outfit.reduce((sum, product) => sum + product.price, 0);
  const availableToday = outfit.filter((product) => (product.inventory[store] || 0) > 0).length;
  const lowStock = outfit.filter((product) => (product.inventory[store] || 0) > 0 && (product.inventory[store] || 0) <= 2);
  const missed = products
    .filter((product) => sameAudience(product, gender))
    .filter((product) => event.usages.includes(product.usage) || event.seasons.includes(product.season))
    .filter((product) => (product.inventory[store] || 0) === 0)
    .slice(0, 30);
  let generatedCopy;
  try {
    generatedCopy = await generateBusinessCopy({
      reference,
      event,
      style,
      store,
      urgency,
      outfit,
      substitutions,
      basketValue,
      availableToday,
      missedCount: missed.length,
      analysis
    });
    ai.copyGeneration = generatedCopy.source;
  } catch (error) {
    ai.errors.push(`Copy generation fallback: ${error.message}`);
    generatedCopy = {
      ...fallbackBusinessCopy({
      reference,
      event,
      store,
      urgency,
      outfit,
      missedCount: missed.length,
      analysis
      }),
      source: "local"
    };
  }

  try {
    const review = await reviewOutfitWithOpenAI({
      reference,
      event,
      style,
      store,
      urgency,
      outfit,
      basketValue,
      analysis,
      existingCopy: generatedCopy
    });
    generatedCopy = {
      ...generatedCopy,
      ...review,
      itemReasons: review.itemReasons || generatedCopy.itemReasons
    };
    ai.recommendationReview = review.source;
  } catch (error) {
    ai.errors.push(`Recommendation review fallback: ${error.message}`);
  }

  for (const product of outfit) {
    product.why = generatedCopy.itemReasons[String(product.id)] || generatedCopy.itemReasons[product.id] || product.why;
  }

  return {
    analysis: {
      item: reference.productDisplayName,
      structuredAttributes: {
        item_type: analysis.item_type,
        category: analysis.category,
        color: analysis.color,
        gender: analysis.gender,
        usage: analysis.usage,
        season: analysis.season
      },
      generatedNeed: analysis.occasion_fit,
      styleNotes: analysis.style_notes,
      suggestedSearches: queryStrings,
      introLines: generatedCopy.introLines || [],
      outfitRationale: generatedCopy.outfitRationale || ""
    },
    ai,
    reference,
    event: event.label,
    style: style.label,
    store,
    urgency,
    outfit,
    substitutions,
    business: {
      basketValue,
      availableToday,
      itemCount: outfit.length,
      lowStockNotes: lowStock.map((product) => `${product.productDisplayName}: ${product.inventory[store]} left at ${store}`),
      demandInsight: generatedCopy.demandInsight,
      associatePrompt: generatedCopy.associatePrompt,
      kpis: [
        { label: "Projected basket", value: `$${basketValue}` },
        { label: "Available today", value: `${availableToday}/${outfit.length}` },
        { label: "Guardrail pass", value: `${Math.round(outfit.reduce((sum, item) => sum + item.guardrail.score, 0) / Math.max(outfit.length, 1))}%` },
        { label: "Substitutes ready", value: substitutions.length.toString() }
      ]
    },
    pipeline: [
      ai.imageAnalysis === "openai" ? "OpenAI analyzes the starter image and returns structured styling attributes." : "Local fallback uses catalog metadata as structured starter-item attributes.",
      ai.queryEmbeddings === "openai" ? "OpenAI embeds the generated event-search intents for semantic catalog retrieval." : "Local fallback uses catalog exemplar embeddings for semantic retrieval.",
      "RAG grounds recommendations in catalog items.",
      "Metadata ranking adds store inventory, budget, season, and urgency.",
      ai.copyGeneration === "openai" ? "OpenAI generates associate copy and executive demand insight from the grounded basket." : "Local fallback creates associate copy and demand insight from templates.",
      ai.recommendationReview === "openai" ? "OpenAI performs the final guardrail review: does the outfit work, and does the explanation match the actual products?" : "Local fallback uses rule-based recommendation rationales."
    ]
  };
}

const chatTools = [
  {
    type: "function",
    name: "explain_basket",
    description: "Explain the current grounded basket without changing product recommendations.",
    parameters: {
      type: "object",
      properties: {
        focus: { type: "string", description: "The part of the basket or rationale the customer asked about." }
      },
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "record_preferences",
    description: "Record customer likes, dislikes, locked items, or preference constraints from the conversation.",
    parameters: {
      type: "object",
      properties: {
        likedProductIds: { type: "array", items: { type: "number" } },
        dislikedProductIds: { type: "array", items: { type: "number" } },
        lockedProductIds: { type: "array", items: { type: "number" } },
        preferences: { type: "array", items: { type: "string" } }
      },
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "find_alternatives",
    description: "Search the catalog for grounded alternatives that preserve event, inventory, budget, and starter-item context.",
    parameters: {
      type: "object",
      properties: {
        targetProductId: { type: "number", description: "The current outfit product to replace." },
        targetRole: { type: "string", description: "The outfit role to replace, such as shoe, bottom, or layer." },
        goal: { type: "string", description: "What the alternative should optimize for." }
      },
      required: ["goal"],
      additionalProperties: false
    }
  }
];

function currentConstraintsFromRecommendation(recommendation, payload) {
  return {
    eventType: payload.constraints?.eventType || recommendation.event,
    stylePreference: payload.constraints?.stylePreference || recommendation.style,
    storeId: payload.constraints?.storeId || recommendation.store,
    budgetMax: payload.constraints?.budgetMax || recommendation.business?.basketValue,
    urgency: payload.constraints?.urgency || recommendation.urgency
  };
}

function summarizeForAgent(recommendation, chatState, message, constraints) {
  return `Customer message: ${message}

Current constraints:
${JSON.stringify(constraints)}

Current starter:
- ${recommendation.reference?.productDisplayName}
- ${JSON.stringify(recommendation.analysis?.structuredAttributes || {})}

Current basket:
${(recommendation.outfit || []).map((product) => `- id ${product.id}: ${product.productDisplayName}; role ${product.role}; ${product.articleType}; ${product.baseColour}; ${product.usage}; $${product.price}; ${product.inventory?.[recommendation.store] || 0} in ${recommendation.store}; reason: ${product.why}`).join("\n")}

Remembered chat preferences:
${JSON.stringify(chatState)}

Use tools when you need catalog truth. If the customer asks "why", call explain_basket. If they express likes/dislikes or ask for changes, call record_preferences and/or find_alternatives. Do not invent products.`;
}

async function runChatAgent(payload) {
  const recommendation = payload.currentRecommendation;
  if (!recommendation?.outfit?.length) {
    return {
      assistantMessage: "Generate an outfit first, then I can explain it or help refine alternatives.",
      action: "answer",
      chatState: payload.chatState || {}
    };
  }

  const message = String(payload.message || "").trim();
  const baseChatState = mergeChatState(payload.chatState || {}, {});
  const inferred = inferChatIntent(message, recommendation, baseChatState);
  let chatState = mergeChatState(baseChatState, {
    lockedProductIds: inferred.lockedProductIds,
    preferences: inferred.preferences
  });
  const constraints = currentConstraintsFromRecommendation(recommendation, payload);
  const ai = {
    enabled: Boolean(OPENAI_API_KEY),
    imageAnalysis: recommendation.ai?.imageAnalysis || "local",
    queryEmbeddings: recommendation.ai?.queryEmbeddings || "local",
    copyGeneration: recommendation.ai?.copyGeneration || "local",
    recommendationReview: recommendation.ai?.recommendationReview || "local",
    chatAgent: "local",
    model: OPENAI_MODEL,
    embeddingModel: OPENAI_EMBEDDING_MODEL,
    errors: [...(recommendation.ai?.errors || [])]
  };
  let calls = [];

  if (OPENAI_API_KEY) {
    try {
      const agentResponse = await responseWithTools([
        {
          role: "system",
          content: `You are an event-stylist agent for a fashion recommendation app. You can explain the current basket and call tools to search real catalog alternatives. Be concise and demo ready. Preview changes; never claim a basket changed unless the app applies it.`
        },
        ...((payload.history || []).slice(-8).map((entry) => ({
          role: entry.role === "assistant" ? "assistant" : "user",
          content: String(entry.content || "")
        }))),
        {
          role: "user",
          content: summarizeForAgent(recommendation, chatState, message, constraints)
        }
      ], chatTools);
      calls = parseFunctionCalls(agentResponse);
      ai.chatAgent = "openai-responses";
    } catch (error) {
      ai.errors.push(`Chat agent fallback: ${error.message}`);
    }
  }

  if (!calls.length) {
    calls = inferred.wantsChange
      ? [
          { name: "record_preferences", arguments: { preferences: inferred.preferences, lockedProductIds: inferred.lockedProductIds } },
          { name: "find_alternatives", arguments: { targetProductId: inferred.targetProductId, targetRole: inferred.targetRole, goal: inferred.goal } }
        ]
      : [{ name: "explain_basket", arguments: { focus: message } }];
  }

  for (const call of calls.filter((item) => item.name === "record_preferences")) {
    chatState = mergeChatState(chatState, call.arguments || {});
  }

  let wantsAlternative = calls.find((item) => item.name === "find_alternatives");
  if (!wantsAlternative && inferred.wantsChange) {
    wantsAlternative = { name: "find_alternatives", arguments: { targetProductId: inferred.targetProductId, targetRole: inferred.targetRole, goal: inferred.goal } };
  }
  if (!wantsAlternative) {
    const explanation = explainCurrentBasket(recommendation);
    let assistantMessage = `Here is what the stylist is doing: ${explanation}`;
    if (OPENAI_API_KEY) {
      try {
        const copy = await chatJson([
          { role: "system", content: "Return only valid JSON with a concise assistantMessage string." },
          { role: "user", content: `Rewrite this as a helpful 2-3 sentence stylist chat response.\n\nCustomer asked: ${message}\n\nGrounded explanation:\n${explanation}` }
        ], 350);
        assistantMessage = copy.assistantMessage || assistantMessage;
      } catch (error) {
        ai.errors.push(`Chat explanation fallback: ${error.message}`);
      }
    }
    return { assistantMessage, action: "answer", chatState, ai };
  }

  const { target, candidates } = await findAlternativeProducts({
    recommendation,
    chatState,
    args: wantsAlternative.arguments || {},
    message
  });

  if (!target || !candidates.length) {
    return {
      assistantMessage: "I could not find a strong replacement inside the current catalog, store, and budget constraints. The best next move would be loosening availability or budget for this one item.",
      action: "answer",
      chatState,
      alternatives: [],
      ai
    };
  }

  const replacement = candidates[0];
  const outfit = recommendation.outfit.map((product) => product.id === target.id ? replacement : product);
  const changeSummary = `Preview: replace ${target.productDisplayName} with ${replacement.productDisplayName} because the customer asked for ${wantsAlternative.arguments?.goal || inferred.goal}.`;
  const previewRecommendation = await finalizeRecommendationPreview({
    recommendation,
    outfit,
    changeSummary,
    ai
  });
  const assistantMessage = `I found a better option to preview: swap ${target.productDisplayName} for ${replacement.productDisplayName}. It keeps the basket grounded in local inventory and better matches "${wantsAlternative.arguments?.goal || inferred.goal}".`;

  return {
    assistantMessage,
    action: "preview_update",
    chatState,
    previewRecommendation,
    changedProductIds: [target.id, replacement.id],
    alternatives: candidates,
    ai
  };
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/catalog-images/")) {
    const fileName = normalize(url.pathname.replace("/catalog-images/", ""));
    const imagePath = join(imageDir, fileName);
    if (!imagePath.startsWith(imageDir)) return jsonResponse(res, 403, { error: "Forbidden" });
    if (!existsSync(imagePath)) return jsonResponse(res, 404, { error: "Not found" });
    res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" });
    createReadStream(imagePath).pipe(res);
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(publicDir, normalize(requested));
  if (!filePath.startsWith(publicDir)) return jsonResponse(res, 403, { error: "Forbidden" });
  try {
    await stat(filePath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
    res.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    jsonResponse(res, 404, { error: "Not found" });
  }
}

export async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/bootstrap") {
      return jsonResponse(res, 200, {
        events: Object.fromEntries(Object.entries(events).map(([key, value]) => [key, value.label])),
        styles: Object.fromEntries(Object.entries(styleProfiles).map(([key, value]) => [key, value.label])),
        stores: ["Chicago Loop", "Dallas NorthPark", "New York Herald Square", "San Francisco Centre"],
        hasOpenAI: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
        embeddingModel: OPENAI_EMBEDDING_MODEL,
        inspiration: pickInspiration()
      });
    }
    if (req.method === "POST" && url.pathname === "/api/recommend") {
      let body = "";
      for await (const chunk of req) body += chunk;
      return jsonResponse(res, 200, await recommend(JSON.parse(body || "{}")));
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      let body = "";
      for await (const chunk of req) body += chunk;
      return jsonResponse(res, 200, await runChatAgent(JSON.parse(body || "{}")));
    }
    return serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return jsonResponse(res, 500, { error: error.message });
  }
}

export default handler;

const isVercel = Boolean(process.env.VERCEL);

if (!isVercel) {
  createServer(handler).listen(PORT, () => {
    console.log(`Fashion Recommendation App running at http://localhost:${PORT}`);
  });
}
