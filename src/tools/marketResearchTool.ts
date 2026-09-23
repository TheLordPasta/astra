import { z } from "zod/v4";

import { runMarketResearch } from "../ai/mushMushResearch.js";
import { saveResearchReport } from "../ai/researchMemory.js";
import { countResearchJobsSince } from "../db/research.js";

export const marketResearchArgumentsSchema = z.object({
  researchQuestion: z.string().min(5).max(500),
  market: z.string().min(1).max(100),
  segment: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  geography: z.string().min(1).max(100),
  timeRangeDays: z.number().int().min(7).max(365),
});

export type MarketResearchArguments = z.infer<
  typeof marketResearchArgumentsSchema
>;

export const marketResearchTool = {
  type: "function" as const,
  name: "run_market_research",
  description:
    "Perform fresh, narrowly scoped market research using live web information. " +
    "Use this ONLY when get_research_memory has returned no relevant recent evidence " +
    "or the stored evidence is insufficient for the user's current question. " +
    "Never use this for broad generic research. Always provide a specific market, " +
    "segment, category, geography, and time range.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      researchQuestion: {
        type: "string",
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

export async function executeMarketResearchTool(
  rawArguments: string,
): Promise<string> {
  const parsed = marketResearchArgumentsSchema.parse(JSON.parse(rawArguments));

  const configuredLimit = Number(process.env.RESEARCH_DAILY_JOB_LIMIT ?? "3");

  const dailyLimit =
    Number.isInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : 3;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentJobCount = await countResearchJobsSince(since);

  if (recentJobCount >= dailyLimit) {
    return JSON.stringify({
      error: "Research budget reached",
      message:
        "The fresh-research budget for the last 24 hours has been reached. " +
        "Use persistent research memory instead of starting another research job.",
      recentJobCount,
      dailyLimit,
    });
  }

  const researchRequest = `
Research question:
${parsed.researchQuestion}

Market:
${parsed.market}

Segment:
${parsed.segment}

Category:
${parsed.category}

Geography:
${parsed.geography}

Time range:
The last ${parsed.timeRangeDays} calendar days ending today.

Stay strictly within this scope.
Do not broaden the market or category.
Do not infer demand from social engagement alone.
  `.trim();

  const report = await runMarketResearch(researchRequest);

  const savedJob = await saveResearchReport(report);

  return JSON.stringify(
    {
      status: "completed",
      researchJobId: savedJob,
      topic: report.topic,
      scope: report.scope,
      market: report.market,
      segment: report.segment,
      category: report.category,
      geography: report.geography,
      timeRange: report.timeRange,
      asOf: report.asOf,
      summary: report.summary,
      findings: report.findings,
      uncertainties: report.uncertainties,
      sources: report.sources.map((source) => ({
        title: source.title,
        url: source.url,
        sourceType: source.sourceType,
        publishedAt: source.publishedAt,
      })),
    },
    null,
    2,
  );
}
