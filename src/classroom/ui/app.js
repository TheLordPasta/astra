const state = {
  key: "", sessions: [], currentSession: null, contextTab: "lessons",
  busy: false, epoch: 0, contextRequest: 0,
};
const $ = (id) => document.getElementById(id);
const login = $("login");
const app = $("app");
const input = $("input");
const send = $("send");
const sessionsEl = $("sessions");
const messages = $("messages");
const sessionDialog = $("sessionDialog");

async function api(path, options = {}) {
  const epoch = state.epoch;
  const headers = new Headers(options.headers || {});
  headers.set("x-classroom-key", state.key);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers });
  const body = await response.json();
  if (epoch !== state.epoch) throw new Error("Workspace locked.");
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function activity(text) { $("activity").textContent = text; }
function showNotice(text) {
  $("notice").textContent = text;
  $("notice").hidden = !text;
}
function setBusy(busy) {
  state.busy = busy;
  input.disabled = busy || !state.key;
  send.disabled = busy || !state.key;
  $("newSession").disabled = busy;
  $("createSession").disabled = busy;
  for (const button of sessionsEl.querySelectorAll("button")) button.disabled = busy;
}
function formatDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
    : "";
}
function renderStarters() {
  const texts = [
    "I want to teach you a new fabric name.",
    "Help me study a specific textile topic.",
    "What do we already know about bridal lace in Israel?",
    "Review the Classroom and suggest improvements without changing code yet.",
  ];
  for (const text of texts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "starter";
    button.textContent = text;
    button.addEventListener("click", () => {
      if (state.busy) return;
      input.value = text;
      input.focus();
    });
    $("starters").appendChild(button);
  }
}
function renderSessions() {
  const query = $("sessionSearch").value.trim().toLowerCase();
  const filtered = state.sessions.filter((session) => String(session.title || "").toLowerCase().includes(query));
  sessionsEl.replaceChildren();
  $("sessionCount").textContent = String(state.sessions.length);
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "caption";
    empty.textContent = query ? "No matching conversations." : "No conversations yet.";
    sessionsEl.appendChild(empty);
  }
  for (const session of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session";
    button.disabled = state.busy;
    button.setAttribute("aria-current", String(state.currentSession?.id === session.id));
    const title = document.createElement("span");
    title.className = "session-title";
    title.textContent = session.title || `Conversation ${session.id}`;
    const meta = document.createElement("small");
    meta.textContent = formatDate(session.updatedAt || session.createdAt) || "Recent";
    button.append(title, meta);
    button.addEventListener("click", () => { void openSession(session.id); });
    sessionsEl.appendChild(button);
  }
}
function renderMessages(session) {
  messages.replaceChildren();
  const items = (session?.messages || []).filter((item) => item.role === "user" || item.role === "assistant");
  $("welcome").hidden = items.length > 0;
  for (const message of items) {
    const article = document.createElement("article");
    article.className = `message ${message.role}`;
    const header = document.createElement("div");
    header.className = "message-header";
    header.textContent = message.role === "user" ? "You" : "Mush Mush";
    const body = document.createElement("div");
    body.className = "message-body";
    const paragraph = document.createElement("p");
    paragraph.dir = "auto";
    // Treat all model/customer content as text, never executable HTML.
    paragraph.textContent = message.content || "";
    body.appendChild(paragraph);
    article.append(header, body);
    messages.appendChild(article);
  }
  $("conversation").scrollTop = $("conversation").scrollHeight;
}
function selectSession(session) {
  state.currentSession = session;
  $("sessionTitle").textContent = session.title || `Conversation ${session.id}`;
  renderMessages(session);
  renderSessions();
  app.classList.remove("navigation-open");
  $("navigationToggle").setAttribute("aria-expanded", "false");
}
async function loadSessions() {
  const sessions = await api("/api/sessions");
  state.sessions = Array.isArray(sessions) ? sessions : [];
  renderSessions();
}
async function openSession(id) {
  if (state.busy) return;
  const epoch = state.epoch;
  setBusy(true);
  showNotice("");
  activity("Loading…");
  try {
    selectSession(await api(`/api/sessions/${id}`));
    input.value = "";
    activity("Ready");
  } catch (error) {
    if (epoch === state.epoch) { showNotice(error.message); activity("Error"); }
  } finally {
    if (epoch === state.epoch) setBusy(false);
  }
}
async function createSession(title) {
  const session = await api("/api/sessions", {
    method: "POST", body: JSON.stringify({ title }),
  });
  state.sessions.unshift(session);
  selectSession(session);
  return session;
}
function renderContextItems(items) {
  $("contextItems").replaceChildren();
  if (!Array.isArray(items) || !items.length) {
    const empty = document.createElement("p");
    empty.className = "caption";
    empty.textContent = "Nothing stored yet.";
    $("contextItems").appendChild(empty);
    return;
  }
  for (const item of items) {
    const card = document.createElement("details");
    card.className = "context-item";
    const title = document.createElement("summary");
    title.textContent = item.title || item.subject || `#${item.id}`;
    const status = document.createElement("small");
    status.className = "record-status";
    status.textContent = `#${item.id} · ${item.status || "Unknown status"}`;
    const content = document.createElement("p");
    content.dir = "auto";
    content.textContent = item.content || item.statement || "";
    title.appendChild(status);
    card.append(title, content);
    $("contextItems").appendChild(card);
  }
}
async function loadContext() {
  if (!state.key) return;
  const epoch = state.epoch;
  const request = ++state.contextRequest;
  $("contextStatus").textContent = "Loading…";
  try {
    const items = await api(state.contextTab === "lessons" ? "/api/lessons" : "/api/insights");
    if (request !== state.contextRequest) return;
    renderContextItems(items);
    $("contextStatus").textContent = `${Array.isArray(items) ? items.length : 0} stored`;
  } catch (error) {
    if (epoch === state.epoch && request === state.contextRequest) $("contextStatus").textContent = error.message;
  }
}
function lockWorkspace() {
  state.epoch++;
  state.contextRequest++;
  state.key = "";
  state.sessions = [];
  state.currentSession = null;
  state.contextTab = "lessons";
  $("lessonsTab").setAttribute("aria-pressed", "true");
  $("insightsTab").setAttribute("aria-pressed", "false");
  $("contextHelp").textContent = "Stored lessons and their approval status. Read-only here.";
  $("key").value = "";
  input.value = "";
  $("newTitle").value = "";
  $("sessionSearch").value = "";
  $("contextItems").replaceChildren();
  $("contextStatus").textContent = "";
  messages.replaceChildren();
  sessionsEl.replaceChildren();
  $("sessionTitle").textContent = "Classroom";
  $("sessionCount").textContent = "0";
  $("welcome").hidden = false;
  showNotice("");
  sessionDialog.close();
  setBusy(false);
  app.hidden = true;
  login.hidden = false;
  $("loginError").textContent = "";
  $("key").focus();
  // Locking hides local data; it does not cancel work already running server-side.
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = $("key").value.trim();
  if (!key) { $("loginError").textContent = "Enter your Classroom key."; return; }
  $("loginButton").disabled = true;
  $("loginError").textContent = "";
  state.key = key;
  try {
    await loadSessions();
    login.hidden = true;
    app.hidden = false;
    $("key").value = "";
    if (state.sessions.length) await openSession(state.sessions[0].id);
    else { renderMessages(null); activity("Ready"); setBusy(false); }
    await loadContext();
  } catch (error) {
    state.key = "";
    $("loginError").textContent = error.status === 401 ? "Invalid Classroom key." : error.message;
  } finally {
    $("loginButton").disabled = false;
  }
});
$("newSession").addEventListener("click", () => {
  if (state.busy) return;
  $("newTitle").value = "";
  $("sessionError").textContent = "";
  sessionDialog.showModal();
  $("newTitle").focus();
});
$("cancelSession").addEventListener("click", () => sessionDialog.close());
$("sessionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const title = $("newTitle").value.trim();
  if (!title) { $("sessionError").textContent = "Conversation title is required."; return; }
  const epoch = state.epoch;
  setBusy(true);
  try {
    await createSession(title);
    input.value = "";
    showNotice("");
    activity("Ready");
    sessionDialog.close();
  } catch (error) {
    if (epoch === state.epoch) $("sessionError").textContent = error.message;
  } finally {
    if (epoch === state.epoch) setBusy(false);
  }
});
$("messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || state.busy || !state.key) return;
  const epoch = state.epoch;
  setBusy(true);
  showNotice("");
  activity("Mush Mush is working…");
  let completed = false;
  try {
    if (!state.currentSession) await createSession("Classroom conversation");
    const id = state.currentSession.id;
    input.value = "";
    renderMessages({ messages: [...(state.currentSession.messages || []), { role: "user", content: message }] });
    const result = await api(`/api/sessions/${id}/messages`, {
      method: "POST", body: JSON.stringify({ message }),
    });
    completed = true;
    // Keep the returned report visible even if refreshing the history fails.
    state.currentSession.messages = [
      ...(state.currentSession.messages || []),
      { role: "user", content: message },
      { role: "assistant", content: result.response },
    ];
    renderMessages(state.currentSession);
    activity("Ready");
    selectSession(await api(`/api/sessions/${id}`));
    await loadSessions();
    await loadContext();
  } catch (error) {
    if (epoch === state.epoch) {
      if (!completed) input.value = message;
      showNotice(completed
        ? `The response completed, but refreshing failed: ${error.message}`
        : `${error.message} Work may already have been saved or performed. Reopen the conversation and check before resending.`);
      activity(completed ? "Ready" : "Check conversation");
    }
  } finally {
    if (epoch === state.epoch) { setBusy(false); input.focus(); }
  }
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!send.disabled) $("messageForm").requestSubmit();
  }
});
$("sessionSearch").addEventListener("input", renderSessions);
$("lock").addEventListener("click", lockWorkspace);
$("refreshContext").addEventListener("click", () => { void loadContext(); });
for (const tab of ["lessons", "insights"]) {
  $(`${tab}Tab`).addEventListener("click", () => {
    state.contextTab = tab;
    $("lessonsTab").setAttribute("aria-pressed", String(tab === "lessons"));
    $("insightsTab").setAttribute("aria-pressed", String(tab === "insights"));
    $("contextHelp").textContent = tab === "lessons"
      ? "Stored lessons and their approval status. Read-only here."
      : "Proposed and approved insights. Proposals require your explicit approval.";
    $("contextItems").replaceChildren();
    void loadContext();
  });
}
$("contextToggle").addEventListener("click", () => {
  const hidden = app.classList.toggle("context-hidden");
  $("context").hidden = hidden;
  $("contextToggle").setAttribute("aria-expanded", String(!hidden));
});
$("navigationToggle").addEventListener("click", () => {
  const open = app.classList.toggle("navigation-open");
  $("navigationToggle").setAttribute("aria-expanded", String(open));
});
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !app.hidden) {
    event.preventDefault();
    if (!state.busy) $("newSession").click();
  }
});
renderStarters();
setBusy(false);
