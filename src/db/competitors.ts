import { prisma } from "./client.js";

export async function getCompetitorById(id: number) {
  return prisma.competitor.findUnique({
    where: { id },
  });
}

export async function searchCompetitors(query: string) {
  return prisma.competitor.findMany({
    where: {
      OR: [
        {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          instagramUsername: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          website: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          notes: {
            contains: query,
            mode: "insensitive",
          },
        },
      ],
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function getAllCompetitors() {
  return prisma.competitor.findMany({
    orderBy: {
      name: "asc",
    },
  });
}
