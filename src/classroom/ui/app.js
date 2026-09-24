const state = {
  key: "",
  sessions: [],
  currentSession: null,
  currentMode: "TEACH",
  contextTab: "lessons",
};

const $ = (id) => document.getElementById(id);

const login = $("login");
const app = $("app");
const loginForm = $("loginForm");
const loginButton = $("loginButton");
const loginError = $("loginError");
const keyInput = $("key");

const newSessionButton = $("newSession");
const sessionsEl = $("sessions");
const sessionCount = $("sessionCount");
const sessionSearch = $("sessionSearch");

const modeButtons = [...document.querySelectorAll("[data-mode]")];
const modeTitle = $("modeTitle");
const sessionTitle = $("sessionTitle");
const activity = $("activity");

const welcome = $("welcome");
const welcomeTitle = $("welcomeTitle");
const welcomeDescription = $("welcomeDescription");
const starters = $("starters");
const messages = $("messages");

const messageForm = $("messageForm");
const input = $("input");
const send = $("send");
const composerMode = $("composerMode");

const notice = $("notice");

const context = $("context");
const contextToggle = $("contextToggle");
const contextMode = $("contextMode");
const modeDescription = $("modeDescription");
const contextItems = $("contextItems");
const contextStatus = $("contextStatus");
const refreshContext = $("refreshContext");
const lessonsTab = $("lessonsTab");
const insightsTab = $("insightsTab");

const lockButton = $("lock");

const navigationToggle = $("navigationToggle");
const sidebar = $("sidebar");

const sessionDialog = $("sessionDialog");
const sessionForm = $("sessionForm");
const newTitle = $("newTitle");
const newMode = $("newMode");
const sessionError = $("sessionError");
const cancelSession = $("cancelSession");

