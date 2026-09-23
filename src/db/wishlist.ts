import { prisma } from "./client.js";

export async function getCustomerWishlist(customerId: number) {
  return prisma.wishlistItem.findMany({
    where: {
      customerId,
      status: "active",
    },
    include: {
      fabric: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function addWishlistItem(data: {
  customerId: number;
  fabricId?: number | null;
  description?: string | null;
  requestedMeters?: number | null;
  notes?: string | null;
}) {
  return prisma.wishlistItem.create({
    data: {
      customerId: data.customerId,
      fabricId: data.fabricId ?? null,
      description: data.description ?? null,
      requestedMeters: data.requestedMeters ?? null,
      notes: data.notes ?? null,
    },
  });
}

export async function updateWishlistItem(
  id: number,
  data: {
    fabricId?: number | null;
    description?: string | null;
    requestedMeters?: number | null;
    notes?: string | null;
    status?: string;
  },
) {
  return prisma.wishlistItem.update({
    where: { id },
    data: {
      ...(data.fabricId !== undefined && {
        fabricId: data.fabricId,
      }),
      ...(data.description !== undefined && {
        description: data.description,
      }),
      ...(data.requestedMeters !== undefined && {
        requestedMeters: data.requestedMeters,
      }),
      ...(data.notes !== undefined && {
        notes: data.notes,
      }),
      ...(data.status !== undefined && {
        status: data.status,
      }),
    },
  });
}

export async function removeWishlistItem(id: number) {
  return prisma.wishlistItem.update({
    where: { id },
    data: {
      status: "removed",
    },
  });
}
