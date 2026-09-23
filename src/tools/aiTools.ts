import { z } from "zod";

export const getCustomerByIdSchema = z.object({
  id: z.number().int().positive(),
});

export const getCustomerWishlistSchema = z.object({
  customerId: z.number().int().positive(),
});

export const addWishlistItemSchema = z.object({
  customerId: z.number().int().positive(),
  fabricId: z.number().int().positive().nullable(),
  description: z.string().min(1).nullable(),
  requestedMeters: z.number().positive().nullable(),
  notes: z.string().nullable(),
});

export const getCustomerConversationsSchema = z.object({
  customerId: z.number().int().positive(),
});

export const getCustomerObservationsSchema = z.object({
  customerId: z.number().int().positive(),
});

export const addCustomerObservationSchema = z.object({
  customerId: z.number().int().positive(),
  type: z.string().min(1),
  observation: z.string().min(1),
  source: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export const addConversationMessageSchema = z.object({
  conversationId: z.number().int().positive(),
  role: z.string().min(1),
  content: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export const getOrderByIdSchema = z.object({
  id: z.number().int().positive(),
});

export const getCustomerOrdersSchema = z.object({
  customerId: z.number().int().positive(),
});

export const getDesignerByIdSchema = z.object({
  id: z.number().int().positive(),
});

export const searchSchema = z.object({
  query: z.string().min(1),
});

export const getFabricByIdSchema = z.object({
  id: z.number().int().positive(),
});

export const getOpportunityByIdSchema = z.object({
  id: z.number().int().positive(),
});

export const getCompetitorByIdSchema = z.object({
  id: z.number().int().positive(),
});

export const getTrendByIdSchema = z.object({
  id: z.number().int().positive(),
});

export const aiTools = [
  {
    type: "function" as const,
    name: "get_customer_by_id",
    description:
      "Retrieve verified customer information from the Classic Textile database.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
          description: "The customer's database ID.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_customer_wishlist",
    description:
      "Retrieve the active wishlist items remembered for a Classic Textile customer.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "integer",
          minimum: 1,
          description: "The customer's database ID.",
        },
      },
      required: ["customerId"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "add_wishlist_item",
    description:
      "Remember a customer's requested fabric or textile preference as a wishlist item. This does not create an order. Use null for information that is not known.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "integer",
          minimum: 1,
          description: "The customer's database ID.",
        },
        fabricId: {
          type: ["integer", "null"],
          description: "The fabric ID, or null if no specific fabric is known.",
        },
        description: {
          type: ["string", "null"],
          description:
            "Description of what the customer wants, or null if unavailable.",
        },
        requestedMeters: {
          type: ["number", "null"],
          exclusiveMinimum: 0,
          description:
            "Requested quantity in meters, or null if the customer did not specify it.",
        },
        notes: {
          type: ["string", "null"],
          description: "Additional notes, or null if there are none.",
        },
      },
      required: [
        "customerId",
        "fabricId",
        "description",
        "requestedMeters",
        "notes",
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function" as const,
    name: "get_customer_conversations",
    description:
      "Retrieve the stored conversation history for a Classic Textile customer.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["customerId"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "add_conversation_message",
    description:
      "Store a message in an existing Classic Textile conversation. Use this to preserve important conversation history. This does not create an order.",
    parameters: {
      type: "object",
      properties: {
        conversationId: {
          type: "integer",
          minimum: 1,
        },
        role: {
          type: "string",
        },
        content: {
          type: ["string", "null"],
        },
        imageUrl: {
          type: ["string", "null"],
        },
      },
      required: ["conversationId", "role", "content", "imageUrl"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function" as const,
    name: "get_customer_observations",
    description:
      "Retrieve previously recorded, evidence-based observations about a customer's textile, fashion, or purchasing preferences.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["customerId"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "add_customer_observation",
    description:
      "Record an evidence-based observation about a customer's textile, fashion, or purchasing preferences. Record observable business-relevant behavior only. Do not infer religion, ethnicity, or other sensitive personal attributes.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "integer",
          minimum: 1,
        },
        type: {
          type: "string",
        },
        observation: {
          type: "string",
        },
        source: {
          type: ["string", "null"],
        },
        confidence: {
          type: ["number", "null"],
          minimum: 0,
          maximum: 1,
        },
      },
      required: ["customerId", "type", "observation", "source", "confidence"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function" as const,
    name: "get_order_by_id",
    description: "Retrieve a specific Classic Textile order.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_customer_orders",
    description: "Retrieve the orders belonging to a Classic Textile customer.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["customerId"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_recent_orders",
    description: "Retrieve recent Classic Textile orders.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_designer_by_id",
    description: "Retrieve a specific designer.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "search_designers",
    description:
      "Search Classic Textile designers by name, brand, specialization, or other supported search criteria.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_fabric_by_id",
    description: "Retrieve a specific fabric and its stored information.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "search_fabrics",
    description:
      "Search Classic Textile fabrics using a natural-language query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_available_fabrics",
    description: "Retrieve fabrics currently marked as available.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_opportunity_by_id",
    description: "Retrieve a specific Classic Textile business opportunity.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_open_opportunities",
    description: "Retrieve currently open business opportunities.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "search_opportunities",
    description: "Search Classic Textile business opportunities.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_competitor_by_id",
    description: "Retrieve a specific competitor.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "search_competitors",
    description:
      "Search competitors by name, brand, website, Instagram, or notes.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_all_competitors",
    description: "Retrieve all stored competitors.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "get_trend_by_id",
    description: "Retrieve a specific fashion trend and its observations.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          minimum: 1,
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: true,
  },

  {
    type: "function" as const,
    name: "search_trends",
    description: "Search stored fashion and textile trends.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
];
