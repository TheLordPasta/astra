import type { FastifyInstance } from "fastify";

interface InstagramVerificationQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
}

interface InstagramWebhookPayload {
  object?: string;
  entry?: unknown[];
  [key: string]: unknown;
}

export function registerInstagramWebhook(app: FastifyInstance) {
  app.get<{
    Querystring: {
      code?: string;
      state?: string;
      error?: string;
      error_reason?: string;
      error_description?: string;
    };
  }>("/api/instagram/auth/callback", async (request, reply) => {
    const { code, state, error, error_reason, error_description } =
      request.query;

    if (error) {
      console.error("Instagram authorization failed:", {
        error,
        error_reason,
        error_description,
      });

      return reply.code(400).send({
        success: false,
        error,
        error_reason,
        error_description,
      });
    }

    console.log("=== INSTAGRAM AUTH CALLBACK ===");
    console.log("Authorization code received:", Boolean(code));
    console.log("State:", state ?? null);

    return reply.send({
      success: true,
      message: "Instagram authorization received.",
    });
  });

  app.get<{ Querystring: InstagramVerificationQuery }>(
    "/api/instagram/webhook",
    async (request, reply) => {
      const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN ?? "";

      const mode = request.query["hub.mode"];
      const token = request.query["hub.verify_token"];
      const challenge = request.query["hub.challenge"];

      console.log("=== WEBHOOK VERIFICATION DEBUG ===");
      console.log("mode:", JSON.stringify(mode));
      console.log("token:", JSON.stringify(token));
      console.log("expected:", JSON.stringify(verifyToken));
      console.log("challenge:", JSON.stringify(challenge));
      console.log("match:", token === verifyToken);

      if (mode === "subscribe" && token === verifyToken && challenge) {
        return reply.code(200).type("text/plain").send(challenge);
      }

      return reply.code(403).send("Forbidden");
    },
  );

  app.post<{ Body: InstagramWebhookPayload }>(
    "/api/instagram/webhook",
    async (request, reply) => {
      console.log("\n=== Instagram Webhook ===");
      console.dir(request.body, { depth: null });

      return reply.code(200).send({
        received: true,
      });
    },
  );
}
