import "dotenv/config";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod/v4";

import { prisma } from "../db/client.js";

const openai = new OpenAI();

const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

const ExtractedObservationSchema = z.object({
  customerRef: z.string(),
  type: z.enum([
    "preference",
    "request",
    "objection",
    "behavior",
    "product_need",
    "fabric_need",
    "purchasing_signal",
    "other",
  ]),
  observation: z.string(),
  explicitness: z.enum(["explicit", "inferred"]),
  conversationIds: z.array(z.number().int().positive()).max(10),
});

const ExtractionResultSchema = z.object({
  observations: z.array(ExtractedObservationSchema),
});

type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

interface CustomerConversationGroup {
  customerId: number;
  customerRef: string;
  conversations: Array<{
    conversationId: number;
    messages: Array<{
      content: string;
      createdAt: Date;
    }>;
  }>;
}

function calculateConfidence(
  explicitness: "explicit" | "inferred",
  conversationCount: number,
): number {
  if (explicitness === "explicit") {
    return conversationCount >= 2 ? 0.98 : 0.95;
  }

  return conversationCount >= 2 ? 0.72 : 0.6;
}

async function saveObservation(data: {
  customerId: number;
  type: string;
  observation: string;
  source: string;
  confidence: number;
}) {
  const existing = await prisma.customerObservation.findFirst({
    where: {
      customerId: data.customerId,
      type: data.type,
      observation: data.observation,
    },
  });

  if (existing) {
    return {
      observation: existing,
      created: false,
    };
  }

  const observation = await prisma.customerObservation.create({
    data: {
      customerId: data.customerId,
      type: data.type,
      observation: data.observation,
      source: data.source,
      confidence: data.confidence,
    },
  });

  return {
    observation,
    created: true,
  };
}

export async function learnFromCustomerConversations(options?: {
  days?: number;
  maxCustomers?: number;
  maxMessages?: number;
}): Promise<string> {
  const days = Math.max(1, Math.min(options?.days ?? 90, 365));

  const maxCustomers = Math.max(1, Math.min(options?.maxCustomers ?? 50, 100));

  const maxMessages = Math.max(20, Math.min(options?.maxMessages ?? 500, 1000));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const messages = await prisma.conversationMessage.findMany({
    where: {
      role: "user",
      content: {
        not: null,
      },
      createdAt: {
        gte: since,
      },
      conversation: {
        customerId: {
          not: null,
        },
      },
    },
    select: {
      content: true,
      createdAt: true,
      conversation: {
        select: {
          id: true,
          customerId: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: maxMessages,
  });

  const grouped = new Map<number, CustomerConversationGroup>();

  for (const message of messages) {
    const customerId = message.conversation.customerId;

    if (customerId == null || message.content == null) {
      continue;
    }

    let group = grouped.get(customerId);

    if (!group) {
      if (grouped.size >= maxCustomers) {
        continue;
      }

      group = {
        customerId,
        customerRef: `CUSTOMER_${grouped.size + 1}`,
        conversations: [],
      };

      grouped.set(customerId, group);
    }

    let conversation = group.conversations.find(
      (item) => item.conversationId === message.conversation.id,
    );

    if (!conversation) {
      conversation = {
        conversationId: message.conversation.id,
        messages: [],
      };

      group.conversations.push(conversation);
    }

    conversation.messages.push({
      content: message.content,
      createdAt: message.createdAt,
    });
  }

  if (grouped.size === 0) {
    return JSON.stringify({
      status: "no_data",
      message:
        "No customer conversation messages were available in the requested time range.",
      days,
      customersScanned: 0,
      observationsCreated: 0,
    });
  }

  const customerContext = Array.from(grouped.values())
    .map((group) => {
      const conversations = group.conversations
        .map((conversation) => {
          const messagesText = conversation.messages
            .map(
              (message) =>
                `[${message.createdAt.toISOString()}] ${message.content}`,
            )
            .join("\n");

          return `
Conversation ${conversation.conversationId}:
${messagesText}
`.trim();
        })
        .join("\n\n");

      return `
${group.customerRef}:
${conversations}
`.trim();
    })
    .join("\n\n====================\n\n");

  const instructions = `
You are Mush Mush's customer-learning analyst inside the private Classroom.

Analyze only the supplied customer messages.

Your job is to extract business-relevant customer observations.

Good observations include:
- an explicit fabric preference
- an explicit product request
- an explicit objection
- a repeated need
- a concrete purchasing behavior
- a concrete garment requirement
- a concrete textile requirement

Important rules:

1. Only record information directly supported by the customer messages.
2. Do not invent preferences.
3. Do not infer sensitive personal attributes.
4. Do not infer religion, ethnicity, health, sexuality, politics, or similar sensitive traits.
5. Do not infer gender from weak evidence.
6. Do not turn one customer's request into a market trend.
7. This task is about individual customer observations, not market conclusions.
8. "explicit" means the customer directly stated the need/preference/behavior.
9. "inferred" means the observation is reasonably supported by behavior but was not directly stated.
10. Keep inferred observations conservative.
11. Use customerRef exactly as provided.
12. Include conversation IDs that directly support the observation.
13. Keep observations concise and business-relevant.
14. Do not include unnecessary personal details.
15. Multiple messages from the same customer do NOT represent multiple customers.

Return only observations that are actually supported by the supplied messages.
`;

  const response = await openai.responses.parse({
    model,
    instructions,
    text: {
      format: zodTextFormat(
        ExtractionResultSchema,
        "customer_learning_observations",
      ),
    },
    input: customerContext,
  });

  const parsed: ExtractionResult | null = response.output_parsed;

  if (!parsed) {
    throw new Error(
      "Customer-learning analysis returned no structured result.",
    );
  }

  let observationsCreated = 0;
  let observationsExisting = 0;

  for (const extracted of parsed.observations) {
    const group = Array.from(grouped.values()).find(
      (item) => item.customerRef === extracted.customerRef,
    );

    if (!group) {
      continue;
    }

    const validConversationIds = extracted.conversationIds.filter(
      (conversationId) =>
        group.conversations.some(
          (conversation) => conversation.conversationId === conversationId,
        ),
    );

    if (validConversationIds.length === 0) {
      continue;
    }

    const confidence = calculateConfidence(
      extracted.explicitness,
      validConversationIds.length,
    );

    const source = `classroom:${validConversationIds.slice(0, 5).join(",")}`;

    const saved = await saveObservation({
      customerId: group.customerId,
      type: extracted.type,
      observation: extracted.observation,
      source,
      confidence,
    });

    if (saved.created) {
      observationsCreated++;
    } else {
      observationsExisting++;
    }
  }

  return JSON.stringify(
    {
      status: "completed",
      days,
      customersScanned: grouped.size,
      messagesScanned: messages.length,
      observationsCreated,
      observationsAlreadyStored: observationsExisting,
      totalExtracted: parsed.observations.length,
    },
    null,
    2,
  );
}
