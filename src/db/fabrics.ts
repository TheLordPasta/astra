import { prisma } from "./client.js";

export async function getFabricById(id: number) {
  return prisma.fabric.findUnique({
    where: { id },
    include: {
      sourceDesigner: true,
      images: true,
    },
  });
}

export async function searchFabrics(query: string) {
  return prisma.fabric.findMany({
    where: {
      OR: [
        {
          referenceName: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          fabricType: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          color: {
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
      sourceDesigner: true,
    },
    orderBy: {
      referenceName: "asc",
    },
  });
}

export async function getAvailableFabrics() {
  return prisma.fabric.findMany({
    where: {
      isActive: true,
      stockMeters: {
        gt: 0,
      },
    },
    include: {
      sourceDesigner: true,
    },
    orderBy: {
      referenceName: "asc",
    },
  });
}
