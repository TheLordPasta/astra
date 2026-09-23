import "dotenv/config";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod/v4";

const openai = new OpenAI();

const model = process.env.OPENAI_MODEL ?? "gpt-6-astra";

const ResearchSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  sourceType: z.enum([
    "official",
    "news",
    "trade",
    "designer",
    "supplier",
    "retailer",
    "social",
    "other",
  ]),
  publishedAt: z.string().nullable(),
});

const ResearchFindingSchema = z.object({
  type: z.enum([
    "competitor",
    "designer",
    "trend",
    "market_signal",
    "pricing",
    "customer_behavior",
    "product",
    "opportunity",
    "other",
  ]),
  subject: z.string(),
  statement: z.string(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
  sourceUrls: z.array(z.string()),
});

const ResearchReportSchema = z.object({
  topic: z.string(),
  scope: z.string(),
  market: z.string().nullable(),
  segment: z.string().nullable(),
  category: z.string().nullable(),
  geography: z.string().nullable(),
  timeRange: z.string().nullable(),
  asOf: z.string(),
  summary: z.string(),
  findings: z.array(ResearchFindingSchema),
  uncertainties: z.array(z.string()),
  sources: z.array(ResearchSourceSchema),
});

export type ResearchReport = z.infer<typeof ResearchReportSchema>;

export async function runMarketResearch(
  researchRequest: string,
): Promise<ResearchReport> {
  const today = new Date().toISOString().slice(0, 10);

  const instructions = `
You are Mush Mush's market research brain.

You research the fashion and textile industry using live web information.

Today's date is ${today}.

Your job is NOT to give generic fashion knowledge.
Your job is to gather evidence about a specific research request.

Research rules:

1. Always use web search.
2. Stay tightly within the requested market, segment,
   product category, geography, and time period.
3. Prefer primary sources:
   - official brand websites
   - designer websites
   - supplier websites
   - official announcements
   - reputable trade publications
   - reputable news sources
4. Social media can be useful evidence, but treat social
   metrics as signals, not proof of market demand.
5. Followers, likes, comments, and views are metadata/signals.
   They must NOT by themselves produce high confidence.
6. Distinguish:
   - directly observed facts
   - repeated signals
   - interpretation
   - uncertainty
7. Never invent names, numbers, prices, trends, sources,
   or URLs.
8. Every finding must include evidence.
9. Confidence must represent evidence quality, not importance.
10. A single source should rarely justify very high confidence.
11. Repeated independent observations can increase confidence.
12. Recent evidence should generally matter more for current-market
    questions than old evidence.
13. If something cannot be verified, put it in uncertainties.
14. sourceUrls must contain only URLs actually found during research.
15. This is an internal research report, not customer-facing chat.
16. For every research report, explicitly identify:
    - market
    - segment
    - category
    - geography
    - time range

Return null only when the information is genuinely unspecified.
Do not infer a broader scope than the research request.

Think like an industry researcher gathering experience
for Classic Textile.

Return only the structured research report.
`.trim();

  const response = await openai.responses.parse({
    model,
    instructions,
    tools: [
      {
        type: "web_search",
        search_context_size: "medium",
      },
    ],
    max_tool_calls: 4,
    max_output_tokens: 2500,
    text: {
      format: zodTextFormat(ResearchReportSchema, "market_research_report"),
    },
    input: researchRequest,
  });

  if (!response.output_parsed) {
    throw new Error("Mush Mush research returned no structured report.");
  }

  return response.output_parsed;
}
