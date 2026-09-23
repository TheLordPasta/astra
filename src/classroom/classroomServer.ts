import "dotenv/config";

import Fastify from "fastify";

import {
  createClassroomSession,
  getClassroomInsights,
  getClassroomLessons,
  getRecentClassroomSessions,
} from "./classroomDb.js";

import { sendClassroomMessage } from "./classroom.js";

import {
  CLASSROOM_MODES,
  isClassroomMode,
  type ClassroomMode,
} from "./classroomTypes.js";

const app = Fastify({
  logger: true,
});

const port = Number(process.env.CLASSROOM_PORT ?? "3010");
const classroomKey = process.env.CLASSROOM_KEY;

if (!classroomKey) {
  throw new Error(
    "CLASSROOM_KEY is missing. Add it to .env before starting Classroom.",
  );
}

function authorize(request: {
  headers: Record<string, string | string[] | undefined>;
}) {
  const key = request.headers["x-classroom-key"];

  return key === classroomKey;
}

app.get("/", async (_request, reply) => {
  return reply.type("text/html").send(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mush Mush Classroom</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Inter, Arial, sans-serif;
      background: #111;
      color: #f4f4f4;
    }

    .app {
      display: grid;
      grid-template-columns: 230px 1fr;
      height: 100vh;
    }

    aside {
      border-right: 1px solid #2a2a2a;
      padding: 24px 16px;
      background: #151515;
    }

    h1 {
      margin: 0 0 24px;
      font-size: 22px;
    }

    button,
    select,
    input {
      font: inherit;
    }

    button {
      border: 0;
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      background: #eee;
      color: #111;
    }

    button.secondary {
      background: #2b2b2b;
      color: #fff;
    }

    .mode {
      display: grid;
      gap: 8px;
      margin-bottom: 20px;
    }

    .mode button.active {
      background: #fff;
      color: #111;
    }

    .session-list {
      display: grid;
      gap: 6px;
      margin-top: 20px;
    }

    .session {
      text-align: left;
      background: transparent;
      color: #ccc;
      border: 1px solid transparent;
    }

    .session:hover {
      border-color: #333;
    }

    main {
      display: grid;
      grid-template-rows: auto 1fr auto;
      min-width: 0;
    }

    header {
      padding: 18px 24px;
      border-bottom: 1px solid #2a2a2a;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .messages {
      overflow: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message {
      max-width: 850px;
      padding: 14px 16px;
      border-radius: 12px;
      white-space: pre-wrap;
      line-height: 1.5;
    }

    .user {
      align-self: flex-end;
      background: #eee;
      color: #111;
    }

    .assistant {
      align-self: flex-start;
      background: #1f1f1f;
      border: 1px solid #2b2b2b;
    }

    form {
      border-top: 1px solid #2a2a2a;
      padding: 16px 24px;
      display: flex;
      gap: 10px;
    }

    textarea {
      flex: 1;
      resize: vertical;
      min-height: 70px;
      max-height: 240px;
      border-radius: 10px;
      border: 1px solid #333;
      background: #181818;
      color: white;
      padding: 12px;
      font: inherit;
    }

    .login {
      position: fixed;
      inset: 0;
      background: #111;
      display: grid;
      place-items: center;
      z-index: 10;
    }

    .login-card {
      width: min(420px, calc(100vw - 40px));
      padding: 28px;
      background: #1a1a1a;
      border: 1px solid #2b2b2b;
      border-radius: 14px;
    }

    .login-card input {
      width: 100%;
      padding: 12px;
      margin: 12px 0;
      border-radius: 8px;
      border: 1px solid #333;
      background: #111;
      color: white;
    }

    .hidden {
      display: none !important;
    }

    .subtle {
      color: #888;
      font-size: 13px;
    }
  </style>
</head>
<body>

<div id="login" class="login">
  <div class="login-card">
    <h2>Mush Mush Classroom</h2>
    <p class="subtle">Private local workspace.</p>
    <input id="key" type="password" placeholder="Classroom key" />
    <button onclick="login()">Enter Classroom</button>
    <p id="loginError" class="subtle"></p>
  </div>
</div>

<div id="app" class="app hidden">
  <aside>
    <h1>Mush Mush</h1>

    <div class="mode">
      <button data-mode="TEACH" onclick="setMode('TEACH')">TEACH</button>
      <button data-mode="LEARN" onclick="setMode('LEARN')">LEARN</button>
      <button data-mode="RESEARCH" onclick="setMode('RESEARCH')">RESEARCH</button>
      <button data-mode="DEVELOPER" onclick="setMode('DEVELOPER')">DEVELOPER</button>
    </div>

    <button onclick="newSession()">+ New Session</button>

    <div id="sessions" class="session-list"></div>
  </aside>

  <main>
    <header>
      <div>
        <strong id="modeTitle">TEACH</strong>
        <div class="subtle" id="sessionTitle">New session</div>
      </div>
      <div class="subtle">localhost only</div>
    </header>

    <div id="messages" class="messages"></div>

    <form onsubmit="sendMessage(event)">
      <textarea id="input" placeholder="Talk to Mush Mush..."></textarea>
      <button type="submit">Send</button>
    </form>
  </main>
</div>

<script>
  let key = localStorage.getItem("mushmush_classroom_key") || "";
  let mode = "TEACH";
  let sessionId = null;

  const loginView = document.getElementById("login");
  const appView = document.getElementById("app");

  if (key) {
    verifyKey();
  }

  async function verifyKey() {
    const response = await fetch("/api/sessions", {
      headers: { "x-classroom-key": key }
    });

    if (response.ok) {
      loginView.classList.add("hidden");
      appView.classList.remove("hidden");
      await loadSessions();
      return;
    }

    localStorage.removeItem("mushmush_classroom_key");
    key = "";
  }

  async function login() {
    const value = document.getElementById("key").value;
    key = value;

    const response = await fetch("/api/sessions", {
      headers: { "x-classroom-key": key }
    });

    if (!response.ok) {
      document.getElementById("loginError").textContent =
        "Invalid Classroom key.";
      return;
    }

    localStorage.setItem("mushmush_classroom_key", key);
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    await loadSessions();
  }

  function setMode(newMode) {
    mode = newMode;
    document.getElementById("modeTitle").textContent = mode;

    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.mode === mode
      );
    });
  }

  async function newSession() {
    const title = prompt("Session title:", mode + " session");

    if (!title) return;

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-classroom-key": key,
      },
      body: JSON.stringify({
        title,
        mode,
      }),
    });

    const session = await response.json();

    sessionId = session.id;
    document.getElementById("sessionTitle").textContent = session.title;
    document.getElementById("messages").innerHTML = "";

    await loadSessions();
  }

  async function loadSessions() {
    const response = await fetch("/api/sessions", {
      headers: { "x-classroom-key": key }
    });

    const sessions = await response.json();
    const container = document.getElementById("sessions");

    container.innerHTML = "";

    sessions.forEach((session) => {
      const button = document.createElement("button");
      button.className = "session";
      button.textContent = session.mode + " — " + session.title;

      button.onclick = async () => {
        sessionId = session.id;
        mode = session.mode;

        setMode(mode);
        document.getElementById("sessionTitle").textContent = session.title;

        const sessionResponse = await fetch(
          "/api/sessions/" + session.id,
          {
            headers: { "x-classroom-key": key }
          }
        );

        const fullSession = await sessionResponse.json();
        renderMessages(fullSession.messages);
      };

      container.appendChild(button);
    });
  }

  function renderMessages(messages) {
    const container = document.getElementById("messages");
    container.innerHTML = "";

    messages.forEach((message) => {
      const element = document.createElement("div");
      element.className = "message " + message.role;
      element.textContent = message.content;
      container.appendChild(element);
    });

    container.scrollTop = container.scrollHeight;
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!sessionId) {
      alert("Create a session first.");
      return;
    }

    const input = document.getElementById("input");
    const message = input.value.trim();

    if (!message) return;

    input.value = "";

    addMessage({
      role: "user",
      content: message,
    });

    const response = await fetch(
      "/api/sessions/" + sessionId + "/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-classroom-key": key,
        },
        body: JSON.stringify({
          mode,
          message,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      addMessage({
        role: "assistant",
        content: "Error: " + (data.error || "Unknown error"),
      });
      return;
    }

    addMessage({
      role: "assistant",
      content: data.response,
    });

    await loadSessions();
  }

  function addMessage(message) {
    const container = document.getElementById("messages");

    const element = document.createElement("div");
    element.className = "message " + message.role;
    element.textContent = message.content;

    container.appendChild(element);
    container.scrollTop = container.scrollHeight;
  }

  setMode("TEACH");
