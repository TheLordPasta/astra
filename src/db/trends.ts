import { prisma } from "./client.js";

export async function getTrendById(id: number) {
  return prisma.trend.findUnique({
    where: { id },
    include: {
      observations: {
        orderBy: {
          observedAt: "desc",
        },
      },
    },
  });
}

export async function searchTrends(query: string) {
  return prisma.trend.findMany({
    where: {
      OR: [
        {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          category: {
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
      ],
    },
    include: {
      observations: {
        orderBy: {
          observedAt: "desc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
