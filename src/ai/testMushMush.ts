import { callMushMush } from "./mushMushPhone.js";
import { prisma } from "../db/client.js";

async function main() {
  console.log("1. Test started");

  const customer = await prisma.customer.create({
    data: {
      name: "Sarah Cohen",
      email: "sarah@example.com",
      phone: "050-1234567",
      city: "Tel Aviv",
      instagramUsername: "@sarah.cohen",
    },
  });

  const conversation = await prisma.conversation.create({
    data: {
      customerId: customer.id,
      platform: "test",
      status: "open",
    },
  });

  await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      role: "customer",
      content:
        "Hi, I'm looking for an ivory lace for a bridal dress. " +
        "I need around 12 meters.",
    },
  });

  console.log("Created customer:", customer.id);
  console.log("Created conversation:", conversation.id);

  try {
    const answer = await callMushMush(
      `Customer ID ${customer.id} has an existing conversation. ` +
        "First retrieve the customer's conversation history. " +
        "Read the customer's latest message. " +
        `Then add a new message to conversation ID ${conversation.id} ` +
        "as role 'assistant' acknowledging their request. " +
        "Do not create an order. " +
        "Then tell me what you remembered and what message you saved.",
    );

    console.log("\nMUSH MUSH:");
    console.log(answer);

    const messages = await prisma.conversationMessage.findMany({
      where: {
        conversationId: conversation.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log("\nDATABASE CONVERSATION:");
    console.log(messages);
  } finally {
    await prisma.conversationMessage.deleteMany({
      where: {
        conversationId: conversation.id,
      },
    });

    await prisma.conversation.delete({
      where: {
        id: conversation.id,
      },
    });

    await prisma.customer.delete({
      where: {
        id: customer.id,
      },
    });

    console.log("\nTest data deleted.");
  }
}

main()
  .catch((error) => {
    console.error("Test failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