</script>

</body>
</html>
  `);
});

app.get("/api/sessions", async (request, reply) => {
  if (!authorize(request)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const sessions = await getRecentClassroomSessions();

  return sessions;
});

app.post<{
  Body: {
    title?: string;
    mode?: string;
  };
}>("/api/sessions", async (request, reply) => {
  if (!authorize(request)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const title = request.body.title?.trim() || "Classroom session";
  const mode = request.body.mode?.trim() || "";

  if (!isClassroomMode(mode)) {
    return reply.code(400).send({
      error: `Invalid Classroom mode. Use one of: ${CLASSROOM_MODES.join(", ")}`,
    });
  }

  const session = await createClassroomSession({
    title,
    mode,
  });

  return reply.send(session);
});

app.get<{
  Params: {
    id: string;
  };
}>("/api/sessions/:id", async (request, reply) => {
  if (!authorize(request)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const sessionId = Number(request.params.id);

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return reply.code(400).send({
      error: "Invalid session ID.",
    });
  }

  const session = await import("./classroomDb.js").then(
    ({ getClassroomSession }) => getClassroomSession(sessionId),
  );

  if (!session) {
    return reply.code(404).send({
      error: "Classroom session not found.",
    });
  }

  return reply.send(session);
});

app.post<{
  Params: {
    id: string;
  };
  Body: {
    mode?: string;
    message?: string;
  };
}>("/api/sessions/:id/messages", async (request, reply) => {
  if (!authorize(request)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const sessionId = Number(request.params.id);
  const mode = request.body.mode?.trim() || "";
  const message = request.body.message?.trim() || "";

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return reply.code(400).send({
      error: "Invalid session ID.",
    });
  }

  if (!isClassroomMode(mode)) {
    return reply.code(400).send({
      error: "Invalid Classroom mode.",
    });
  }

  if (!message) {
    return reply.code(400).send({
      error: "Message is required.",
    });
  }

  try {
    const response = await sendClassroomMessage(
      sessionId,
      mode as ClassroomMode,
      message,
    );

    return reply.send({
      response,
    });
  } catch (error) {
    return reply.code(500).send({
      error:
        error instanceof Error ? error.message : "Classroom request failed.",
    });
  }
});

app.get("/api/lessons", async (request, reply) => {
  if (!authorize(request)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  return reply.send(await getClassroomLessons());
});

app.get("/api/insights", async (request, reply) => {
  if (!authorize(request)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  return reply.send(await getClassroomInsights());
});

app
  .listen({
    host: "127.0.0.1",
    port,
  })
  .then(() => {
    console.log(`Mush Mush Classroom running at http://127.0.0.1:${port}`);
  });
