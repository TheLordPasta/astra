import { prisma } from "./client.js";

export async function getOrderById(id: number) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
    },
  });
}

export async function getCustomerOrders(customerId: number) {
  return prisma.order.findMany({
    where: {
      customerId,
    },
    orderBy: {
      orderDate: "desc",
    },
  });
}

export async function getRecentOrders(limit = 20) {
  return prisma.order.findMany({
    take: limit,
    orderBy: {
      orderDate: "desc",
    },
    include: {
      customer: true,
    },
  });
}
