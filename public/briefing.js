const architectureContent = {
  intent: {
    title: "Shopper intent",
    primitive: "Input surface",
    body: "The customer starts from a starter item or uploaded image, then adds occasion, style preference, store, budget, and urgency. The app captures the full event mission instead of asking the shopper to know exact search terms.",
    value: "This directly addresses poor reviews from customers who cannot translate an event need into specific in-store products."
  },
  understand: {
    title: "OpenAI understanding",
    primitive: "Vision + Structured Outputs",
    body: "OpenAI interprets the human and visual ambiguity: item type, colours, formality, style direction, constraints, and required outfit slots. The result is machine-readable intent, not loose marketing copy.",
    value: "RetailNext can pass structured fields into search, ranking, chat actions, associate notes, and eval checks."
  },
  retrieve: {
    title: "Embedding retrieval",
    primitive: "text-embedding-3-large",
    body: "The app converts style and event intent into semantic search vectors, then retrieves relevant products from the prepared RetailNext catalogue. Product IDs still come from the catalogue, never from model invention.",
    value: "This finds updated or adjacent styles even when the shopper does not use exact product taxonomy."
  },
  ground: {
    title: "Retail grounding",
    primitive: "Deterministic business logic",
    body: "Ranking and filtering enforce store stock, available-today urgency, budget, product role, outfit completeness, and substitution rules. The model is not responsible for inventory truth.",
    value: "This is the line a CTO will care about: AI interprets, the application verifies."
  },
  activate: {
    title: "Activation",
    primitive: "Responses-style actions + generation",
    body: "Mira converts chat into safe basket actions, creates associate handoff notes, writes Braze email copy, and exposes demand signals from substitutions and availability gaps.",
    value: "One digital session becomes store execution, lifecycle follow-up, and merchandising insight."
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
    value: "This turns a chatbot into a controlled retail agent, with preview/apply safety."
  },
  generation: {
    title: "Generation",
    body: "Creates shopper explanations, substitution rationale, associate briefs, and Braze email copy from grounded product data.",
    value: "Scales a high-quality stylist experience across digital, store, and lifecycle channels."
  },
  evals: {
    title: "Evals",
    body: "The prototype includes scenario checks; production would expand this into evals for budget adherence, availability truth, event fit, substitution quality, and hallucination prevention.",
    value: "Gives RetailNext a way to harden the system before scaling to more categories, stores, and customer segments."
  }
};

const stakeholderContent = {
  innovation: {
    title: "Head of Innovation lens",
    body: "This is a customer-experience wedge with operational pull-through. The shopper gets a complete event-ready basket, the associate gets a handoff, and merchandising gets a signal about demand that was almost missed.",
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

const observer = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible?.target?.id) setActiveSection(visible.target.id, false);
}, { rootMargin: "-20% 0px -55% 0px", threshold: [0.2, 0.45, 0.7] });

sections.forEach((section) => observer.observe(section));
renderArchitecture("intent");
renderPlatform("vision");
renderStakeholder("innovation");
