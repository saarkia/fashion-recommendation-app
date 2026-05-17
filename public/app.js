const state = {
  bootstrap: null,
  selectedId: null,
  customImageDataUrl: null,
  latest: null,
  changedProductIds: [],
  loadingStage: 0,
  loadingDone: false,
  loadingTimer: null,
  requestId: 0,
  isGenerating: false,
  chat: {
    history: [],
    chatState: {
      likedProductIds: [],
      dislikedProductIds: [],
      lockedProductIds: [],
      preferences: []
    },
    preview: null,
    previewSwap: null,
    previewChangedProductIds: [],
    suggestedPrompts: [],
    pendingEmail: false,
    isBusy: false
  }
};

const els = {
  inspirationGrid: document.querySelector("#inspirationGrid"),
  eventType: document.querySelector("#eventType"),
  stylePreference: document.querySelector("#stylePreference"),
  store: document.querySelector("#store"),
  budgetMax: document.querySelector("#budgetMax"),
  budgetReadout: document.querySelector("#budgetReadout"),
  form: document.querySelector("#intentForm"),
  generateButton: document.querySelector("#generateButton"),
  refreshButton: document.querySelector("#refreshButton"),
  uploadZone: document.querySelector("#uploadZone"),
  imageUpload: document.querySelector("#imageUpload"),
  customPreview: document.querySelector("#customPreview"),
  clearUpload: document.querySelector("#clearUpload"),
  analysisStrip: document.querySelector("#analysisStrip"),
  productGrid: document.querySelector("#productGrid"),
  kpiGrid: document.querySelector("#kpiGrid"),
  insightBlock: document.querySelector("#insightBlock"),
  pipelineList: document.querySelector("#pipelineList"),
  chatBlock: document.querySelector("#chatBlock"),
  chatMessages: document.querySelector("#chatMessages"),
  quickPrompts: document.querySelector("#quickPrompts"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  statusDot: document.querySelector("#statusDot"),
  statusLabel: document.querySelector("#statusLabel"),
  productTemplate: document.querySelector("#productTemplate")
};

const loadingSteps = [
  {
    title: "Understanding your item",
    service: "OpenAI GPT-4o mini vision",
    detail: "Reads the starter image and event context, then extracts style attributes the app can use."
  },
  {
    title: "Creating grounded search intents",
    service: "OpenAI structured output",
    detail: "Turns the image readout into catalog search prompts for complementary outfit roles."
  },
  {
    title: "Searching the catalog",
    service: "OpenAI text-embedding-3-large + local vector search",
    detail: "Finds meaning-based matches across product data instead of relying on keywords alone."
  },
  {
    title: "Checking store availability",
    service: "Inventory rules",
    detail: "Filters for the selected store, urgency, budget, audience, season, and substitution options."
  },
  {
    title: "Building the basket",
    service: "Fashion ranking logic",
    detail: "Balances outfit role, color harmony, event fit, price, local stock, and guardrail scores."
  },
  {
    title: "Verifying the recommendation",
    service: "OpenAI final guardrail review",
    detail: "Checks that the outfit actually works and that the shopper-facing explanation makes sense."
  }
];

const stylistAgentName = "Mira";

function optionList(select, values) {
  select.replaceChildren(
    ...Object.entries(values).map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    })
  );
}

