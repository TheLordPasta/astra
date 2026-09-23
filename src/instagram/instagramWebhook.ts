import type { FastifyInstance } from "fastify";

import { handleInstagramWebhook } from "./instagramHandler.js";

interface InstagramVerificationQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
}

export function registerInstagramWebhook(app: FastifyInstance) {
  app.get<{ Querystring: InstagramVerificationQuery }>(
    "/api/instagram/webhook",
    async (request, reply) => {
      const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN ?? "";

      const mode = request.query["hub.mode"];
      const token = request.query["hub.verify_token"];
      const challenge = request.query["hub.challenge"];

      console.log("=== WEBHOOK VERIFICATION ===");
      console.log("mode:", JSON.stringify(mode));
      console.log("token:", JSON.stringify(token));
      console.log("expected:", JSON.stringify(verifyToken));
      console.log("challenge:", JSON.stringify(challenge));

      if (mode !== "subscribe" || token !== verifyToken) {
        return reply.code(403).send("Forbidden");
      }

      if (challenge) {
        return reply.code(200).type("text/plain").send(challenge);
      }

      return reply.code(200).send("OK");
    },
  );

  app.post("/api/instagram/webhook", async (request, reply) => {
    console.log("\n=== INSTAGRAM WEBHOOK RECEIVED ===");
    console.dir(request.body, { depth: null });

    // Acknowledge Meta immediately.
    const response = reply.code(200).send({
      received: true,
    });

    // Process the message after acknowledging the webhook.
    void handleInstagramWebhook(request.body).catch((error) => {
      console.error("Unhandled Instagram webhook processing error:", error);
    });

    return response;
  });
}
