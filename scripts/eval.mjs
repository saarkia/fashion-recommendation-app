import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const products = JSON.parse(await readFile(join(root, "data/products.json"), "utf8"));
const productsById = new Map(products.map((product) => [String(product.id), product]));
const evalPort = Number(process.env.EVAL_PORT || 4187);
const baseUrl = (process.env.EVAL_BASE_URL || `http://localhost:${evalPort}`).replace(/\/$/, "");
const startedServer = !process.env.EVAL_BASE_URL;

const topArticleTypes = new Set(["Shirts", "Tshirts", "Tops", "Kurtas"]);
const bottomArticleTypes = new Set(["Jeans", "Trousers", "Shorts", "Skirts", "Patiala", "Track Pants", "Rain Trousers"]);
const shoeArticleTypes = new Set(["Casual Shoes", "Sports Shoes", "Formal Shoes", "Heels", "Flats", "Sandals", "Flip Flops"]);

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

const missions = [
  { name: "Blue shirt spring wedding", inspirationId: 27152, eventType: "outdoor-spring-wedding", stylePreference: "classic", store: "Chicago Loop", budgetMax: 650 },
  { name: "Yellow polo vacation", inspirationId: 10469, eventType: "vacation", stylePreference: "comfortable", store: "San Francisco Centre", budgetMax: 650 },
  { name: "Black shirt holiday party", inspirationId: 2133, eventType: "holiday-party", stylePreference: "classic", store: "New York Herald Square", budgetMax: 650 },
  { name: "Light blue work shirt conference", inspirationId: 7143, eventType: "business-conference", stylePreference: "minimal", store: "Dallas NorthPark", budgetMax: 650 },
  { name: "Grey tee new job", inspirationId: 4226, eventType: "first-day-new-job", stylePreference: "comfortable", store: "Chicago Loop", budgetMax: 650 },
  { name: "White shirt conference", inspirationId: 16035, eventType: "business-conference", stylePreference: "classic", store: "Dallas NorthPark", budgetMax: 650 },
  { name: "Orange running top vacation", inspirationId: 2265, eventType: "vacation", stylePreference: "trend-forward", store: "Chicago Loop", budgetMax: 650 },
  { name: "Multi patiala wedding", inspirationId: 47062, eventType: "outdoor-spring-wedding", stylePreference: "trend-forward", store: "Dallas NorthPark", budgetMax: 650 },
  { name: "Pink leggings vacation", inspirationId: 38932, eventType: "vacation", stylePreference: "comfortable", store: "San Francisco Centre", budgetMax: 650 },
  { name: "Maroon shrug holiday", inspirationId: 58158, eventType: "holiday-party", stylePreference: "minimal", store: "Dallas NorthPark", budgetMax: 650 }
].map((mission) => ({ ...mission, urgency: "today" }));

