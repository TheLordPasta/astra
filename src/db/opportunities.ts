import { prisma } from "./client.js";

export async function getOpportunityById(id: number) {
  return prisma.opportunity.findUnique({
    where: { id },
  });
}

export async function getOpenOpportunities() {
  return prisma.opportunity.findMany({
    where: {
      status: "open",
    },
    orderBy: [
      {
        priority: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
}

export async function searchOpportunities(query: string) {
  return prisma.opportunity.findMany({
    where: {
      OR: [
        {
          title: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          type: {
            contains: query,
            mode: "insensitive",
          },
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
