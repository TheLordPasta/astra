import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { failureReport } from "./runtimeSafety.js";

export interface ClassroomHttpDependencies {
  key: string;
  sessions(): Promise<unknown>;
  create(title: string): Promise<unknown>;
  session(id: number): Promise<unknown>;
  send(id: number, message: string): Promise<string>;
  lessons(): Promise<unknown>;
  insights(): Promise<unknown>;
}
export function createClassroomApp(deps: ClassroomHttpDependencies, logger = true) {
  const app = Fastify({ logger });
  app.setErrorHandler((error, _request, reply) => {
    // Never serialize Fastify/SDK errors, raw headers, bodies or stacks.
    const report = failureReport(error, "http.route", record => app.log.error(record));
    const code = error && typeof error === "object" && "statusCode" in error ? error.statusCode : undefined;
    const status = typeof code === "number" && Number.isInteger(code) && code >= 400 && code < 500 ? code : 500;
    return reply.code(status).send({ error: report.message, ...report });
  });
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/") && request.headers["x-classroom-key"] !== deps.key) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
  const assets = [
    { route: "/", file: "index.html", type: "text/html; charset=utf-8" },
    { route: "/classroom.css", file: "classroom.css", type: "text/css; charset=utf-8" },
    { route: "/app.js", file: "app.js", type: "text/javascript; charset=utf-8" },
    { route: "/apiClient.js", file: "apiClient.js", type: "text/javascript; charset=utf-8" },
  ];
  for (const asset of assets) {
    const url = new URL(`./ui/${asset.file}`, import.meta.url);
    app.get(asset.route, async (_request, reply) => reply
      .header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
      .type(asset.type).send(await readFile(url, "utf8")));
  }
  app.get("/api/sessions", async () => deps.sessions());
  app.post<{ Body: { title?: string } }>("/api/sessions", async (request, reply) => {
    if (request.body?.title != null && typeof request.body.title !== "string") return reply.code(400).send({ error: "Invalid conversation title." });
    return deps.create(request.body?.title?.trim() || "Classroom session");
  });
  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Invalid session ID." });
    const session = await deps.session(id);
    if (!session) return reply.code(404).send({ error: "Classroom session not found." });
    return session;
  });
  app.post<{ Params: { id: string }; Body: { message?: string } }>("/api/sessions/:id/messages", async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "Invalid session ID." });
    const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
    if (!message) return reply.code(400).send({ error: "Message is required." });
    try { return { response: await deps.send(id, message) }; }
    catch (error) {
      const report = failureReport(error, "http.send", record => app.log.error(record));
      return reply.code(500).send({ error: report.message, response: report.message, ...report });
    }
  });
  app.get("/api/lessons", async () => deps.lessons());
  app.get("/api/insights", async () => deps.insights());
  return app;
}
