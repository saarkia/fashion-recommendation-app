const architectureContent = {
  intent: {
    title: "Shopper intent",
    primitive: "Input surface",
    body: "The customer starts from a starter item or uploaded image, then adds occasion, style preference, store, budget, and urgency.",
    value: "The app captures the event mission before retrieval starts, so recommendations are based on the actual shopping need."
  },
  understand: {
    title: "OpenAI understanding",
    primitive: "Vision + Structured Outputs",
    body: "OpenAI extracts item type, colours, formality, style direction, constraints, and required outfit slots from the customer input.",
    value: "Those fields are machine-readable, so they can be passed into search, ranking, chat actions, associate notes, and eval checks."
  },
  retrieve: {
    title: "Embedding retrieval",
    primitive: "text-embedding-3-large",
    body: "The app converts the event and style intent into semantic search vectors, then retrieves matching products from the prepared RetailNext catalogue.",
    value: "This helps find relevant styles even when the customer does not use exact product or category wording."
  },
  ground: {
    title: "Retail grounding",
    primitive: "Deterministic business logic",
    body: "Ranking and filtering enforce store stock, available-today urgency, budget, product role, outfit completeness, and substitution rules.",
    value: "The model interprets the request; the application verifies what can actually be sold and fulfilled."
  },
  activate: {
    title: "Activation",
    primitive: "Responses-style actions + generation",
    body: "Mira converts chat into safe basket actions, creates associate handoff notes, writes Braze email copy, and highlights availability gaps.",
    value: "The session can support the customer, the store associate, and merchandising follow-up."
  }
};

const platformContent = {
  vision: {
    title: "Vision / multimodal input",
    body: "Reads an uploaded clothing image and extracts visual attributes such as item type, colour, material cues, and style notes.",
    value: "Useful because customers often start with a photo, not a SKU or category."
  },
  structured: {
    title: "Structured Outputs",
    body: "Turns vague event-driven language into a predictable schema: occasion, formality, colour palette, budget, urgency, store, slots, starter analysis, and constraints.",
    value: "Makes model output safe to pass into retrieval, filtering, ranking, and UI explanation."
  },
  embeddings: {
    title: "Embeddings",
    body: "Retrieves catalogue products by meaning rather than keyword match, using the event mission and starter item as semantic context.",
    value: "Solves the updated-style discovery problem without requiring perfect product taxonomy or exact shopper wording."
  },
  tools: {
    title: "Tool-calling style action schema",
    body: "Mira interprets follow-up chat such as 'make it cheaper' or 'swap the shoes' into structured basket operations that the app can validate.",
    value: "The app previews and validates each change before the basket is updated."
  },
  generation: {
    title: "Generation",
    body: "Creates shopper explanations, substitution rationale, associate briefs, and Braze email copy from grounded product data.",
    value: "Scales a high-quality stylist experience across digital, store, and lifecycle channels."
  },
  evals: {
    title: "Evals",
    body: "The prototype includes scenario checks; production would expand this into evals for budget adherence, availability truth, event fit, substitution quality, and hallucination prevention.",
    value: "This gives RetailNext a route to test quality before scaling to more categories, stores, and customer segments."
  }
};

const stakeholderContent = {
  innovation: {
    title: "Head of Innovation lens",
    body: "The customer gets a complete event-ready basket, the associate gets a handoff, and merchandising gets a signal about demand that was at risk of being missed.",
    bullets: [
      "Differentiates RetailNext from generic product search.",
      "Creates an AI-assisted clienteling experience that is visible to customers.",
      "Turns poor-review root causes into measurable intervention points."
    ]
  },
  cto: {
    title: "CTO lens",
    body: "The architecture keeps model reasoning bounded. OpenAI handles ambiguous interpretation and language; RetailNext systems retain authority over SKUs, inventory, price, budget, and fulfilment.",
    bullets: [
      "Grounded RAG pattern reduces hallucinated product risk.",
      "Structured outputs and action schemas create testable contracts.",
      "Eval scenarios give a path from prototype to production governance."
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
