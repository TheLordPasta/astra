import "dotenv/config";

import { prisma } from "../db/client.js";

async function main() {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const customers = await prisma.customer.count();

  const conversations = await prisma.conversation.count({
    where: {
      startedAt: {
        gte: since,
      },
    },
  });

  const customerConversations = await prisma.conversation.count({
    where: {
      startedAt: {
        gte: since,
      },
      customerId: {
        not: null,
      },
    },
  });

  const customerMessages = await prisma.conversationMessage.count({
    where: {
      createdAt: {
        gte: since,
      },
      role: "user",
      content: {
        not: null,
      },
      conversation: {
        customerId: {
          not: null,
        },
      },
    },
  });

  const allMessages = await prisma.conversationMessage.count({
    where: {
      createdAt: {
        gte: since,
      },
    },
  });

  console.log("\n=== CUSTOMER LEARNING DATA ===\n");
  console.log("Customers in database:", customers);
  console.log("Conversations in last 90 days:", conversations);
  console.log(
    "Customer-linked conversations in last 90 days:",
    customerConversations,
  );
  console.log("Customer user messages in last 90 days:", customerMessages);
  console.log("All conversation messages in last 90 days:", allMessages);
}

main()
  .catch((error) => {
    console.error("Customer learning data test failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