function storeOptions(select, stores) {
  select.replaceChildren(
    ...stores.map((store) => {
      const option = document.createElement("option");
      option.value = store;
      option.textContent = store;
      return option;
    })
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractEmailAddress(value) {
  return String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function isEmailIntent(value) {
  return /\b(email|e-mail|send|share|mail|inbox)\b/i.test(String(value || ""));
}

function shopperFacingText(value) {
  return String(value || "")
    .replace(/\bcustomer-facing\b/gi, "shopper-facing")
    .replace(/\bthe customer uploaded\b/g, "it looks like you uploaded")
    .replace(/\bThe customer uploaded\b/g, "It looks like you uploaded")
    .replace(/\bcustomer uploaded\b/g, "you uploaded")
    .replace(/\bCustomer uploaded\b/g, "You uploaded")
    .replace(/\bthe customer\b/g, "you")
    .replace(/\bThe customer\b/g, "You")
    .replace(/\bcustomer's\b/g, "your")
    .replace(/\bCustomer's\b/g, "Your")
    .replace(/\bcustomer\b/g, "you")
    .replace(/\bCustomer\b/g, "You")
    .replace(/\bThe recommendations focus on\b/g, "I focused on")
    .replace(/\bthe recommendations focus on\b/g, "I focused on")
    .replace(/\bRecommendations are selected\b/g, "I selected recommendations")
    .replace(/\brecommendations are selected\b/g, "I selected recommendations");
}

function renderInspiration() {
  els.uploadZone.classList.toggle("has-image", Boolean(state.customImageDataUrl));
  els.customPreview.hidden = !state.customImageDataUrl;
  els.clearUpload.hidden = !state.customImageDataUrl;
  if (state.customImageDataUrl) els.customPreview.src = state.customImageDataUrl;

  els.inspirationGrid.replaceChildren(
    ...state.bootstrap.inspiration.map((product) => {
      const tile = document.createElement("button");
      tile.className = "inspiration-tile";
      tile.type = "button";
      tile.setAttribute("aria-pressed", String(!state.customImageDataUrl && product.id === state.selectedId));
      tile.innerHTML = `
        <img src="${product.image}" alt="${product.productDisplayName}" />
        <span>${product.productDisplayName}</span>
      `;
      tile.addEventListener("click", () => {
        state.selectedId = product.id;
        state.customImageDataUrl = null;
        renderInspiration();
        resetRecommendationView();
      });
      return tile;
    })
  );
}

function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error));
    reader.addEventListener("load", () => {
      const img = new Image();
      img.addEventListener("error", () => reject(new Error("Could not read image")));
      img.addEventListener("load", () => {
        const maxSide = 1024;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      });
      img.src = String(reader.result);
    });
    reader.readAsDataURL(file);
  });
}

async function loadImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  try {
    state.customImageDataUrl = await imageFileToDataUrl(file);
    renderInspiration();
    resetRecommendationView();
  } catch (error) {
    console.error(error);
    els.productGrid.innerHTML = `<div class="empty-state">Could not read that image. Try a PNG or JPEG.</div>`;
  }
}

function productCard(product) {
  const node = els.productTemplate.content.firstElementChild.cloneNode(true);
  if (state.changedProductIds.includes(product.id)) node.classList.add("is-updated");
  node.querySelector("img").src = product.image;
  node.querySelector("img").alt = product.productDisplayName;
  node.querySelector(".role-badge").textContent = product.role;
  node.querySelector("h3").textContent = product.productDisplayName;
  node.querySelector(".meta").textContent = `${product.articleType} / ${product.baseColour} / ${product.inventory[state.latest.store] || 0} in store`;
  node.querySelector(".why").textContent = product.why;
  node.querySelector(".price").textContent = `$${product.price}`;
  node.querySelector(".score").textContent = `${product.score}% fit`;
  return node;
}

function resetChat() {
  state.chat = {
    history: [],
    chatState: {
      likedProductIds: [],
      dislikedProductIds: [],
      lockedProductIds: [],
      preferences: []
    },
    preview: null,
    previewSwap: null,
    previewChangedProductIds: [],
    suggestedPrompts: [],
    pendingEmail: false,
    isBusy: false
  };
  state.changedProductIds = [];
}

function resetRecommendationView() {
  state.latest = null;
  state.changedProductIds = [];
  resetChat();
  renderIdleState();
}

function loadingProcessMarkup() {
  const active = state.loadingStage;
  const flowProgress = state.loadingDone
    ? 100
    : Math.round((active / Math.max(1, loadingSteps.length - 1)) * 100);
  const rows = loadingSteps.map((step, index) => {
    const status = state.loadingDone || index < active ? "complete" : index === active ? "active" : "pending";
    const label = status === "complete" ? "Done" : status === "active" ? "Running" : "Queued";
    return `
      <article class="process-step ${status}" style="--step-index: ${index}">
        <div class="process-marker">${status === "complete" ? "✓" : index + 1}</div>
        <div class="process-copy">
          <div class="process-step-header">
            <h3>${escapeHtml(step.title)}</h3>
            <span>${escapeHtml(step.service)}</span>
          </div>
          <div class="process-step-detail">
            <p>${escapeHtml(step.detail)}</p>
          </div>
        </div>
        <strong>${label}</strong>
      </article>
    `;
  }).join("");

  return `
    <section class="process-panel chat-process" aria-label="Recommendation generation progress">
      <div class="process-panel-heading">
        <div>
          <p class="eyebrow">Live process</p>
          <h2>Finding and verifying your outfit</h2>
        </div>
        <span>${Math.min(active + 1, loadingSteps.length)}/${loadingSteps.length}</span>
      </div>
      <div class="process-steps" style="--flow-progress: ${flowProgress}%">${rows}</div>
    </section>
  `;
}

