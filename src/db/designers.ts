import { prisma } from "./client.js";

export async function getDesignerById(id: number) {
  return prisma.designer.findUnique({
    where: { id },
    include: {
      customer: true,
    },
  });
}

export async function searchDesigners(query: string) {
  return prisma.designer.findMany({
    where: {
      OR: [
        {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          brandName: {
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
      ],
    },
    include: {
      customer: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}
