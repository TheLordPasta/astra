import { z } from "zod";

export const getCustomerByIdSchema = z.object({
  id: z.number().int().positive(),
});

export const aiTools = [
  {
    type: "function" as const,
    name: "get_customer_by_id",
    description:
      "Retrieve a customer's verified information from the Classic Textile database. Use this when you need factual information about a specific customer.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
          description: "The database ID of the customer.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: true,
  },
];
