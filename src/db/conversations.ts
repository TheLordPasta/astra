import { prisma } from "./client.js";

export async function getConversationById(id: number) {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      customer: true,
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
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
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
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
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function createConversation(customerId: number) {
  return prisma.conversation.create({
    data: {
      customerId,
      status: "open",
    },
  });
}

export async function addConversationMessage(data: {
  conversationId: number;
  role: string;
  content?: string | null;
  imageUrl?: string | null;
}) {
  return prisma.conversationMessage.create({
    data: {
      conversationId: data.conversationId,
      role: data.role,
      content: data.content ?? null,
      imageUrl: data.imageUrl ?? null,
    },
  });
}

export async function getConversationMessages(conversationId: number) {
  return prisma.conversationMessage.findMany({
    where: {
      conversationId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}
