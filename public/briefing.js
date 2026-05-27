const queryContent = {
  keyword: {
    label: "Keyword search",
    title: "Black dress",
    input: "black dress",
    output: "Product matches, then manual checks for event fit, size, store, and substitutes.",
    value: "Useful for known-item search, weaker for event-led discovery."
  },
  chat: {
    label: "Natural language chat",
    title: "Smart outfit for a winter wedding in New York",
    input: "I need a smart outfit for a winter wedding in New York, available near me today.",
    output: "OpenAI extracts occasion, formality, weather, urgency, budget, store, and outfit roles.",
    value: "Customers can describe the mission naturally, which makes the assistant easier to engage with."
  },
  photo: {
    label: "Photo + chat",
    title: "Build around this jacket",
    input: "I like this jacket. Can you build an outfit for a work dinner?",
    output: "Vision identifies style cues, then the assistant retrieves compatible products and checks availability.",
    value: "A customer can start from inspiration, not taxonomy."
  },
  whatsapp: {
    label: "WhatsApp prompt",
    title: "Same assistant, lower-friction channel",
    input: "Need an outfit for a wedding tomorrow. Can I collect it at Oxford Street?",
    output: "The same structured assistant flow can respond in a messaging channel and hand off to store or CRM.",
    value: "RetailNext can meet customers where they already communicate."
  }
};

const channelContent = {
  web: {
    title: "Website and app",
    job: "Make product discovery conversational without replacing the existing commerce journey.",
    enabler: "OpenAI maps natural language and images into structured search and action requests.",
    outcome: "Higher engagement, clearer baskets, and a route into checkout."
  },
  whatsapp: {
    title: "WhatsApp",
    job: "Support urgent event shopping in a channel customers already use.",
    enabler: "The same intent extraction and action schema can sit behind a messaging experience.",
    outcome: "Lower-friction re-engagement, store collection prompts, and recovery journeys."
  },
  associate: {
    title: "Associate tool",
    job: "Give store teams the outfit rationale, stock risks, and substitute options.",
    enabler: "Grounded generation summarises verified product and inventory facts.",
    outcome: "Less manual lookup and a better handoff from digital to store."
  },
  crm: {
    title: "Braze follow-up",
    job: "Turn the session into a timely lifecycle message.",
    enabler: "Structured outputs provide product, event, stock, and copy fields for CRM payloads.",
    outcome: "Abandoned missions can support personalised follow-up and recovery."
  }
};

const architectureContent = {
  intent: {
    title: "Mission capture",
    primitive: "RetailNext frontend",
    body: "A shopper starts from chat, product, or image, then adds occasion, store, budget, and urgency.",
    value: "The assistant captures a richer brief than a keyword box."
  },
  understand: {
    title: "Intent understanding",
    primitive: "OpenAI API: Vision + Structured Outputs",
    body: "OpenAI extracts item type, colour, formality, constraints, and outfit roles.",
    value: "Text and images become structured fields the app can validate."
  },
  retrieve: {
    title: "Semantic retrieval",
    primitive: "OpenAI API + RetailNext catalogue",
    body: "Embeddings match the shopping brief to catalogue vectors.",
    value: "RetailNext can retrieve by meaning, not only by exact product terms."
  },
  ground: {
    title: "Retail validation",
    primitive: "RetailNext deterministic logic",
    body: "RetailNext applies stock, price, size, budget, urgency, and fulfilment rules.",
    value: "Only validated products reach the customer."
  },
  activate: {
    title: "Actions and handoff",
    primitive: "OpenAI generation + RetailNext actions",
    body: "The assistant explains, swaps, emails, briefs associates, and flags demand gaps.",
    value: "One conversation becomes checkout support, store handoff, and CRM follow-up."
  }
};

const platformContent = {
  vision: {
    title: "Multimodal understanding",
    headline: "Production-quality text and image reasoning.",
    use: "Reads occasion prompts and starter-item photos.",
    value: "Customers can begin with natural language, a product, or inspiration."
  },
  structured: {
    title: "Structured Outputs",
    headline: "Reliable API contracts for retail systems.",
    use: "Returns strict fields for occasion, outfit slots, budget, urgency, store, and constraints.",
    value: "RetailNext can validate, log, test, and route model output."
  },
  embeddings: {
    title: "Embeddings",
    headline: "Semantic retrieval over a large catalogue.",
    use: "Matches the event brief to products by meaning.",
    value: "Improves discovery when the customer uses everyday language."
  },
  ladder: {
    title: "Model ladder",
    headline: "Right model for each task.",
    use: "Fast model for intent, embeddings for retrieval, stronger model for review and copy.",
    value: "Balances quality, latency, and cost as traffic scales."
  },
  tools: {
    title: "Tool actions",
    headline: "Chat requests become controlled operations.",
    use: "Mira maps 'swap the shoes' or 'email this outfit' to previewed actions.",
    value: "Conversation can move the journey forward without bypassing app checks."
  },
  evals: {
    title: "Evals",
    headline: "Quality checks before scale.",
    use: "Test event fit, availability truth, substitutions, latency, cost, and refusal paths.",
    value: "RetailNext gets a route from demo to governed production."
  },
  enterprise: {
    title: "Enterprise controls",
    headline: "Data and system control remain with RetailNext.",
    use: "OpenAI supports interpretation and language; RetailNext owns product truth and actions.",
    value: "The model helps the journey without owning commercial decisions."
  }
};

