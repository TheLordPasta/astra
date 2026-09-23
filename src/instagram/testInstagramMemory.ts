import { getCustomerByInstagramUserId } from "../db/customers.js";
import {
  getConversationByPlatformExternalId,
  getConversationMessages,
} from "../db/conversations.js";

const instagramUserId = "3179353065728963";

async function main() {
  const customer = await getCustomerByInstagramUserId(instagramUserId);

  console.log("=== CUSTOMER ===");
  console.log(JSON.stringify(customer, null, 2));

  if (!customer) {
    console.log("Customer was not created.");
    return;
  }

  const conversation = await getConversationByPlatformExternalId(
    "instagram",
    instagramUserId,
  );

  console.log("\n=== CONVERSATION ===");
  console.log(JSON.stringify(conversation, null, 2));

  if (!conversation) {
    console.log("Conversation was not created.");
    return;
  }

  const messages = await getConversationMessages(conversation.id);

  console.log("\n=== MESSAGES ===");
  console.log(JSON.stringify(messages, null, 2));
}

main().catch((error) => {
  console.error("Instagram memory test failed:");
  console.error(error);
  process.exit(1);
});
