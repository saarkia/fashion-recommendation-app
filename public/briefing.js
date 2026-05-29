let briefingContent = null;
let briefingPin = sessionStorage.getItem("briefingEditPin") || "";
let editMode = false;
let saveTimer = null;
let activeQuery = "chat";
let activeChannel = "web";
let activeArchitecture = "intent";
let activePlatform = "vision";
let activeValue = "conversion";
let requiresPin = false;

const navButtons = [...document.querySelectorAll(".brief-nav-button")];
const sections = [...document.querySelectorAll("[data-brief-step]")];
const queryDetail = document.querySelector("#queryDetail");
const channelDetail = document.querySelector("#channelDetail");
const architectureDetail = document.querySelector("#architectureDetail");
const platformDetail = document.querySelector("#platformDetail");
const valueDetail = document.querySelector("#valueDetail");
const editButton = document.querySelector("#editBrief");
const resetButton = document.querySelector("#resetBrief");
const saveStatus = document.querySelector("#briefSaveStatus");

function textValue(value) {
  return String(value ?? "");
}

function displayText(value) {
  return textValue(value).replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function editableHtml(value, path) {
  return `<span data-edit-path="${escapeHtml(path)}">${escapeHtml(value)}</span>`;
}

function getPath(path) {
  return path.split(".").reduce((value, key) => value?.[key], briefingContent);
}

function setPath(path, value) {
  const keys = path.split(".");
  let target = briefingContent;
  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== "object") target[key] = {};
    target = target[key];
  }
  target[keys.at(-1)] = value;
}

function setStatus(message, state = "") {
  if (!saveStatus) return;
  saveStatus.textContent = message;
  saveStatus.dataset.state = state;
}

function fieldEntries() {
  return Object.entries(briefingContent?.fields || {});
}

function applyStaticFields() {
  for (const [key, field] of fieldEntries()) {
    const element = document.querySelector(field.selector);
    if (!element) continue;
    element.textContent = field.value;
    element.dataset.editKey = key;
  }
}

function captureStaticField(element) {
  const field = briefingContent?.fields?.[element.dataset.editKey];
  if (!field) return;
  field.value = displayText(element.textContent);
}

function capturePathField(element) {
  const path = element.dataset.editPath;
  if (!path) return;
  setPath(path, displayText(element.textContent));
}

function captureElement(element) {
  if (element.dataset.editKey) captureStaticField(element);
  if (element.dataset.editPath) capturePathField(element);
}

function collectVisibleEdits() {
  document.querySelectorAll("[data-edit-key], [data-edit-path]").forEach(captureElement);
}

async function saveBriefingContent({ immediate = false } = {}) {
  if (!editMode) return;
  collectVisibleEdits();
  window.clearTimeout(saveTimer);
  const run = async () => {
    setStatus("Saving", "saving");
    try {
      const response = await fetch("/api/briefing-content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pin: briefingPin,
          updatedBy: "anonymous",
          content: briefingContent
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save briefing.");
      briefingContent = payload.content;
      setStatus("Saved", "saved");
    } catch (error) {
      setStatus(`Error: ${error.message}`, "error");
    } finally {
      applyEditMode();
    }
  };
  if (immediate) return run();
  saveTimer = window.setTimeout(run, 700);
}

function applyEditMode() {
  document.body.classList.toggle("brief-edit-mode", editMode);
  editButton.textContent = editMode ? "Done" : "Edit";
  resetButton.hidden = !editMode;
  document.querySelectorAll("[data-edit-key], [data-edit-path]").forEach((element) => {
    element.contentEditable = editMode ? "true" : "false";
    element.spellcheck = editMode;
    element.classList.toggle("brief-editable", editMode);
    element.removeEventListener("input", onEditableInput);
    element.removeEventListener("blur", onEditableBlur);
    if (editMode) {
      element.addEventListener("input", onEditableInput);
      element.addEventListener("blur", onEditableBlur);
    }
  });
}

function onEditableInput(event) {
  captureElement(event.currentTarget);
  saveBriefingContent();
}

function onEditableBlur(event) {
  captureElement(event.currentTarget);
  saveBriefingContent({ immediate: true });
}

function renderQuery(key) {
  activeQuery = key;
  const content = briefingContent?.interactiveContent?.query || {};
  const item = content[key] || content.chat;
  if (!item) return;
  queryDetail.innerHTML = `
    <p class="eyebrow">${editableHtml(item.label, `interactiveContent.query.${key}.label`)}</p>
    <h3>${editableHtml(item.title, `interactiveContent.query.${key}.title`)}</h3>
    <div class="chat-example">
      <span>Customer input</span>
      <strong>${editableHtml(item.input, `interactiveContent.query.${key}.input`)}</strong>
    </div>
    <div class="detail-columns">
      <div><span>Assistant output</span><p>${editableHtml(item.output, `interactiveContent.query.${key}.output`)}</p></div>
      <div><span>Business value</span><p>${editableHtml(item.value, `interactiveContent.query.${key}.value`)}</p></div>
    </div>
  `;
  document.querySelectorAll(".query-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.query === key);
  });
  applyEditMode();
}

