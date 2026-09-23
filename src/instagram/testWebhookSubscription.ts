import "dotenv/config";

import { getInstagramProfile } from "./instagramClient.js";

const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";

if (!accessToken) {
  throw new Error("INSTAGRAM_ACCESS_TOKEN is missing from .env");
}

async function main() {
  const profile = await getInstagramProfile();

  console.log("Instagram account:");
  console.log(profile.username);
  console.log("Instagram user ID:");
  console.log(profile.user_id);

  const response = await fetch(
    `https://graph.instagram.com/v26.0/${profile.user_id}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscribed_fields: "messages",
      }),
    },
  );

  const data: unknown = await response.json();

  console.log("\nSubscription response:");
  console.log("HTTP:", response.status);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error("Webhook subscription test failed:");
  console.error(error);
  process.exit(1);
});
