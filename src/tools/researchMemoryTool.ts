import { z } from "zod/v4";

import { searchResearchMemory } from "../db/research.js";

export const researchMemoryArgumentsSchema = z.object({
  market: z.string().nullable().optional(),
  segment: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  geography: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  minConfidence: z.number().min(0).max(1).nullable().optional(),
  limit: z.number().int().min(1).max(50).nullable().optional(),
});

export type ResearchMemoryArguments = z.infer<
  typeof researchMemoryArgumentsSchema
>;

export async function getResearchMemory(args: ResearchMemoryArguments) {
  return searchResearchMemory({
    ...(args.market != null ? { market: args.market } : {}),
    ...(args.segment != null ? { segment: args.segment } : {}),
    ...(args.category != null ? { category: args.category } : {}),
    ...(args.geography != null ? { geography: args.geography } : {}),
    ...(args.type != null ? { type: args.type } : {}),
    ...(args.subject != null ? { subject: args.subject } : {}),
    ...(args.minConfidence != null
      ? { minConfidence: args.minConfidence }
      : {}),
    ...(args.limit != null ? { limit: args.limit } : {}),
  });
}

export const researchMemoryTool = {
  type: "function" as const,
  name: "get_research_memory",
  description:
    "Search Mush Mush's persistent market-research experience. " +
    "Use this when information about designers, competitors, " +
    "trends, products, customer behavior, pricing, or market " +
    "signals may already exist in stored research. " +
    "This searches stored evidence and does not perform new web research.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      market: {
        type: ["string", "null"],
        description: "Market, for example 'Israeli bridal'.",
      },
      segment: {
        type: ["string", "null"],
        description: "Industry or customer segment.",
      },
      category: {
        type: ["string", "null"],
        description: "Product or research category, for example 'Lace'.",
      },
      geography: {
        type: ["string", "null"],
        description: "Geographic scope, for example 'Israel'.",
      },
      type: {
        type: ["string", "null"],
        description:
          "Observation type, for example 'trend', 'designer', 'competitor', 'pricing', or 'opportunity'.",
      },
      subject: {
        type: ["string", "null"],
        description:
          "Specific designer, competitor, trend, product, or other subject.",
      },
      minConfidence: {
        type: ["number", "null"],
        description: "Minimum stored confidence from 0 to 1.",
      },
      limit: {
        type: ["integer", "null"],
        description: "Maximum number of observations to return.",
      },
    },
    required: [
      "market",
      "segment",
      "category",
      "geography",
      "type",
      "subject",
      "minConfidence",
      "limit",
    ],
    additionalProperties: false,
  },
};

export async function executeResearchMemoryTool(
  rawArguments: string,
): Promise<string> {
  const parsed = researchMemoryArgumentsSchema.parse(JSON.parse(rawArguments));

  const observations = await getResearchMemory(parsed);

  return JSON.stringify(
    observations.map((observation) => ({
      observation: {
        id: observation.id,
        type: observation.type,
        subject: observation.subject,
        statement: observation.statement,
        evidence: observation.evidence,
        confidence: observation.confidence,
        signalStrength: observation.signalStrength,
        observedAt: observation.observedAt,
      },
      research: {
        jobId: observation.researchJob.id,
        topic: observation.researchJob.topic,
        scope: observation.researchJob.scope,
        market: observation.researchJob.market,
        segment: observation.researchJob.segment,
        category: observation.researchJob.category,
        geography: observation.researchJob.geography,
        timeRange: observation.researchJob.timeRange,
        asOf: observation.researchJob.asOf,
      },
      sources: observation.sources.map(({ source }) => ({
        title: source.title,
        url: source.url,
        sourceType: source.sourceType,
        publishedAt: source.publishedAt,
        observedAt: source.observedAt,
      })),
    })),
    null,
    2,
  );
}
