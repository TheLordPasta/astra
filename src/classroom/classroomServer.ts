import "dotenv/config";

import { readFile } from "node:fs/promises";
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

// Serve only these public UI assets; no filesystem paths come from requests.
// Session data and all actions still use the authenticated API below.
const uiAssets = [
  { route: "/", file: "index.html", type: "text/html; charset=utf-8" },
  {
    route: "/classroom.css",
    file: "classroom.css",
    type: "text/css; charset=utf-8",
  },
  {
    route: "/app.js",
    file: "app.js",
    type: "text/javascript; charset=utf-8",
  },
] as const;

for (const asset of uiAssets) {
  const url = new URL(`./ui/${asset.file}`, import.meta.url);
  app.get(asset.route, async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      )
      .type(asset.type)
      .send(await readFile(url, "utf8"));
  });
}

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
    const response = await sendClassroomMessage(sessionId, message);

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
