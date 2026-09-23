import { prisma } from "./client.js";

export async function getCustomerById(id: number) {
  return prisma.customer.findUnique({
    where: { id },
  });
}

export async function getCustomerByInstagramUserId(instagramUserId: string) {
  return prisma.customer.findUnique({
    where: {
      instagramUserId,
    },
  });
}

export async function createInstagramCustomer(instagramUserId: string) {
  return prisma.customer.create({
    data: {
      name: "Instagram Customer",
      instagramUserId,
    },
  });
}

export async function searchCustomers(query: string) {
  return prisma.customer.findMany({
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
          city: {
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

export async function getCustomerProfile(id: number) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      designers: true,

      orders: {
        orderBy: {
          orderDate: "desc",
        },
      },

      conversations: {
        orderBy: {
          startedAt: "desc",
        },
      },

      wishlistItems: {
        where: {
          status: "active",
        },
        include: {
          fabric: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });
}