const valueContent = {
  conversion: {
    title: "Increase high-intent event conversion",
    goal: "Move shoppers from vague occasion to available basket.",
    enabler: "Multimodal intent understanding + semantic retrieval.",
    metric: "Product click-through, add-to-cart, revenue per event visit."
  },
  friction: {
    title: "Reduce availability-driven friction",
    goal: "Stop showing attractive options that fail at store or size level.",
    enabler: "Inventory-grounded filtering + validated substitutes.",
    metric: "Availability-related complaints, failed searches, collection confidence."
  },
  efficiency: {
    title: "Improve store-level efficiency",
    goal: "Give associates context before the customer arrives.",
    enabler: "Generated handoff notes grounded in verified products.",
    metric: "Associate lookup time, substitute acceptance, in-store conversion."
  },
  learning: {
    title: "Create a demand learning loop",
    goal: "Capture unmet event intent and stock gaps.",
    enabler: "Structured outputs + CRM and reporting payloads.",
    metric: "Missed-demand themes, replenishment signals, recovery engagement."
  }
};

const navButtons = [...document.querySelectorAll(".brief-nav-button")];
const sections = [...document.querySelectorAll("[data-brief-step]")];
const queryDetail = document.querySelector("#queryDetail");
const channelDetail = document.querySelector("#channelDetail");
const architectureDetail = document.querySelector("#architectureDetail");
const platformDetail = document.querySelector("#platformDetail");
const valueDetail = document.querySelector("#valueDetail");

function renderQuery(key) {
  const item = queryContent[key] || queryContent.chat;
  queryDetail.innerHTML = `
    <p class="eyebrow">${item.label}</p>
    <h3>${item.title}</h3>
    <div class="chat-example">
      <span>Customer input</span>
      <strong>${item.input}</strong>
    </div>
    <div class="detail-columns">
      <div><span>Assistant output</span><p>${item.output}</p></div>
      <div><span>Business value</span><p>${item.value}</p></div>
    </div>
  `;
  document.querySelectorAll(".query-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.query === key);
  });
}

function renderChannel(key) {
  const item = channelContent[key] || channelContent.web;
  channelDetail.innerHTML = `
    <p class="eyebrow">Deployment surface</p>
    <h3>${item.title}</h3>
    <div class="detail-columns">
      <div><span>Channel role</span><p>${item.job}</p></div>
      <div><span>OpenAI enabler</span><p>${item.enabler}</p></div>
      <div><span>Outcome</span><p>${item.outcome}</p></div>
    </div>
  `;
  document.querySelectorAll(".channel-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.channel === key);
  });
}

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
    <h3>${item.headline}</h3>
    <div class="detail-columns">
      <div><span>Use in solution</span><p>${item.use}</p></div>
      <div><span>Business value</span><p>${item.value}</p></div>
    </div>
  `;
  document.querySelectorAll(".platform-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.platform === key);
  });
}

function renderValue(key) {
  const item = valueContent[key] || valueContent.conversion;
  valueDetail.innerHTML = `
    <p class="eyebrow">Value driver</p>
    <h3>${item.title}</h3>
    <div class="detail-columns">
      <div><span>Goal</span><p>${item.goal}</p></div>
      <div><span>OpenAI enabler</span><p>${item.enabler}</p></div>
      <div><span>Metric</span><p>${item.metric}</p></div>
    </div>
  `;
  document.querySelectorAll(".value-button").forEach((button) => {
    const active = button.dataset.value === key;
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

document.querySelectorAll(".query-button").forEach((button) => {
  button.addEventListener("click", () => renderQuery(button.dataset.query));
});

document.querySelectorAll(".channel-button").forEach((button) => {
  button.addEventListener("click", () => renderChannel(button.dataset.channel));
});

document.querySelectorAll(".flow-node").forEach((button) => {
  button.addEventListener("click", () => renderArchitecture(button.dataset.arch));
});

document.querySelectorAll(".platform-button").forEach((button) => {
  button.addEventListener("click", () => renderPlatform(button.dataset.platform));
});

document.querySelectorAll(".value-button").forEach((button) => {
  button.addEventListener("click", () => renderValue(button.dataset.value));
});

window.addEventListener("scroll", syncActiveSection, { passive: true });
renderQuery("chat");
renderChannel("web");
renderArchitecture("intent");
renderPlatform("vision");
renderValue("conversion");
syncActiveSection();