const modeInfo = {
  TEACH: {
    title: "Teach",
    description:
      "Explicitly teach Mush Mush knowledge, rules, preferences, and operating principles.",
    welcome:
      "Teach Mush Mush directly. Approved lessons become part of his private operating knowledge.",
    starters: [
      "I want to teach you something about Classic Textile.",
      "Remember this rule when speaking with customers.",
      "Here is how I want you to behave in this situation.",
    ],
  },

  LEARN: {
    title: "Learn",
    description:
      "Analyze stored customer conversations and identify grounded customer-level patterns.",
    welcome:
      "Study real customer evidence already stored in Astra without turning assumptions into facts.",
    starters: [
      "Analyze what customers have been asking for recently.",
      "Look for repeated preferences across stored customer conversations.",
      "What customer observations are supported by our data?",
    ],
  },

  RESEARCH: {
    title: "Research",
    description:
      "Explore external evidence and market memory when explicitly instructed.",
    welcome:
      "Investigate fashion and textile questions using evidence, sources, and persistent research memory.",
    starters: [
      "Research current bridal lace signals in Israel.",
      "Check what we already know about this market before researching.",
      "Investigate this trend and separate evidence from uncertainty.",
    ],
  },

  DEVELOPER: {
    title: "Developer",
    description:
      "Inspect and improve Astra through controlled development tools and human-reviewed Git workflow.",
    welcome:
      "Work directly on Astra: inspect code, implement changes, validate them, and prepare them for human review.",
    starters: [
      "Inspect Astra and explain the current architecture.",
      "Review the current developer Git state.",
      "Implement this improvement and validate it before committing.",
    ],
  },
};

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});

  headers.set("x-classroom-key", state.key);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";

  let body;

  if (contentType.includes("application/json")) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body?.error
        ? body.error
        : `Request failed with status ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body;
}

function setActivity(text) {
  activity.textContent = text;
}

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
}

function clearNotice() {
  notice.textContent = "";
  notice.hidden = true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function setMode(mode) {
  if (!modeInfo[mode]) {
    return;
  }

  state.currentMode = mode;

  const info = modeInfo[mode];

  modeTitle.textContent = mode;
  composerMode.textContent = info.title;
  contextMode.textContent = info.title;
  modeDescription.textContent = info.description;
  welcomeDescription.textContent = info.welcome;

  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "true" : "false");
  });

  renderStarters();
}

function renderStarters() {
  starters.replaceChildren();

  const info = modeInfo[state.currentMode];

  if (!info) {
    return;
  }

  for (const text of info.starters) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "starter";
    button.textContent = text;

    button.addEventListener("click", () => {
      input.value = text;
      input.focus();
    });

    starters.appendChild(button);
  }
}

function renderSessions() {
  const query = sessionSearch.value.trim().toLowerCase();

  const filtered = state.sessions.filter((session) =>
    String(session.title || "")
      .toLowerCase()
      .includes(query),
  );

  sessionsEl.replaceChildren();

  sessionCount.textContent = String(state.sessions.length);

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "caption";
    empty.textContent = query ? "No matching sessions." : "No sessions yet.";
    sessionsEl.appendChild(empty);
    return;
  }

  for (const session of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-item";

    if (state.currentSession?.id === session.id) {
      button.classList.add("active");
    }

    const title = document.createElement("strong");
    title.textContent = session.title || `Session ${session.id}`;

    const meta = document.createElement("small");
    meta.textContent = `${modeInfo[session.mode]?.title || session.mode} · ${
      formatDate(session.updatedAt || session.createdAt) || "Recent"
    }`;

    button.append(title, meta);

    button.addEventListener("click", () => {
      void openSession(session.id);
    });

    sessionsEl.appendChild(button);
  }
}

function renderMessages(session) {
  messages.replaceChildren();

  const sessionMessages = Array.isArray(session?.messages)
    ? session.messages
    : [];

  welcome.hidden = sessionMessages.length > 0;

  for (const message of sessionMessages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    const wrapper = document.createElement("article");
    wrapper.className = `message ${message.role}`;

    const role = document.createElement("span");
    role.className = "message-role";
    role.textContent = message.role === "user" ? "You" : "Mush Mush";

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message.content || "";

    wrapper.append(role, content);
    messages.appendChild(wrapper);
  }

  messages.scrollTop = messages.scrollHeight;
}

async function loadSessions() {
  const sessions = await api("/api/sessions");

  state.sessions = Array.isArray(sessions) ? sessions : [];

  renderSessions();
}

async function openSession(sessionId) {
  clearNotice();
  setActivity("Loading…");

  try {
    const session = await api(`/api/sessions/${sessionId}`);

    state.currentSession = session;

    setMode(session.mode);
    sessionTitle.textContent = session.title || `Session ${session.id}`;

    renderMessages(session);
    renderSessions();

    input.disabled = false;
    send.disabled = false;

    setActivity("Ready");

    await loadContext();
  } catch (error) {
    showNotice(error.message);
    setActivity("Error");
  }
}

async function createSession(title, mode) {
  const session = await api("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      title,
      mode,
    }),
  });

  await loadSessions();
  await openSession(session.id);

  return session;
}

async function sendMessage(message) {
  if (!state.currentSession) {
    throw new Error("Create or select a session first.");
  }

  const sessionId = state.currentSession.id;

  const response = await api(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      mode: state.currentSession.mode,
      message,
    }),
  });

  await openSession(sessionId);

  return response;
}

function renderContextItems(items) {
  contextItems.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "caption";
    empty.textContent =
      state.contextTab === "lessons"
        ? "No lessons stored yet."
        : "No insights stored yet.";

    contextItems.appendChild(empty);
    return;
  }

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "context-item";

    const title = document.createElement("strong");

    title.textContent =
      item.title ||
      item.subject ||
      item.lesson ||
      item.insight ||
      `#${item.id}`;

    const content = document.createElement("p");

    content.textContent =
      item.content || item.statement || item.text || item.description || "";

    const meta = document.createElement("small");

    const pieces = [];

    if (item.status) {
      pieces.push(item.status);
    }

    if (item.confidence != null) {
      pieces.push(`confidence ${item.confidence}`);
    }

    if (item.createdAt) {
      pieces.push(formatDate(item.createdAt));
    }

    meta.textContent = pieces.join(" · ");

    card.append(title);

    if (content.textContent) {
      card.append(content);
    }

    if (meta.textContent) {
      card.append(meta);
    }

    contextItems.appendChild(card);
  }
}

async function loadContext() {
  contextStatus.textContent = "Loading…";

  try {
    const path =
      state.contextTab === "lessons" ? "/api/lessons" : "/api/insights";

    const items = await api(path);

    renderContextItems(items);

    contextStatus.textContent = `${Array.isArray(items) ? items.length : 0} stored`;
  } catch (error) {
    contextStatus.textContent = error.message;
  }
}

