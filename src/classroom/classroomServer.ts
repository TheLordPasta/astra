import "dotenv/config";

import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { z } from "zod/v4";

import {
  createClassroomSession,
  getClassroomSession,
  getClassroomInsights,
  getClassroomLessons,
  getRecentClassroomSessions,
} from "./classroomDb.js";
import { sendClassroomMessage } from "./classroom.js";

const app = Fastify({ logger: true });
const port = Number(process.env.CLASSROOM_PORT ?? "3010");
const classroomKey = process.env.CLASSROOM_KEY;

if (!classroomKey) {
  throw new Error("CLASSROOM_KEY is missing. Add it to .env before starting Classroom.");
}

function authorize(request: {
  headers: Record<string, string | string[] | undefined>;
}) {
  return request.headers["x-classroom-key"] === classroomKey;
}

// Serve only fixed public assets. All data and actions require authentication.
const uiAssets = [
  { route: "/", file: "index.html", type: "text/html; charset=utf-8" },
  { route: "/classroom.css", file: "classroom.css", type: "text/css; charset=utf-8" },
  { route: "/app.js", file: "app.js", type: "text/javascript; charset=utf-8" },
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
  if (!authorize(request)) return reply.code(401).send({ error: "Unauthorized" });
  return getRecentClassroomSessions();
});

// Unknown fields (including mode from old clients) are ignored, never routed.
const sessionBody = z.object({ title: z.string().trim().max(200).optional() });
const messageBody = z.object({ message: z.string().trim().min(1) });

app.post("/api/sessions", async (request, reply) => {
  if (!authorize(request)) return reply.code(401).send({ error: "Unauthorized" });
  const parsed = sessionBody.safeParse(request.body ?? {});
  if (!parsed.success) {
    return reply.code(400).send({ error: "Provide a title of at most 200 characters." });
  }
  const session = await createClassroomSession({
    title: parsed.data.title || "Classroom conversation",
    // Compatibility metadata for the existing database, not a capability gate.
    // Existing sessions and their history remain unchanged; no migration needed.
    mode: "TEACH",
  });
  return reply.send(session);
});

app.get<{ Params: { id: string } }>("/api/sessions/:id", async (request, reply) => {
  if (!authorize(request)) return reply.code(401).send({ error: "Unauthorized" });
  const sessionId = Number(request.params.id);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return reply.code(400).send({ error: "Invalid session ID." });
  }
  const session = await getClassroomSession(sessionId);
  if (!session) return reply.code(404).send({ error: "Classroom session not found." });
  return reply.send(session);
});

// Prevent overlapping turns in one conversation in this server process.
const activeSessions = new Set<number>();
app.post<{ Params: { id: string } }>("/api/sessions/:id/messages", async (request, reply) => {
  if (!authorize(request)) return reply.code(401).send({ error: "Unauthorized" });
  const sessionId = Number(request.params.id);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    return reply.code(400).send({ error: "Invalid session ID." });
  }
  const parsed = messageBody.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Message is required and must be text." });
  if (activeSessions.has(sessionId)) {
    return reply.code(409).send({ error: "Mush Mush is still working on this conversation." });
  }
  activeSessions.add(sessionId);
  try {
    if (!(await getClassroomSession(sessionId))) {
      return reply.code(404).send({ error: "Classroom session not found." });
    }
    const response = await sendClassroomMessage(sessionId, parsed.data.message);
    return reply.send({ response });
  } catch (error) {
    request.log.error(error, "Classroom message failed");
    return reply.code(500).send({
      error: "Classroom request failed. Some work may have completed. Reload the conversation before retrying.",
    });
  } finally {
    activeSessions.delete(sessionId);
  }
});

app.get("/api/lessons", async (request, reply) => {
  if (!authorize(request)) return reply.code(401).send({ error: "Unauthorized" });
  return reply.send(await getClassroomLessons());
});

app.get("/api/insights", async (request, reply) => {
  if (!authorize(request)) return reply.code(401).send({ error: "Unauthorized" });
  return reply.send(await getClassroomInsights());
});

app.listen({ host: "127.0.0.1", port }).then(() => {
  console.log(`Mush Mush Classroom running at http://127.0.0.1:${port}`);
});
