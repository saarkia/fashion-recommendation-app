const baseUrl = (process.env.EVAL_BASE_URL || "http://localhost:4173").replace(/\/$/, "");

const recommendationPayload = {
  inspirationId: 27152,
  eventType: "first-day-new-job",
  stylePreference: "classic",
  store: "Chicago Loop",
  budgetMax: 650,
  urgency: "today",
  shirtSize: "M",
  trouserSize: "32W",
  shoeSize: "US 9"
};

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} failed: ${payload.error || response.status}`);
  return payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runShoeRefinement(message) {
  const recommendation = await postJson("/api/recommend", recommendationPayload);
  const currentShoe = recommendation.outfit.find((product) => product.role === "shoes");
  assert(currentShoe, "Expected the baseline outfit to include shoes.");
  assert(currentShoe.articleType === "Formal Shoes", `Expected baseline shoes to be Formal Shoes, got ${currentShoe.articleType}.`);

  const result = await postJson("/api/chat", {
    message,
    currentRecommendation: recommendation,
    chatState: {},
    history: [
      { role: "assistant", content: "I built your outfit." },
      { role: "user", content: message }
    ]
  });

  const from = result.previewSwap?.from;
  const to = result.previewSwap?.to;
  assert(result.action === "preview_update", `Expected preview_update for "${message}", got ${result.action}.`);
  assert(from?.articleType === "Formal Shoes", `Expected current item to be Formal Shoes for "${message}", got ${from?.articleType}.`);
  assert(to?.articleType === "Formal Shoes", `Expected replacement to be Formal Shoes for "${message}", got ${to?.articleType}: ${to?.productDisplayName}.`);

  return {
    message,
    from: from.productDisplayName,
    to: to.productDisplayName,
    model: result.ai?.model,
    reasoningModel: result.ai?.reasoningModel,
    chatAgent: result.ai?.chatAgent
  };
}

const rows = [];
for (const message of ["I don't like the shoes", "I do not like the shoes"]) {
  rows.push(await runShoeRefinement(message));
}

console.log(JSON.stringify({ baseUrl, checks: rows }, null, 2));
