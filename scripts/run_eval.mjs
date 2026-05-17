import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.OPENAI_API_KEY = "";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");
const scenarios = JSON.parse(await readFile(join(root, "evals", "retailnext_scenarios.json"), "utf8"));
const { recommend, runChatAgent } = await import("../server/index.mjs");

function assertCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function checkScenario(scenario, recommendation) {
  const expected = scenario.expected || {};
  const total = recommendation.outfit.reduce((sum, product) => sum + product.price, 0);
  if (expected.requiredSlotsPresent) {
    assertCheck(recommendation.structuredIntent?.required_slots?.length > 0, "required slots missing from structured intent");
    assertCheck(recommendation.outfit.length > 0, "outfit is empty");
  }
  if (expected.totalUnderBudget) {
    assertCheck(total <= Number(scenario.payload.budgetMax), `basket ${total} exceeds budget ${scenario.payload.budgetMax}`);
  }
  if (expected.availableTodayTruthful && scenario.payload.urgency === "today") {
    const unavailable = recommendation.outfit.filter((product) => (product.inventory?.[recommendation.store] || 0) <= 0);
    assertCheck(unavailable.length === 0, `unavailable items presented as available today: ${unavailable.map((item) => item.id).join(", ")}`);
  }
  if (expected.substitutionExplanationWhenNeeded && recommendation.substitutions.length) {
    assertCheck(recommendation.substitutions.every((item) => item.explanation && item.failureReason && item.replacementRationale), "substitution lacks explanation fields");
  }
  if (expected.eventFitPresent) {
    assertCheck(Boolean(recommendation.analysis?.outfitRationale || recommendation.analysis?.generatedNeed), "event fit rationale missing");
  }
  if (expected.groundingMetricsPresent) {
    assertCheck(Number.isFinite(recommendation.grounding?.semanticCandidatesRetrieved), "grounding metrics missing");
  }
  if (expected.businessSignalPresent) {
    assertCheck(Boolean(recommendation.business?.signals?.demandSignal), "business signal missing");
  }
  for (const field of expected.structuredIntentFields || []) {
    assertCheck(Object.hasOwn(recommendation.structuredIntent || {}, field), `structured intent missing ${field}`);
  }
}

let passed = 0;
const failures = [];

for (const scenario of scenarios) {
  try {
    const recommendation = await recommend(scenario.payload);
    checkScenario(scenario, recommendation);
    if (scenario.chat) {
      const chat = await runChatAgent({
        message: scenario.chat,
        currentRecommendation: recommendation,
        chatState: {},
        history: [],
        constraints: {
          eventType: scenario.payload.eventType,
          stylePreference: scenario.payload.stylePreference,
          storeId: scenario.payload.store,
          budgetMax: scenario.payload.budgetMax,
          urgency: scenario.payload.urgency
        }
      });
      assertCheck(chat.structuredAction?.action === scenario.expected.structuredChatAction, `expected chat action ${scenario.expected.structuredChatAction}, got ${chat.structuredAction?.action}`);
    }
    passed += 1;
    console.log(`pass: ${scenario.name}`);
  } catch (error) {
    failures.push({ name: scenario.name, error });
    console.error(`fail: ${scenario.name} - ${error.message}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length}/${scenarios.length} scenarios failed.`);
  process.exit(1);
}

console.log(`\n${passed}/${scenarios.length} RetailNext scenarios passed.`);
