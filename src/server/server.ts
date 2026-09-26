import "dotenv/config";
import Fastify from "fastify";

import { registerFacebookAuth } from "../instagram/facebookAuth.js";
import { registerInstagramWebhook } from "../instagram/instagramWebhook.js";

const app = Fastify({
  logger: true,
});

registerInstagramWebhook(app);
registerFacebookAuth(app);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

async function start() {
  try {
    await app.listen({
      port,
      host,
    });

    console.log(`MushMush server running on ${host}:${port}`);
  } catch (error) {
    console.error("Failed to start Astra server:");
    console.error(error);
    process.exit(1);
  }
}

start();