async function loginWithKey(key) {
  state.key = key;

  await loadSessions();

  login.hidden = true;
  app.hidden = false;

  if (state.sessions.length > 0) {
    await openSession(state.sessions[0].id);
  } else {
    state.currentSession = null;
    sessionTitle.textContent = "New session";
    setMode("TEACH");
    renderMessages(null);
    setActivity("Ready");
    await loadContext();
  }
}

function lockWorkspace() {
  state.key = "";
  state.sessions = [];
  state.currentSession = null;

  keyInput.value = "";
  messages.replaceChildren();
  sessionsEl.replaceChildren();

  app.hidden = true;
  login.hidden = false;

  loginError.textContent = "";
  keyInput.focus();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const key = keyInput.value.trim();

  if (!key) {
    loginError.textContent = "Enter your Classroom key.";
    return;
  }

  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Connecting…";

  try {
    await loginWithKey(key);
  } catch (error) {
    state.key = "";

    if (error.status === 401) {
      loginError.textContent = "Invalid Classroom key.";
    } else {
      loginError.textContent = error.message;
    }
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = 'Enter workspace <span aria-hidden="true">↗</span>';
  }
});

newSessionButton.addEventListener("click", () => {
  newMode.value = state.currentSession?.mode || state.currentMode || "TEACH";
  newTitle.value = "";
  sessionError.textContent = "";

  sessionDialog.showModal();

  requestAnimationFrame(() => {
    newTitle.focus();
  });
});

cancelSession.addEventListener("click", () => {
  sessionDialog.close();
});

sessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = newTitle.value.trim();
  const mode = newMode.value;

  if (!title) {
    sessionError.textContent = "Session title is required.";
    return;
  }

  sessionError.textContent = "";

  try {
    await createSession(title, mode);
    sessionDialog.close();
  } catch (error) {
    sessionError.textContent = error.message;
  }
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;

    if (!modeInfo[mode]) {
      return;
    }

    if (state.currentSession) {
      showNotice(
        `This session is locked to ${modeInfo[state.currentSession.mode]?.title || state.currentSession.mode}. Create a new session to use ${modeInfo[mode].title}.`,
      );
      return;
    }

    clearNotice();
    setMode(mode);
    newMode.value = mode;
  });
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = input.value.trim();

  if (!message) {
    return;
  }

  if (!state.currentSession) {
    showNotice("Create a session before sending a message.");
    return;
  }

  clearNotice();

  input.disabled = true;
  send.disabled = true;
  setActivity("Mush Mush is working…");

  try {
    input.value = "";

    await sendMessage(message);

    setActivity("Ready");
  } catch (error) {
    showNotice(error.message);
    input.value = message;
    setActivity("Error");
  } finally {
    input.disabled = false;
    send.disabled = false;
    input.focus();
  }
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();

    if (!send.disabled) {
      messageForm.requestSubmit();
    }
  }
});

sessionSearch.addEventListener("input", renderSessions);

lockButton.addEventListener("click", lockWorkspace);

refreshContext.addEventListener("click", () => {
  void loadContext();
});

lessonsTab.addEventListener("click", () => {
  state.contextTab = "lessons";

  lessonsTab.setAttribute("aria-pressed", "true");
  insightsTab.setAttribute("aria-pressed", "false");

  $("contextHelp").textContent =
    "Stored lessons and their approval status. Read-only here.";

  void loadContext();
});

insightsTab.addEventListener("click", () => {
  state.contextTab = "insights";

  lessonsTab.setAttribute("aria-pressed", "false");
  insightsTab.setAttribute("aria-pressed", "true");

  $("contextHelp").textContent =
    "Proposed and approved insights derived from Classroom work.";

  void loadContext();
});

contextToggle.addEventListener("click", () => {
  const hidden = context.hidden;

  context.hidden = !hidden;
  contextToggle.setAttribute("aria-expanded", String(hidden));
});

navigationToggle.addEventListener("click", () => {
  const open = sidebar.classList.toggle("open");

  navigationToggle.setAttribute("aria-expanded", String(open));
});

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();

    if (!app.hidden) {
      newSessionButton.click();
    }
  }

  if (event.key === "Escape" && sessionDialog.open) {
    sessionDialog.close();
  }
});

setMode("TEACH");

input.disabled = true;
send.disabled = true;
