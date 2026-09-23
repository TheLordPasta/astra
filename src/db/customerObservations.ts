import { prisma } from "./client.js";

export async function getCustomerObservations(customerId: number) {
  return prisma.customerObservation.findMany({
    where: {
      customerId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function addCustomerObservation(data: {
  customerId: number;
  type: string;
  observation: string;
  source?: string | null;
  confidence?: number | null;
}) {
  return prisma.customerObservation.create({
    data: {
      customerId: data.customerId,
      type: data.type,
      observation: data.observation,
      source: data.source ?? null,
      confidence: data.confidence ?? null,
    },
  });
}