function renderChannel(key) {
  activeChannel = key;
  const content = briefingContent?.interactiveContent?.channel || {};
  const item = content[key] || content.web;
  if (!item) return;
  channelDetail.innerHTML = `
    <p class="eyebrow">Deployment surface</p>
    <h3>${editableHtml(item.title, `interactiveContent.channel.${key}.title`)}</h3>
    <div class="detail-columns">
      <div><span>Channel role</span><p>${editableHtml(item.job, `interactiveContent.channel.${key}.job`)}</p></div>
      <div><span>OpenAI enabler</span><p>${editableHtml(item.enabler, `interactiveContent.channel.${key}.enabler`)}</p></div>
      <div><span>Outcome</span><p>${editableHtml(item.outcome, `interactiveContent.channel.${key}.outcome`)}</p></div>
    </div>
  `;
  document.querySelectorAll(".channel-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.channel === key);
  });
  applyEditMode();
}

function renderArchitecture(key) {
  activeArchitecture = key;
  const content = briefingContent?.interactiveContent?.architecture || {};
  const item = content[key] || content.intent;
  if (!item) return;
  architectureDetail.innerHTML = `
    <p class="eyebrow">${editableHtml(item.primitive, `interactiveContent.architecture.${key}.primitive`)}</p>
    <h3>${editableHtml(item.title, `interactiveContent.architecture.${key}.title`)}</h3>
    <p>${editableHtml(item.body, `interactiveContent.architecture.${key}.body`)}</p>
    <strong>${editableHtml(item.value, `interactiveContent.architecture.${key}.value`)}</strong>
  `;
  document.querySelectorAll(".flow-node").forEach((button) => {
    button.classList.toggle("active", button.dataset.arch === key);
  });
  applyEditMode();
}

function renderPlatform(key) {
  activePlatform = key;
  const content = briefingContent?.interactiveContent?.platform || {};
  const item = content[key] || content.vision;
  if (!item) return;
  platformDetail.innerHTML = `
    <p class="eyebrow">${editableHtml(item.title, `interactiveContent.platform.${key}.title`)}</p>
    <h3>${editableHtml(item.headline, `interactiveContent.platform.${key}.headline`)}</h3>
    <div class="detail-columns">
      <div><span>Use in solution</span><p>${editableHtml(item.use, `interactiveContent.platform.${key}.use`)}</p></div>
      <div><span>Business value</span><p>${editableHtml(item.value, `interactiveContent.platform.${key}.value`)}</p></div>
    </div>
  `;
  document.querySelectorAll(".platform-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.platform === key);
  });
  applyEditMode();
}

function renderValue(key) {
  activeValue = key;
  const content = briefingContent?.interactiveContent?.value || {};
  const item = content[key] || content.conversion;
  if (!item) return;
  valueDetail.innerHTML = `
    <p class="eyebrow">Value driver</p>
    <h3>${editableHtml(item.title, `interactiveContent.value.${key}.title`)}</h3>
    <div class="detail-columns">
      <div><span>Goal</span><p>${editableHtml(item.goal, `interactiveContent.value.${key}.goal`)}</p></div>
      <div><span>OpenAI enabler</span><p>${editableHtml(item.enabler, `interactiveContent.value.${key}.enabler`)}</p></div>
      <div><span>Metric</span><p>${editableHtml(item.metric, `interactiveContent.value.${key}.metric`)}</p></div>
    </div>
  `;
  document.querySelectorAll(".value-button").forEach((button) => {
    const active = button.dataset.value === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  applyEditMode();
}

function renderInteractiveContent() {
  renderQuery(activeQuery);
  renderChannel(activeChannel);
  renderArchitecture(activeArchitecture);
  renderPlatform(activePlatform);
  renderValue(activeValue);
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

async function fetchBriefingContent() {
  const response = await fetch("/api/briefing-content");
  if (!response.ok) throw new Error("Could not load briefing content.");
  const payload = await response.json();
  briefingContent = payload.content;
  requiresPin = Boolean(payload.requiresPin);
  setStatus(payload.source === "blob" ? "Live" : "Default", payload.source);
  applyStaticFields();
  renderInteractiveContent();
  applyEditMode();
}

async function toggleEditMode() {
  if (!editMode && requiresPin && !briefingPin) {
    briefingPin = window.prompt("Enter briefing edit PIN") || "";
    if (!briefingPin) return;
    sessionStorage.setItem("briefingEditPin", briefingPin);
  }
  if (editMode) await saveBriefingContent({ immediate: true });
  editMode = !editMode;
  setStatus(editMode ? "Editing" : "Saved", editMode ? "editing" : "saved");
  applyEditMode();
}

async function resetBriefingContent() {
  if (!window.confirm("Reset the executive briefing to the default content?")) return;
  setStatus("Resetting", "saving");
  try {
    const response = await fetch("/api/briefing-content/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: briefingPin, updatedBy: "anonymous" })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not reset briefing.");
    briefingContent = payload.content;
    applyStaticFields();
    renderInteractiveContent();
    setStatus("Reset", "saved");
  } catch (error) {
    setStatus(`Error: ${error.message}`, "error");
  }
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveSection(button.dataset.target));
});

document.querySelector("#startBrief")?.addEventListener("click", () => setActiveSection("situation"));
document.querySelector("#printBrief")?.addEventListener("click", () => window.print());
editButton?.addEventListener("click", toggleEditMode);
resetButton?.addEventListener("click", resetBriefingContent);

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

fetchBriefingContent()
  .then(syncActiveSection)
  .catch((error) => {
    console.error(error);
    setStatus("Content load error", "error");
  });
