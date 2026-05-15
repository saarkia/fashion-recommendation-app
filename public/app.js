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
    previewChangedProductIds: [],
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
    detail: "Checks that the outfit actually works and that the customer-facing explanation makes sense."
  }
];

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
        requestRecommendations();
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
    requestRecommendations();
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
    previewChangedProductIds: [],
    isBusy: false
  };
  state.changedProductIds = [];
}

function loadingProcessMarkup() {
  const active = state.loadingStage;
  const rows = loadingSteps.map((step, index) => {
    const status = state.loadingDone || index < active ? "complete" : index === active ? "active" : "pending";
    const label = status === "complete" ? "Done" : status === "active" ? "Running" : "Queued";
    return `
      <article class="process-step ${status}">
        <div class="process-marker">${status === "complete" ? "✓" : index + 1}</div>
        <div>
          <div class="process-step-header">
            <h3>${escapeHtml(step.title)}</h3>
            <span>${escapeHtml(step.service)}</span>
          </div>
          <p>${escapeHtml(step.detail)}</p>
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
      <div class="process-steps">${rows}</div>
    </section>
  `;
}

function recommendationChatIntro(data) {
  const intro = data.analysis?.introLines || [];
  const rationale = data.analysis?.outfitRationale || "";
  const products = (data.outfit || [])
    .map((product) => `${product.role}: ${product.productDisplayName}`)
    .join("; ");
  return [
    intro.join(" "),
    rationale,
    products ? `I found ${data.outfit.length} shoppable pieces: ${products}.` : ""
  ].filter(Boolean).join("\n\n");
}

function renderChat() {
  const hasRecommendation = Boolean(state.latest?.outfit?.length);
  const hasOpenAI = Boolean(state.bootstrap?.hasOpenAI);
  els.chatBlock.hidden = false;
  els.quickPrompts.hidden = state.isGenerating || !hasRecommendation;
  els.chatForm.hidden = state.isGenerating;
  els.chatInput.disabled = !hasRecommendation || !hasOpenAI || state.chat.isBusy || state.isGenerating;
  els.chatForm.querySelector("button").disabled = !hasRecommendation || !hasOpenAI || state.chat.isBusy || state.isGenerating;

  if (!hasOpenAI) {
    els.chatMessages.innerHTML = `<div class="chat-empty">OpenAI API key required for agentic chat refinement.</div>`;
    return;
  }

  if (state.isGenerating) {
    els.chatMessages.innerHTML = `
      <div class="chat-message from-agent">I’m building the basket now. I’ll show products only after the final guardrail review confirms the outfit and explanation are sound.</div>
      ${loadingProcessMarkup()}
    `;
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    return;
  }

  const messages = state.chat.history.map((entry) => `
    <div class="chat-message ${entry.role === "user" ? "from-user" : "from-agent"}">
      ${escapeHtml(entry.content)}
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
        <div class="preview-actions">
          <button type="button" data-chat-action="apply">Apply changes</button>
          <button type="button" data-chat-action="reject">Keep current</button>
        </div>
      </div>
    `);
  }

  if (state.chat.isBusy) {
    messages.push(`<div class="chat-message from-agent">Checking the catalog and styling constraints...</div>`);
  }

  els.chatMessages.innerHTML = messages.join("") || `<div class="chat-empty">Generate an outfit, then I’ll explain the recommendation and help refine it.</div>`;
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
  els.refreshButton.disabled = isLoading;
  els.generateButton.classList.toggle("is-loading", isLoading);
  els.generateButton.querySelector("span").textContent = isLoading ? "…" : "+";
  els.generateButton.querySelector("strong").textContent = isLoading ? "Generating..." : "Generate outfit";
}

function renderLoadingProcess() {
  const hasOpenAI = Boolean(state.bootstrap?.hasOpenAI);
  els.statusLabel.textContent = hasOpenAI ? "OpenAI working" : "Local fallback working";
  els.statusDot.classList.toggle("is-live", hasOpenAI);
  els.analysisStrip.innerHTML = `
    <div>
      <p class="eyebrow">Stylist working</p>
      <p><strong>Building a verified, shoppable outfit.</strong> Follow the live process in the assistant panel.</p>
    </div>
    <div class="analysis-tags">
      <span>${hasOpenAI ? "OpenAI" : "Fallback"}</span>
      <span>RAG</span>
      <span>Inventory</span>
      <span>Guardrails</span>
    </div>
  `;
  els.productGrid.classList.remove("is-process");
  els.productGrid.innerHTML = `<div class="empty-state">Recommendations will appear here after the final AI guardrail review finishes.</div>`;
  els.kpiGrid.replaceChildren();
  els.insightBlock.innerHTML = "";
  els.pipelineList.replaceChildren(...loadingSteps.map((step) => {
    const li = document.createElement("li");
    li.textContent = `${step.title}: ${step.service}`;
    return li;
  }));
  renderChat();
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
  state.loadingTimer = setInterval(() => {
    state.loadingStage = Math.min(state.loadingStage + 1, loadingSteps.length - 1);
    renderLoadingProcess();
    if (state.loadingStage === loadingSteps.length - 1) clearLoadingTimer();
  }, 1450);
}

function finishLoadingProcess() {
  clearLoadingTimer();
  state.loadingStage = loadingSteps.length - 1;
  state.loadingDone = true;
  renderLoadingProcess();
  return new Promise((resolve) => setTimeout(resolve, 450));
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
  els.productGrid.classList.remove("is-process");
  const attrs = data.analysis.structuredAttributes;
  const liveSteps = [data.ai?.imageAnalysis, data.ai?.queryEmbeddings, data.ai?.copyGeneration, data.ai?.recommendationReview].filter((step) => step === "openai").length;
  els.statusLabel.textContent = liveSteps ? `OpenAI live (${liveSteps}/4)` : "Local fallback";
  els.statusDot.classList.toggle("is-live", Boolean(liveSteps));
  const aiSummary = liveSteps
    ? `OpenAI is live for ${[
        data.ai.imageAnalysis === "openai" ? "vision analysis" : null,
        data.ai.queryEmbeddings === "openai" ? "query embeddings" : null,
        data.ai.copyGeneration === "openai" ? "customer explanation" : null,
        data.ai.recommendationReview === "openai" ? "final guardrail review" : null
      ].filter(Boolean).join(", ")}.`
    : "Using local fallback metadata and retrieval logic.";
  const introLines = data.analysis.introLines?.length
    ? data.analysis.introLines
    : [
        `${data.analysis.item} was interpreted as a ${String(attrs.color).toLowerCase()} ${String(attrs.item_type).toLowerCase()}.`,
        `Recommendations are selected to complete the outfit for ${data.event.toLowerCase()}, not replace the starter item.`
      ];
  els.analysisStrip.innerHTML = `
    <div>
      <p class="eyebrow">AI stylist readout</p>
      <p><strong>${escapeHtml(introLines[0])}</strong> ${escapeHtml(introLines[1])}</p>
      ${data.analysis.outfitRationale ? `<p class="ai-review">${escapeHtml(data.analysis.outfitRationale)}</p>` : ""}
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

async function sendChatMessage(message) {
  const trimmed = String(message || "").trim();
  if (!trimmed || !state.latest || state.chat.isBusy || !state.bootstrap?.hasOpenAI) return;
  state.chat.preview = null;
  state.chat.previewChangedProductIds = [];
  state.chat.history.push({ role: "user", content: trimmed });
  state.chat.isBusy = true;
  renderChat();

  try {
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
    state.chat.history.push({ role: "assistant", content: data.assistantMessage || "I checked the basket." });
    if (data.action === "preview_update" && data.previewRecommendation) {
      state.chat.preview = data.previewRecommendation;
      state.chat.previewChangedProductIds = data.changedProductIds || [];
    }
  } catch (error) {
    console.error(error);
    state.chat.history.push({ role: "assistant", content: `I could not complete that refinement: ${error.message}` });
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
  state.chat.previewChangedProductIds = [];
  state.chat.history.push({ role: "assistant", content: "Applied the previewed basket update." });
  renderResult(preview, { changedProductIds });
}

function rejectChatPreview() {
  state.chat.preview = null;
  state.chat.previewChangedProductIds = [];
  state.chat.history.push({ role: "assistant", content: "No problem. I kept the current basket unchanged." });
  renderChat();
}

async function init() {
  const response = await fetch("/api/bootstrap");
  state.bootstrap = await response.json();
  els.statusLabel.textContent = state.bootstrap.hasOpenAI ? "OpenAI configured" : "Local fallback";
  els.statusDot.classList.toggle("is-live", Boolean(state.bootstrap.hasOpenAI));
  state.selectedId = state.bootstrap.inspiration[0].id;
  optionList(els.eventType, state.bootstrap.events);
  optionList(els.stylePreference, state.bootstrap.styles);
  storeOptions(els.store, state.bootstrap.stores);
  renderInspiration();
  await requestRecommendations();
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
  requestRecommendations();
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
