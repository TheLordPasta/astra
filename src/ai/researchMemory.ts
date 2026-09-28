import type { ResearchReport } from "./mushMushResearch.js";

import {
  createResearchJob,
  addResearchSource,
  addResearchObservation,
  completeResearchJob,
  failResearchJob,
} from "../db/research.js";

const SOURCE_QUALITY: Record<
  ResearchReport["sources"][number]["sourceType"],
  number
> = {
  official: 1.0,
  designer: 1.0,
  supplier: 0.95,
  trade: 0.9,
  news: 0.85,
  retailer: 0.8,
  social: 0.55,
  other: 0.4,
};

const DIRECTNESS_BY_TYPE: Record<string, number> = {
  competitor: 0.8,
  designer: 0.9,
  product: 0.9,
  pricing: 0.9,
  customer_behavior: 0.85,
  market_signal: 0.7,
  trend: 0.65,
  opportunity: 0.45,
  other: 0.6,
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateRecencyScore(
  publishedAt: string | null,
  asOf: string,
): number {
  const published = parseDate(publishedAt);
  const reference = parseDate(asOf);

  if (!published || !reference) {
    return 0.5;
  }

  const days = Math.max(
    0,
    (reference.getTime() - published.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (days <= 30) return 1.0;
  if (days <= 90) return 0.9;
  if (days <= 180) return 0.75;
  if (days <= 365) return 0.55;

  return 0.3;
}

function getSourceDomains(urls: string[]): string[] {
  const domains = new Set<string>();

  for (const url of urls) {
    try {
      domains.add(new URL(url).hostname);
    } catch {
      // Ignore malformed URLs.
    }
  }

  return [...domains];
}

function calculateIndependenceScore(sourceUrls: string[]): number {
  const uniqueDomains = getSourceDomains(sourceUrls).length;

  if (uniqueDomains <= 0) return 0.2;
  if (uniqueDomains === 1) return 0.33;
  if (uniqueDomains === 2) return 0.67;

  return 1.0;
}

function roundScore(value: number): number {
  return Number(value.toFixed(3));
}

function calculateConfidence(data: {
  sourceQuality: number;
  directness: number;
  recencyScore: number;
  independenceScore: number;
}): number {
  return roundScore(
    data.sourceQuality * 0.35 +
      data.directness * 0.25 +
      data.recencyScore * 0.2 +
      data.independenceScore * 0.2,
  );
}

// Opt-in ceiling: storage must not raise cautious visual confidence.
// Existing market research retains its original scoring by default.
export function researchConfidence(scored: number, finding: number, capToFinding: boolean): number {
  return capToFinding ? Math.min(scored, Math.max(0, Math.min(1, finding))) : scored;
}

// Narrow repository boundary supports offline persistence tests, without mocking Prisma proxies.
export interface ResearchReportStore {
  createResearchJob(data: Parameters<typeof createResearchJob>[0]): Promise<{ id: number }>;
  addResearchSource(data: Parameters<typeof addResearchSource>[0]): Promise<{ id: number }>;
  addResearchObservation(data: Parameters<typeof addResearchObservation>[0]): Promise<unknown>;
  completeResearchJob(id: number): Promise<unknown>;
  failResearchJob(id: number): Promise<unknown>;
}
const defaultStore: ResearchReportStore = {
  createResearchJob, addResearchSource, addResearchObservation, completeResearchJob, failResearchJob,
};

export async function saveResearchReport(
  report: ResearchReport,
  options: { capConfidenceToFinding?: boolean } = {},
  store: ResearchReportStore = defaultStore,
): Promise<number> {
  const researchJob = await store.createResearchJob({
    topic: report.topic,
    scope: report.scope,
    market: report.market,
    segment: report.segment,
    category: report.category,
    geography: report.geography,
    timeRange: report.timeRange,
    summary: report.summary,
    asOf: parseDate(report.asOf),
  });

  try {
    const sourceIdByUrl = new Map<string, number>();

    for (const source of report.sources) {
      const storedSource = await store.addResearchSource({
        researchJobId: researchJob.id,
        title: source.title,
        url: source.url,
        sourceType: source.sourceType,
        publishedAt: parseDate(source.publishedAt ?? null),
      });

      sourceIdByUrl.set(source.url, storedSource.id);
    }

    for (const finding of report.findings) {
      const sourceIds = [...new Set(finding.sourceUrls
        .map((url) => sourceIdByUrl.get(url))
        .filter((id): id is number => typeof id === "number"))];

      const sourceQualityValues = sourceIds.map((sourceId) => {
        const source = report.sources.find(
          (item) => sourceIdByUrl.get(item.url) === sourceId,
        );

        return source ? SOURCE_QUALITY[source.sourceType] : 0.4;
      });

      const sourceQuality =
        sourceQualityValues.length > 0 ? Math.max(...sourceQualityValues) : 0.4;

      const directness = DIRECTNESS_BY_TYPE[finding.type] ?? 0.6;

      const recencyValues = finding.sourceUrls.map((url) => {
        const source = report.sources.find((item) => item.url === url);

        return calculateRecencyScore(source?.publishedAt ?? null, report.asOf);
      });

      const recencyScore =
        recencyValues.length > 0 ? Math.max(...recencyValues) : 0.5;

      const independenceScore = calculateIndependenceScore(finding.sourceUrls);

      const confidence = researchConfidence(calculateConfidence({
        sourceQuality,
        directness,
        recencyScore,
        independenceScore,
      }), finding.confidence, options.capConfidenceToFinding === true);

      await store.addResearchObservation({
        researchJobId: researchJob.id,
        type: finding.type,
        subject: finding.subject,
        statement: finding.statement,
        evidence: finding.evidence,

        market: report.market,
        segment: report.segment,
        category: report.category,

        sourceQuality,
        directness,
        recencyScore,
        independenceScore,
        confidence,
        signalStrength: null,
        sourceIds,
      });
    }

    await store.completeResearchJob(researchJob.id);

    return researchJob.id;
  } catch (error) {
    await store.failResearchJob(researchJob.id);
    throw error;
  }
}