function loadingBuildGridMarkup() {
  const active = state.loadingStage;
  const tiles = [
    ["01", "Read", "Starter item"],
    ["02", "Map", "Event intent"],
    ["03", "Match", "Catalog search"],
    ["04", "Check", "Basket fit"]
  ].map(([number, title, detail], index) => {
    const status = state.loadingDone || index < Math.min(active, 4) ? "complete" : index === Math.min(active, 3) ? "active" : "pending";
    return `
      <article class="build-tile ${status}" style="--tile-index: ${index}">
        <span>${number}</span>
        <strong>${title}</strong>
        <small>${detail}</small>
      </article>
    `;
  }).join("");

  return `
    <div class="look-build-grid" aria-label="Outfit build preview">
      <div class="build-flow-line" style="--build-progress: ${state.loadingDone ? 100 : Math.min(active, 3) * 33.33}%"></div>
      ${tiles}
    </div>
  `;
}

function recommendationChatIntro(data) {
  const intro = data.analysis?.introLines || [];
  const products = (data.outfit || [])
    .map((product) => `${product.role}: ${product.productDisplayName}`)
    .join("; ");
  return [
    `Hi, I'm ${stylistAgentName}, RetailNEXT's fashion agent powered by OpenAI. I'll keep your recommendation grounded in the catalog, budget, and store availability.`,
    shopperFacingText(intro[0]) || `I built this around ${data.analysis?.item || "the starter item"} for ${String(data.event || "your event").toLowerCase()}.`,
    products ? `I found ${data.outfit.length} shoppable pieces: ${products}. Try one of my suggested prompts below, or ask me for a specific change.` : ""
  ].filter(Boolean).join("\n\n");
}

function promptButtonsMarkup(prompts) {
  return (prompts || [])
    .slice(0, 2)
    .map((prompt) => `<button type="button">${escapeHtml(prompt)}</button>`)
    .join("");
}

function swapPreviewMarkup(swap) {
  if (!swap?.from || !swap?.to) return "";
  return `
    <div class="swap-preview" aria-label="Previewed item swap">
      <div class="swap-item">
        <img src="${escapeHtml(swap.from.image || "")}" alt="${escapeHtml(swap.from.productDisplayName || "Current item")}" />
        <span>Current</span>
        <strong>${escapeHtml(swap.from.productDisplayName || "Current item")}</strong>
      </div>
      <div class="swap-arrow" aria-hidden="true">→</div>
      <div class="swap-item">
        <img src="${escapeHtml(swap.to.image || "")}" alt="${escapeHtml(swap.to.productDisplayName || "New item")}" />
        <span>New</span>
        <strong>${escapeHtml(swap.to.productDisplayName || "New item")}</strong>
      </div>
    </div>
  `;
}

