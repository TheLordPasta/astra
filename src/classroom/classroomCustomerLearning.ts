import { z } from "zod/v4";

import { prisma } from "../db/client.js";

export const searchCustomerLearningSchema = z.object({
  query: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
  limit: z.number().int().min(1).max(100).nullable().optional(),
});

export type SearchCustomerLearningArguments = z.infer<
  typeof searchCustomerLearningSchema
>;

export async function searchCustomerLearning(
  args: SearchCustomerLearningArguments,
) {
  const query = args.query?.trim();

  return prisma.customerObservation.findMany({
    where: {
      ...(args.customerId != null
        ? {
            customerId: args.customerId,
          }
        : {}),
      ...(args.type
        ? {
            type: {
              contains: args.type,
              mode: "insensitive",
            },
          }
        : {}),
      ...(query
        ? {
            OR: [
              {
                observation: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                source: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                customer: {
                  name: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      customerId: true,
      type: true,
      observation: true,
      source: true,
      confidence: true,
      createdAt: true,
      customer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      {
        confidence: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    take: args.limit ?? 50,
  });
}
