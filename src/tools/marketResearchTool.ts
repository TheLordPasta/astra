import { z } from "zod/v4";
import "dotenv/config";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

const openai = new OpenAI();

const model = process.env.OPENAI_MODEL ?? "gpt-6-astra";
import {
  runMemoryFirstWebResearch,
  loadLiveFashionPlan,
} from "../ai/fashionResearchPlanning.js";
import type { MemoryFirstWebDependencies } from "../ai/fashionResearchPlanning.js";
const ResearchPlanSchema = z.object({
  sourceMode: z.enum(["web", "instagram", "web_and_instagram"]),

  webObjective: z.string().nullable(),

  instagramObjective: z.string().nullable(),

  instagramDesigners: z.array(z.string()).max(20),

  rationale: z.string(),
});

type ResearchPlan = z.infer<typeof ResearchPlanSchema>;
export interface InstagramResearchRequest {
  originalRequest: string;
  objective: string;
  designers: string[];
}

export type InstagramResearchCollector = (
  request: InstagramResearchRequest,
) => Promise<string>;

export interface MarketResearchDependencies {
  instagramCollector?: InstagramResearchCollector;
}

export const marketResearchArgumentsSchema = z.object({
  researchQuestion: z.string().trim().min(5).max(4000),
  market: z.string().min(1).max(100),
  segment: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  geography: z.string().min(1).max(100),
  timeRangeDays: z.number().int().min(7).max(365),
});
export type MarketResearchArguments = z.infer<
  typeof marketResearchArgumentsSchema
>;
async function planResearch(
  researchRequest: string,
  instagramAvailable: boolean,
): Promise<ResearchPlan> {
  const response = await openai.responses.parse({
    model,

    reasoning: {
      effort: "low",
    },

    max_output_tokens: 1500,

    text: {
      format: zodTextFormat(ResearchPlanSchema, "research_plan"),
    },

    instructions: `
You decide which evidence sources Mush Mush needs.

WEB:
Use for:
- mills
- textile manufacturers
- machinery
- technical textile knowledge
- suppliers
- pricing
- official websites
- news
- market information

INSTAGRAM:
Use for:
- designer posts
- current collections
- actual garments
- silhouettes
- embroidery
- embellishments
- colors
- visual fabric characteristics
- engagement signals
- recurring visual directions

WEB_AND_INSTAGRAM:
Use when both are genuinely needed.

Instagram available:
${instagramAvailable ? "yes" : "no"}

Rules:

1. Choose based on the research question.
2. Do not choose Instagram if it is unavailable.
3. Technical manufacturing questions usually require web.
4. Questions about what designers are currently posting usually require Instagram.
5. Questions connecting designer trends to fabrics, sourcing or manufacturing may require both.
6. If Instagram is needed, list the relevant designer usernames when possible.
`.trim(),

    input: researchRequest,
  });

  if (!response.output_parsed) {
    throw new Error("Mush Mush could not create a research plan.");
  }

  return response.output_parsed;
}

export const marketResearchTool = {
  type: "function" as const,
  name: "run_market_research",
  description:
    "Perform fresh, narrowly scoped market research using live web information. " +
    "Use this ONLY when get_research_memory has returned no relevant recent evidence " +
    "or the stored evidence is insufficient for the user's current question. " +
    "Loads semantic fashion memory before fresh research; updates evidence-backed concepts, not human lessons. " +
    "Never use this for broad generic research. Always provide a specific market, " +
    "segment, category, geography, and time range.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      researchQuestion: {
        type: "string",
        maxLength: 4000,
        description: "The specific question the research needs to answer.",
      },
      market: {
        type: "string",
        description: "Specific market, for example 'Israeli bridal'.",
      },
      segment: {
        type: "string",
        description:
          "Specific industry or customer segment, for example 'Bridal designers'.",
      },
      category: {
        type: "string",
        description:
          "Specific product/category, for example 'Lace in bridal clothing'.",
      },
      geography: {
        type: "string",
        description: "Specific geographic scope, for example 'Israel'.",
      },
      timeRangeDays: {
        type: "integer",
        minimum: 7,
        maximum: 365,
        description: "How many recent calendar days the research should cover.",
      },
    },
    required: [
      "researchQuestion",
      "market",
      "segment",
      "category",
      "geography",
      "timeRangeDays",
    ],
    additionalProperties: false,
  },
};
export interface MarketResearchDependencies extends MemoryFirstWebDependencies {
  countJobs(since: Date): Promise<number>;
}
const liveDependencies: MarketResearchDependencies = {
  load: loadLiveFashionPlan,
  async research(request) {
    return (await import("../ai/mushMushResearch.js")).runMarketResearch(
      request,
    );
  },
  async save(report) {
    return (await import("../ai/researchMemory.js")).saveResearchReport(report);
  },
  async countJobs(since) {
    return (await import("../db/research.js")).countResearchJobsSince(since);
  },
};

function researchFailure(
  stage: string,
  code: string,
  kind: "operation_failed" | "http_error" | "aborted" = "operation_failed",
  status?: number,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    success: false,
    failure: {
      stage,
      kind,
      code,
      ...(status == null ? {} : { status }),
    },
    ...extra,
  });
}

export async function executeMarketResearchTool(
  rawArguments: string,
  deps: MarketResearchDependencies = liveDependencies,
): Promise<string> {
  const parsed = marketResearchArgumentsSchema.parse(JSON.parse(rawArguments));

  const configuredLimit = Number(process.env.RESEARCH_DAILY_JOB_LIMIT ?? "3");

  const dailyLimit =
    Number.isInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : 3;

  const recentJobCount = await deps.countJobs(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );

  if (recentJobCount >= dailyLimit) {
    return JSON.stringify({
      error: "Research budget reached",
      message:
        "The fresh-research budget for the last 24 hours has been reached. Use persistent research memory instead of starting another research job.",

      success: false,

      failure: {
        stage: "research.budget",
        kind: "operation_failed",
        code: "daily_limit_reached",
      },

      recentJobCount,
      dailyLimit,
    });
  }

  const researchRequest =
    `Research question:\n${parsed.researchQuestion}\n\n` +
    `Market:\n${parsed.market}\n\n` +
    `Segment:\n${parsed.segment}\n\n` +
    `Category:\n${parsed.category}\n\n` +
    `Geography:\n${parsed.geography}\n\n` +
    `Time range:\nThe last ${parsed.timeRangeDays} calendar days ending today.\n\n` +
    `Stay strictly within this scope.\n` +
    `Do not broaden the market or category.\n` +
    `Do not infer demand from social engagement alone.`;

  // IMPORTANT:
  // Let failures from memory/research/save propagate.
  // Existing tests and callers depend on rejection semantics here.
  const { report, researchJobId, memoryPlan } = await runMemoryFirstWebResearch(
    {
      market: parsed.market,
      segment: parsed.segment,
      category: parsed.category,
      geography: parsed.geography,
    },
    researchRequest,
    deps,
  );

  return JSON.stringify(
    {
      status: "completed",
      researchJobId,
      memoryPlan,
      ...report,
    },
    null,
    2,
  );
}