let serverProcess = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/bootstrap`);
      if (response.ok) return;
    } catch {
      // Server is not ready yet.
    }
    await sleep(350);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

function startServer() {
  serverProcess = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(evalPort) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  serverProcess.stdout.on("data", (chunk) => process.stdout.write(chunk));
  serverProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));
  serverProcess.on("exit", (code) => {
    if (code && code !== 0) process.stderr.write(`Eval server exited with code ${code}\n`);
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
}

function productGroup(product) {
  if (!product) return "unknown";
  if (shoeArticleTypes.has(product.articleType) || ["Shoes", "Sandal", "Flip Flops"].includes(product.subCategory)) return "shoe";
  if (bottomArticleTypes.has(product.articleType) || product.subCategory === "Bottomwear") return "bottom";
  if (topArticleTypes.has(product.articleType) || product.subCategory === "Topwear") return "top";
  return "other";
}

function evaluateRecommendation(mission, recommendation) {
  const outfit = recommendation.outfit || [];
  const starter = productsById.get(String(mission.inspirationId)) || recommendation.reference;
  const completeLook = [starter, ...outfit].filter(Boolean);
  const groups = new Set(completeLook.map(productGroup));
  const realProducts = outfit.map((product) => productsById.get(String(product.id)));
  const missingIds = outfit.filter((product, index) => !realProducts[index]).map((product) => product.id);
  const unavailable = outfit
    .filter((product, index) => !realProducts[index] || Number(realProducts[index].inventory?.[mission.store] || 0) <= 0)
    .map((product) => product.productDisplayName || product.id);
  const unknownColours = outfit
    .filter((product) => !Object.hasOwn(colourFamilies, product.baseColour))
    .map((product) => `${product.productDisplayName || product.id} (${product.baseColour || "unknown"})`);
  const basketValue = Number(recommendation.business?.basketValue || outfit.reduce((sum, product) => sum + Number(product.price || 0), 0));

  return {
    outfit_completeness: groups.has("top") && groups.has("bottom") && groups.has("shoe"),
    budget_adherence: basketValue <= Number(mission.budgetMax),
    availability_truth: unavailable.length === 0,
    colour_coherence: unknownColours.length === 0,
    no_hallucinated_skus: missingIds.length === 0,
    basketValue,
    itemCount: outfit.length,
    details: [
      missingIds.length ? `Missing ids: ${missingIds.join(", ")}` : "",
      unavailable.length ? `Unavailable: ${unavailable.join(", ")}` : "",
      unknownColours.length ? `Unknown colours: ${unknownColours.join(", ")}` : "",
      !groups.has("top") || !groups.has("bottom") || !groups.has("shoe") ? `Groups: ${[...groups].join(", ") || "none"}` : ""
    ].filter(Boolean).join("; ")
  };
}

function mark(pass) {
  return pass ? "PASS" : "FAIL";
}

function escapeMarkdown(value) {
  return String(value || "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

async function runMission(mission) {
  const response = await fetch(`${baseUrl}/api/recommend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mission)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return evaluateRecommendation(mission, payload);
}

function reportMarkdown(rows) {
  const generatedAt = new Date().toISOString();
  const failures = rows.filter((row) => !row.pass).length;
  return [
    "# RetailNext Recommendation Eval Report",
    "",
    `Generated: ${generatedAt}`,
    `Endpoint: ${baseUrl}/api/recommend`,
    `Missions: ${rows.length}`,
    `Result: ${failures ? `${failures} failing mission${failures === 1 ? "" : "s"}` : "all missions passing"}`,
    "",
    "| Mission | Store | Budget | Basket | Completeness | Budget | Availability | Colours | SKUs | Details |",
    "| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${escapeMarkdown(row.name)} | ${escapeMarkdown(row.store)} | $${row.budgetMax} | $${row.basketValue} / ${row.itemCount} items | ${mark(row.checks.outfit_completeness)} | ${mark(row.checks.budget_adherence)} | ${mark(row.checks.availability_truth)} | ${mark(row.checks.colour_coherence)} | ${mark(row.checks.no_hallucinated_skus)} | ${escapeMarkdown(row.details || "-")} |`),
    ""
  ].join("\n");
}

try {
  if (startedServer) startServer();
  await waitForServer();

  const rows = [];
  for (const mission of missions) {
    try {
      const result = await runMission(mission);
      const checks = {
        outfit_completeness: result.outfit_completeness,
        budget_adherence: result.budget_adherence,
        availability_truth: result.availability_truth,
        colour_coherence: result.colour_coherence,
        no_hallucinated_skus: result.no_hallucinated_skus
      };
      rows.push({
        ...mission,
        checks,
        pass: Object.values(checks).every(Boolean),
        basketValue: result.basketValue,
        itemCount: result.itemCount,
        details: result.details
      });
    } catch (error) {
      rows.push({
        ...mission,
        checks: {
          outfit_completeness: false,
          budget_adherence: false,
          availability_truth: false,
          colour_coherence: false,
          no_hallucinated_skus: false
        },
        pass: false,
        basketValue: 0,
        itemCount: 0,
        details: error.message
      });
    }
  }

  const report = reportMarkdown(rows);
  await writeFile(join(__dirname, "eval-report.md"), report);
  process.stdout.write(report);
  if (rows.some((row) => !row.pass)) process.exitCode = 1;
} finally {
  stopServer();
}
