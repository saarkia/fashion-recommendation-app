const architectureContent = {
  intent: {
    title: "Mission capture",
    primitive: "RetailNext frontend",
    body: "The shopper starts from a product or image, then adds occasion, style preference, store, budget, and urgency.",
    value: "Business job: capture the event mission before retrieval starts, so the experience is solving a buying need rather than returning generic product search results."
  },
  understand: {
    title: "Intent understanding",
    primitive: "OpenAI API: Vision + Structured Outputs",
    body: "OpenAI extracts item type, colour, formality, seasonality, style direction, constraints, and required outfit slots from shopper input.",
    value: "Technical enabler: ambiguous text and images become machine-readable JSON that can feed search, ranking, chat actions, associate notes, and evals."
  },
  retrieve: {
    title: "Semantic retrieval",
    primitive: "OpenAI API + RetailNext catalogue",
    body: "OpenAI creates embeddings for the event and style search phrases; RetailNext compares them with prepared catalogue vectors and retrieves candidate SKUs.",
    value: "Business job: find relevant styles even when the shopper does not know the right product taxonomy or exact category wording."
  },
  ground: {
    title: "Retail validation",
    primitive: "RetailNext deterministic logic",
    body: "Ranking and filtering enforce store stock, available-today urgency, budget, product role, outfit completeness, and substitution rules.",
    value: "Technical enabler: the model can propose, but the application verifies what can actually be sold, fulfilled, and shown."
  },
  activate: {
    title: "Action layer",
    primitive: "OpenAI generation + RetailNext actions",
    body: "Mira uses generated language and action selection, while RetailNext validates basket changes, creates the associate handoff, sends Braze payloads, and highlights gaps.",
    value: "Business job: turn one search session into a customer answer, store workflow, CRM touchpoint, and demand signal without inventing fulfilment facts."
  }
};

const platformContent = {
  vision: {
    title: "Multimodal understanding",
    body: "Reads a starter product image and extracts visual attributes such as item type, colour, formality cues, seasonality, and style notes.",
    value: "Business job: shoppers often start from a photo or item they like, not a clean SKU, category, or query."
  },
  structured: {
    title: "Structured Outputs",
    body: "Turns event-driven language into predictable fields: starter analysis, outfit slots, occasion, formality, colour palette, budget, urgency, store, and constraints.",
    value: "Technical enabler: model output becomes a contract the app can validate instead of free-form prose that is hard to govern."
  },
  embeddings: {
    title: "Embeddings",
    body: "Retrieves catalogue products by meaning rather than keyword overlap, using the event mission and starter item as semantic context.",
    value: "Business job: updated-style discovery works even when the shopper describes the need in human terms."
  },
  tools: {
    title: "Tool/action pattern",
    body: "Mira interprets follow-up chat such as 'make it cheaper', 'swap the shoes', or 'email this outfit' into structured operations.",
    value: "Technical enabler: the app previews and validates each action before changing the basket or triggering downstream workflows."
  },
  generation: {
    title: "Generation",
    body: "Creates shopper explanations, item reasons, substitution rationale, associate briefs, and Braze email copy from grounded product data.",
    value: "Business job: one verified basket can support digital conversion, store clienteling, and lifecycle follow-up."
  },
  evals: {
    title: "Evals",
    body: "The prototype includes scenario checks; production would expand this into evals for budget adherence, availability truth, event fit, substitution quality, and hallucination prevention.",
    value: "Technical enabler: RetailNext can test quality before scaling to more categories, stores, and customer segments."
  },
  enterprise: {
    title: "Enterprise controls",
    body: "OpenAI handles interpretation and generation, while RetailNext keeps catalogue, inventory, customer, basket, and fulfilment data under application control.",
    value: "Business job: move quickly on customer experience without giving the model authority over prices, stock, orders, or final commercial decisions."
  }
};

const stakeholderContent = {
  innovation: {
    title: "Head of Innovation lens",
    body: "This is an AI experience customers can feel: it turns event intent into a complete outfit, then extends the same session into associate support and CRM follow-up.",
    bullets: [
      "Differentiates RetailNext from generic product search and static recommendation carousels.",
      "Creates a visible AI-assisted clienteling moment across digital and store channels.",
      "Turns poor-review root causes into measurable intervention points for merchandising and operations."
    ]
  },
  cto: {
    title: "CTO lens",
    body: "The architecture keeps model reasoning bounded. OpenAI handles ambiguous interpretation, retrieval inputs, actions, and language; RetailNext systems retain authority over SKUs, stock, price, budget, fulfilment, and mutation.",
    bullets: [
      "Grounded RAG reduces hallucinated product risk because the UI renders only catalogue SKUs.",
      "Structured outputs and action schemas create testable integration contracts.",
      "Scenario evals, guardrails, and fallback paths give a route from prototype to production governance."
    ]
  }
};

const navButtons = [...document.querySelectorAll(".brief-nav-button")];
const sections = [...document.querySelectorAll("[data-brief-step]")];
const architectureDetail = document.querySelector("#architectureDetail");
const platformDetail = document.querySelector("#platformDetail");
const stakeholderPanel = document.querySelector("#stakeholderPanel");

function renderArchitecture(key) {
  const item = architectureContent[key] || architectureContent.intent;
  architectureDetail.innerHTML = `
    <p class="eyebrow">${item.primitive}</p>
    <h3>${item.title}</h3>
    <p>${item.body}</p>
    <strong>${item.value}</strong>
  `;
  document.querySelectorAll(".flow-node").forEach((button) => {
    button.classList.toggle("active", button.dataset.arch === key);
  });
}

function renderPlatform(key) {
  const item = platformContent[key] || platformContent.vision;
  platformDetail.innerHTML = `
    <p class="eyebrow">${item.title}</p>
    <p>${item.body}</p>
    <strong>${item.value}</strong>
  `;
  document.querySelectorAll(".platform-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.platform === key);
  });
}

function renderStakeholder(key) {
  const item = stakeholderContent[key] || stakeholderContent.innovation;
  stakeholderPanel.innerHTML = `
    <p class="eyebrow">${item.title}</p>
    <p>${item.body}</p>
    <ul>${item.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}</ul>
  `;
  document.querySelectorAll(".stakeholder-button").forEach((button) => {
    const active = button.dataset.lens === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function setActiveSection(id, shouldScroll = true) {
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.target === id));
  if (shouldScroll) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function syncActiveSection() {
  const marker = window.scrollY + Math.min(window.innerHeight * 0.35, 280);
  const current = sections
    .map((section) => ({ id: section.id, top: section.offsetTop }))
    .filter((section) => section.top <= marker)
    .at(-1);
  if (current?.id) setActiveSection(current.id, false);
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveSection(button.dataset.target));
});

document.querySelector("#startBrief")?.addEventListener("click", () => setActiveSection("situation"));
document.querySelector("#printBrief")?.addEventListener("click", () => window.print());

document.querySelectorAll(".flow-node").forEach((button) => {
  button.addEventListener("click", () => renderArchitecture(button.dataset.arch));
});

document.querySelectorAll(".platform-button").forEach((button) => {
  button.addEventListener("click", () => renderPlatform(button.dataset.platform));
});

document.querySelectorAll(".stakeholder-button").forEach((button) => {
  button.addEventListener("click", () => renderStakeholder(button.dataset.lens));
});

window.addEventListener("scroll", syncActiveSection, { passive: true });
renderArchitecture("intent");
renderPlatform("vision");
renderStakeholder("innovation");
syncActiveSection();
