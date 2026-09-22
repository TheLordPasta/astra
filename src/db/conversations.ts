import { prisma } from "./client.js";

export async function getConversationById(id: number) {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      customer: true,
    },
  });
}

export async function getCustomerConversations(customerId: number) {
  return prisma.conversation.findMany({
    where: {
      customerId,
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

export async function getOpenConversations() {
  return prisma.conversation.findMany({
    where: {
      status: "open",
    },
    orderBy: {
      startedAt: "asc",
    },
    include: {
      customer: true,
    },
  });
}
