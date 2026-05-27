const architectureContent = {
  intent: {
    title: "Mission capture",
    primitive: "RetailNext frontend",
    body: "The shopper starts from a product or image, then adds occasion, style preference, store, budget, and urgency.",
    value: "This captures the shopping brief before retrieval starts, so recommendations are based on the event and the store context."
  },
  understand: {
    title: "Intent understanding",
    primitive: "OpenAI API: Vision + Structured Outputs",
    body: "OpenAI extracts item type, colour, formality, seasonality, style direction, constraints, and required outfit slots from shopper input.",
    value: "Text and images become machine-readable JSON that can feed search, ranking, chat actions, associate notes, and evals."
  },
  retrieve: {
    title: "Semantic retrieval",
    primitive: "OpenAI API + RetailNext catalogue",
    body: "OpenAI creates embeddings for the event and style search phrases; RetailNext compares them with prepared catalogue vectors and retrieves candidate SKUs.",
    value: "This helps RetailNext find relevant styles when the shopper describes an occasion in their own words."
  },
  ground: {
    title: "Retail validation",
    primitive: "RetailNext deterministic logic",
    body: "Ranking and filtering enforce store stock, available-today urgency, budget, product role, outfit completeness, and substitution rules.",
    value: "The application verifies what can actually be sold, fulfilled, and shown before anything reaches the shopper."
  },
  activate: {
    title: "Actions and handoff",
    primitive: "OpenAI generation + RetailNext actions",
    body: "Mira uses generated language and action selection, while RetailNext validates basket changes, creates the associate handoff, sends Braze payloads, and highlights gaps.",
    value: "One session can support the customer answer, store handoff, CRM follow-up, and demand signal while stock and fulfilment facts stay checked by the application."
  }
};

const platformContent = {
  vision: {
    title: "Multimodal understanding",
    body: "Reads a starter product image and extracts visual attributes such as item type, colour, formality cues, seasonality, and style notes.",
    value: "Useful because shoppers often start from a photo or an item they like before they know the exact category or SKU."
  },
  structured: {
    title: "Structured Outputs",
    body: "Maps event-driven language into predictable fields: starter analysis, outfit slots, occasion, formality, colour palette, budget, urgency, store, and constraints.",
    value: "The app receives fields it can validate, log, and test."
  },
  embeddings: {
    title: "Embeddings",
    body: "Retrieves catalogue products using event and product meaning, with the starter item and shopping brief as context.",
    value: "Updated-style discovery works better when the shopper describes the need in everyday language."
  },
  tools: {
    title: "Tool/action pattern",
    body: "Mira interprets follow-up chat such as 'make it cheaper', 'swap the shoes', or 'email this outfit' into structured operations.",
    value: "The app can preview and validate each action before changing the basket or triggering downstream workflows."
  },
  generation: {
    title: "Generation",
    body: "Creates shopper explanations, item reasons, substitution rationale, associate briefs, and Braze email copy from grounded product data.",
    value: "One verified basket can support digital conversion, store clienteling, and lifecycle follow-up."
  },
  evals: {
    title: "Evals",
    body: "The prototype includes scenario checks; production would expand this into evals for budget adherence, availability truth, event fit, substitution quality, and hallucination prevention.",
    value: "RetailNext can test quality before scaling to more categories, stores, and customer segments."
  },
  enterprise: {
    title: "Enterprise controls",
    body: "OpenAI handles interpretation and generation, while RetailNext keeps catalogue, inventory, customer, basket, and fulfilment data under application control.",
    value: "RetailNext can improve the customer experience while keeping prices, stock, orders, and final commercial decisions in its own systems."
  }
};

const stakeholderContent = {
  innovation: {
    title: "Head of Innovation lens",
    body: "This is a customer-facing use case with a clear journey: the shopper gets a complete outfit, and the same session can support stores and follow-up messaging.",
    bullets: [
      "Improves event shopping on top of the existing product search experience.",
      "Creates a visible assisted-selling moment across digital and store channels.",
      "Links review themes to specific points to measure across merchandising and operations."
    ]
  },
  cto: {
    title: "CTO lens",
    body: "The architecture gives OpenAI a bounded role. It helps with interpretation, retrieval inputs, actions, and language; RetailNext systems retain authority over SKUs, stock, price, budget, fulfilment, and basket changes.",
    bullets: [
      "The UI renders only catalogue SKUs, which reduces the risk of invented products.",
      "Structured outputs and action schemas create testable integration contracts.",
      "Scenario evals, guardrails, and fallback paths provide a route from prototype to production governance."
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