function renderChat() {
  const hasRecommendation = Boolean(state.latest?.outfit?.length);
  const hasOpenAI = Boolean(state.bootstrap?.hasOpenAI);
  els.chatBlock.hidden = false;
  els.quickPrompts.hidden = state.isGenerating || !hasRecommendation || !hasOpenAI;
  els.chatForm.hidden = state.isGenerating || !hasRecommendation || !hasOpenAI;
  els.chatInput.disabled = !hasRecommendation || !hasOpenAI || state.chat.isBusy || state.isGenerating;
  els.chatForm.querySelector("button").disabled = !hasRecommendation || !hasOpenAI || state.chat.isBusy || state.isGenerating;

  if (state.isGenerating) {
    els.chatMessages.innerHTML = `
      <div class="chat-message from-agent">I'm reading the starter item, searching the catalog, and checking store availability before I show the outfit.</div>
      ${loadingProcessMarkup()}
    `;
    const activeStep = els.chatMessages.querySelector(".process-step.active");
    if (activeStep) {
      els.chatMessages.scrollTop = Math.max(0, activeStep.offsetTop - (els.chatMessages.clientHeight / 2) + (activeStep.clientHeight / 2));
    }
    return;
  }

  if (!hasOpenAI) {
    els.chatMessages.innerHTML = `<div class="chat-empty">OpenAI-powered chat refinement is unavailable in this environment, but the outfit recommendation still works with local fallback logic.</div>`;
    return;
  }

  const messages = state.chat.history.map((entry) => `
    <div class="chat-message ${entry.role === "user" ? "from-user" : "from-agent"}">
      ${escapeHtml(entry.role === "assistant" ? shopperFacingText(entry.content) : entry.content)}
    </div>
  `);

  if (state.chat.preview) {
    const basketValue = state.chat.preview.business?.basketValue || 0;
    const available = state.chat.preview.business ? `${state.chat.preview.business.availableToday}/${state.chat.preview.outfit.length}` : "";
    messages.push(`
      <div class="preview-card">
        <p class="eyebrow">Preview update</p>
        <strong>$${basketValue} basket</strong>
        <span>${escapeHtml(available)} available today</span>
        ${swapPreviewMarkup(state.chat.previewSwap)}
        <div class="preview-actions">
          <button type="button" data-chat-action="apply">Apply changes</button>
          <button type="button" data-chat-action="reject">Keep current</button>
        </div>
      </div>
    `);
  }

  if (state.chat.isBusy) {
    messages.push(`<div class="chat-message from-agent">Checking the catalog, store stock, and styling constraints...</div>`);
  }

  els.chatMessages.innerHTML = messages.join("") || `<div class="chat-empty">Generate an outfit, then I'll explain the recommendation and help refine it like a store stylist.</div>`;
  els.quickPrompts.innerHTML = promptButtonsMarkup(state.chat.suggestedPrompts);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function clearLoadingTimer() {
  if (state.loadingTimer) {
    clearInterval(state.loadingTimer);
    state.loadingTimer = null;
  }
}

function setGenerateButtonState(isLoading) {
  els.generateButton.disabled = isLoading;
  els.refreshButton.disabled = isLoading || !state.latest;
  els.generateButton.classList.toggle("is-loading", isLoading);
  els.generateButton.querySelector("span").textContent = isLoading ? "…" : "+";
  els.generateButton.querySelector("strong").textContent = isLoading ? "Generating..." : "Generate outfit";
}

function renderIdleState() {
  const hasOpenAI = Boolean(state.bootstrap?.hasOpenAI);
  els.statusLabel.textContent = hasOpenAI ? "OpenAI ready" : "Local fallback ready";
  els.statusDot.classList.toggle("is-live", hasOpenAI);
  els.analysisStrip.innerHTML = `
    <div>
      <p class="eyebrow">Ready when you are</p>
      <p><strong>Select a starter item, set the occasion, then generate the full look.</strong> The recommendation run starts only when you press the button.</p>
    </div>
    <div class="analysis-tags">
      <span>${hasOpenAI ? "OpenAI" : "Fallback"}</span>
      <span>RAG</span>
      <span>Inventory</span>
      <span>Guardrails</span>
    </div>
  `;
  els.productGrid.classList.remove("is-process");
  els.productGrid.innerHTML = `<div class="empty-state">Your outfit recommendations will appear here after you press Generate outfit.</div>`;
  els.kpiGrid.replaceChildren();
  els.insightBlock.innerHTML = "";
  els.pipelineList.replaceChildren(...loadingSteps.map((step) => {
    const li = document.createElement("li");
    li.textContent = step.title;
    return li;
  }));
  renderChat();
  setGenerateButtonState(false);
}

function renderLoadingProcess() {
  const hasOpenAI = Boolean(state.bootstrap?.hasOpenAI);
  els.statusLabel.textContent = hasOpenAI ? "OpenAI working" : "Local fallback working";
  els.statusDot.classList.toggle("is-live", hasOpenAI);
  els.analysisStrip.innerHTML = `
    <div>
      <p class="eyebrow">Stylist working</p>
      <p><strong>Building a verified, shoppable outfit.</strong> The live process is moving through the assistant rail.</p>
    </div>
    <div class="analysis-tags">
      <span>${hasOpenAI ? "OpenAI" : "Fallback"}</span>
      <span>RAG</span>
      <span>Inventory</span>
      <span>Guardrails</span>
    </div>
  `;
  els.productGrid.classList.add("is-process");
  els.productGrid.innerHTML = `<div class="empty-state loading-note">The OpenAI stylist assistant is building the recommendation. Follow the live progress in the assistant panel.</div>`;
  els.kpiGrid.replaceChildren();
  els.insightBlock.innerHTML = "";
  els.pipelineList.replaceChildren(...loadingSteps.map((step) => {
    const li = document.createElement("li");
    li.textContent = `${step.title}: ${step.service}`;
    return li;
  }));
  renderChat();
}

function scrollToProgress() {
  const target = window.matchMedia("(max-width: 1120px)").matches ? els.chatBlock : els.analysisStrip;
  window.setTimeout(() => {
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

function startLoadingProcess() {
  clearLoadingTimer();
  state.latest = null;
  state.changedProductIds = [];
  state.loadingStage = 0;
  state.loadingDone = false;
  state.isGenerating = true;
  setGenerateButtonState(true);
  renderChat();
  renderLoadingProcess();
  scrollToProgress();
  state.loadingTimer = setInterval(() => {
    state.loadingStage = Math.min(state.loadingStage + 1, loadingSteps.length - 1);
    renderLoadingProcess();
    if (state.loadingStage === loadingSteps.length - 1) clearLoadingTimer();
  }, 1650);
}

function finishLoadingProcess() {
  clearLoadingTimer();
  const remaining = [];
  for (let index = state.loadingStage + 1; index < loadingSteps.length; index += 1) {
    remaining.push(index);
  }
  return remaining
    .reduce((promise, index) => promise.then(() => {
      state.loadingStage = index;
      renderLoadingProcess();
      return new Promise((resolve) => setTimeout(resolve, 420));
    }), Promise.resolve())
    .then(() => {
      state.loadingStage = loadingSteps.length - 1;
      state.loadingDone = true;
      renderLoadingProcess();
      return new Promise((resolve) => setTimeout(resolve, 780));
    });
}

function renderResult(data, options = {}) {
  state.latest = data;
  state.changedProductIds = options.changedProductIds || [];
  state.loadingDone = false;
  state.isGenerating = false;
  setGenerateButtonState(false);
  if (options.seedChat) {
    state.chat.history = [{ role: "assistant", content: recommendationChatIntro(data) }];
  }
  state.chat.suggestedPrompts = data.suggestedPrompts || state.chat.suggestedPrompts || [];
  els.productGrid.classList.remove("is-process");
  const attrs = data.analysis.structuredAttributes;
  const liveSteps = [data.ai?.imageAnalysis, data.ai?.queryEmbeddings, data.ai?.copyGeneration, data.ai?.recommendationReview].filter((step) => step === "openai").length;
  els.statusLabel.textContent = liveSteps ? `OpenAI live (${liveSteps}/4)` : "Local fallback";
  els.statusDot.classList.toggle("is-live", Boolean(liveSteps));
  const aiSummary = liveSteps
    ? `OpenAI is live for ${[
        data.ai.imageAnalysis === "openai" ? "vision analysis" : null,
        data.ai.queryEmbeddings === "openai" ? "query embeddings" : null,
        data.ai.copyGeneration === "openai" ? "shopper explanation" : null,
        data.ai.recommendationReview === "openai" ? "final guardrail review" : null
      ].filter(Boolean).join(", ")}.`
    : "Using local fallback metadata and retrieval logic.";
  const introLines = data.analysis.introLines?.length
    ? data.analysis.introLines.map(shopperFacingText)
    : [
        `${data.analysis.item} was interpreted as a ${String(attrs.color).toLowerCase()} ${String(attrs.item_type).toLowerCase()}.`,
        `Recommendations are selected to complete the outfit for ${data.event.toLowerCase()}, not replace the starter item.`
      ].map(shopperFacingText);
  const outfitRationale = shopperFacingText(data.analysis.outfitRationale);
  els.analysisStrip.innerHTML = `
    <div>
      <p class="eyebrow">AI stylist readout</p>
      <p><strong>${escapeHtml(introLines[0])}</strong> ${escapeHtml(introLines[1])}</p>
      ${outfitRationale ? `<p class="ai-review">${escapeHtml(outfitRationale)}</p>` : ""}
      <p class="ai-detail">${escapeHtml(aiSummary)}</p>
    </div>
    <div class="analysis-tags">
      <span>${escapeHtml(attrs.category)}</span>
      <span>${escapeHtml(attrs.usage || "General")}</span>
      <span>${liveSteps ? "OpenAI" : "Fallback"}</span>
      <span>${data.urgency === "today" ? "Today" : "Network"}</span>
    </div>
  `;

  els.productGrid.replaceChildren(...data.outfit.map(productCard));
  if (!data.outfit.length) {
    els.productGrid.innerHTML = `<div class="empty-state">No complete outfit found for this constraint set. Try a wider budget or network availability.</div>`;
  }

  els.kpiGrid.replaceChildren(
    ...data.business.kpis.map((kpi) => {
      const div = document.createElement("div");
      div.className = "kpi";
      div.innerHTML = `<strong>${kpi.value}</strong><span>${kpi.label}</span>`;
      return div;
    })
  );

  const lowStock = data.business.lowStockNotes.length
    ? `<p><strong>Low stock:</strong> ${escapeHtml(data.business.lowStockNotes.join(" "))}</p>`
    : `<p><strong>Low stock:</strong> no immediate stock risks in the primary basket.</p>`;

  const substitutes = data.substitutions
    .slice(0, 3)
    .map((item) => `${item.productDisplayName} (${item.inventory[data.store] || 0} in store)`)
    .join("; ");

  els.insightBlock.innerHTML = `
    <p class="eyebrow">Missed demand insight</p>
    <p>${escapeHtml(data.business.demandInsight)}</p>
    ${lowStock}
    <p><strong>Substitutions:</strong> ${escapeHtml(substitutes || "none needed for this basket.")}</p>
    <div class="message-box">${escapeHtml(data.business.associatePrompt)}</div>
  `;

  els.pipelineList.replaceChildren(
    ...data.pipeline.map((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      return li;
    })
  );
  renderChat();
}

async function requestRecommendations() {
  const requestId = state.requestId + 1;
  state.requestId = requestId;
  resetChat();
  startLoadingProcess();
  const form = new FormData(els.form);
  try {
    const response = await fetch("/api/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inspirationId: state.selectedId,
        imageDataUrl: state.customImageDataUrl,
        eventType: form.get("eventType"),
        stylePreference: form.get("stylePreference"),
        store: form.get("store"),
        budgetMax: form.get("budgetMax"),
        urgency: form.get("urgency")
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Recommendation request failed");
    if (requestId !== state.requestId) return;
    await finishLoadingProcess();
    if (requestId === state.requestId) renderResult(data, { seedChat: true });
  } catch (error) {
    if (requestId !== state.requestId) return;
    clearLoadingTimer();
    state.loadingDone = false;
    state.isGenerating = false;
    setGenerateButtonState(false);
    renderChat();
    console.error(error);
    els.productGrid.classList.remove("is-process");
    els.productGrid.innerHTML = `<div class="empty-state">Something went wrong generating the outfit: ${escapeHtml(error.message)}</div>`;
  }
}

function currentConstraints() {
  const form = new FormData(els.form);
  return {
    eventType: form.get("eventType"),
    stylePreference: form.get("stylePreference"),
    storeId: form.get("store"),
    budgetMax: Number(form.get("budgetMax")),
    urgency: form.get("urgency")
  };
}

async function sendOutfitEmailFromChat(email) {
  const response = await fetch("/api/send-outfit-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      currentRecommendation: state.latest
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Email send failed");
  return data;
}

async function sendChatMessage(message) {
  const trimmed = String(message || "").trim();
  if (!trimmed || state.chat.isBusy || !state.bootstrap?.hasOpenAI) return;
  const emailAddress = extractEmailAddress(trimmed);
  const wantsEmail = isEmailIntent(trimmed) || state.chat.pendingEmail;
  state.chat.preview = null;
  state.chat.previewSwap = null;
  state.chat.previewChangedProductIds = [];
  state.chat.history.push({ role: "user", content: trimmed });

  if (!state.latest?.outfit?.length) {
    state.chat.history.push({
      role: "assistant",
      content: wantsEmail
        ? "Generate an outfit first, then I can email the full look with the stylist rationale."
        : "Generate an outfit first, then I can explain it or help refine alternatives."
    });
    renderChat();
    return;
  }

  state.chat.isBusy = true;
  renderChat();

  try {
    if (wantsEmail) {
      if (!emailAddress) {
        state.chat.pendingEmail = true;
        state.chat.history.push({ role: "assistant", content: "Of course. What email address should I send this outfit to?" });
        return;
      }
      await sendOutfitEmailFromChat(emailAddress);
      state.chat.pendingEmail = false;
      state.chat.history.push({
        role: "assistant",
        content: `Done — I sent this outfit to ${emailAddress}. The email includes Mira's styling rationale, item-by-item pairing notes, and the availability context.`
      });
      return;
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: trimmed,
        history: state.chat.history.slice(0, -1),
        currentRecommendation: state.latest,
        constraints: currentConstraints(),
        chatState: state.chat.chatState
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Chat request failed");
    state.chat.chatState = data.chatState || state.chat.chatState;
    state.chat.suggestedPrompts = data.suggestedPrompts || state.chat.suggestedPrompts;
    state.chat.history.push({ role: "assistant", content: data.assistantMessage || "I checked the basket." });
    if (data.action === "preview_update" && data.previewRecommendation) {
      state.chat.preview = data.previewRecommendation;
      state.chat.previewSwap = data.previewSwap || null;
      state.chat.previewChangedProductIds = data.changedProductIds || [];
    }
  } catch (error) {
    console.error(error);
    state.chat.history.push({ role: "assistant", content: wantsEmail ? `I could not send the email yet: ${error.message}. I kept your basket unchanged.` : `I could not complete that refinement: ${error.message}` });
  } finally {
    state.chat.isBusy = false;
    renderChat();
  }
}

function applyChatPreview() {
  if (!state.chat.preview) return;
  const preview = state.chat.preview;
  const changedProductIds = state.chat.previewChangedProductIds;
  state.chat.preview = null;
  state.chat.previewSwap = null;
  state.chat.previewChangedProductIds = [];
  state.chat.history.push({ role: "assistant", content: "Applied the previewed basket update." });
  renderResult(preview, { changedProductIds });
}

function rejectChatPreview() {
  state.chat.preview = null;
  state.chat.previewSwap = null;
  state.chat.previewChangedProductIds = [];
  state.chat.history.push({ role: "assistant", content: "No problem. I kept the current basket unchanged." });
  renderChat();
}

async function init() {
  const response = await fetch("/api/bootstrap");
  state.bootstrap = await response.json();
  state.selectedId = state.bootstrap.inspiration[0].id;
  optionList(els.eventType, state.bootstrap.events);
  optionList(els.stylePreference, state.bootstrap.styles);
  storeOptions(els.store, state.bootstrap.stores);
  renderInspiration();
  renderIdleState();
}

els.budgetMax.addEventListener("input", () => {
  els.budgetReadout.textContent = `$${els.budgetMax.value} max basket`;
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  requestRecommendations();
});

els.refreshButton.addEventListener("click", requestRecommendations);

els.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = els.chatInput.value;
  els.chatInput.value = "";
  sendChatMessage(message);
});

els.quickPrompts.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  sendChatMessage(button.textContent);
});

els.chatMessages.addEventListener("click", (event) => {
  const action = event.target.closest("[data-chat-action]")?.dataset.chatAction;
  if (action === "apply") applyChatPreview();
  if (action === "reject") rejectChatPreview();
});

els.uploadZone.addEventListener("click", (event) => {
  if (event.target === els.clearUpload) return;
  els.imageUpload.click();
});

els.uploadZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.imageUpload.click();
  }
});

els.imageUpload.addEventListener("change", () => {
  loadImageFile(els.imageUpload.files?.[0]);
  els.imageUpload.value = "";
});

els.clearUpload.addEventListener("click", (event) => {
  event.stopPropagation();
  state.customImageDataUrl = null;
  renderInspiration();
  resetRecommendationView();
});

els.uploadZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.uploadZone.classList.add("is-dragging");
});

els.uploadZone.addEventListener("dragleave", () => {
  els.uploadZone.classList.remove("is-dragging");
});

els.uploadZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.uploadZone.classList.remove("is-dragging");
  loadImageFile(event.dataTransfer.files?.[0]);
});

window.addEventListener("paste", (event) => {
  const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith("image/"));
  if (item) loadImageFile(item.getAsFile());
});

init().catch((error) => {
  console.error(error);
  els.productGrid.innerHTML = `<div class="empty-state">Something went wrong loading the demo: ${error.message}</div>`;
});
