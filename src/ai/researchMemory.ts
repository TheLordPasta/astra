import type { ResearchReport } from "./mushMushResearch.js";
import { createResearchJob, addResearchSource, addResearchObservation, completeResearchJob, failResearchJob } from "../db/research.js";

const SOURCE_QUALITY: Record<ResearchReport["sources"][number]["sourceType"], number> = {
  official: 1, designer: 1, supplier: 0.95, trade: 0.9, news: 0.85, retailer: 0.8, social: 0.55, other: 0.4,
};
const DIRECTNESS_BY_TYPE: Record<string, number> = {
  competitor: 0.8, designer: 0.9, product: 0.9, pricing: 0.9, customer_behavior: 0.85,
  market_signal: 0.7, trend: 0.65, opportunity: 0.45, other: 0.6,
};
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function calculateRecencyScore(publishedAt: string | null, asOf: string): number {
  const published = parseDate(publishedAt), reference = parseDate(asOf);
  if (!published || !reference) return 0.5;
  const days = Math.max(0, (reference.getTime() - published.getTime()) / 86400000);
  return days <= 30 ? 1 : days <= 90 ? 0.9 : days <= 180 ? 0.75 : days <= 365 ? 0.55 : 0.3;
}
export function researchConfidence(scored: number, finding: number, capToFinding: boolean): number {
  return capToFinding ? Math.min(scored, Math.max(0, Math.min(1, finding))) : scored;
}
// Shared by both the legacy injected store and the atomic production adapter.
// Preserve existing scoring and the opt-in visual-confidence ceiling.
export function scoreResearchFinding(report: ResearchReport, finding: ResearchReport["findings"][number], capToFinding = false) {
  const sources = report.sources.filter(s => finding.sourceUrls.includes(s.url));
  const sourceQuality = sources.length ? Math.max(...sources.map(s => SOURCE_QUALITY[s.sourceType])) : 0.4;
  const directness = DIRECTNESS_BY_TYPE[finding.type] ?? 0.6;
  const recencyValues = finding.sourceUrls.map(url => calculateRecencyScore(report.sources.find(s => s.url === url)?.publishedAt ?? null, report.asOf));
  const recencyScore = recencyValues.length ? Math.max(...recencyValues) : 0.5;
  const domains = new Set<string>();
  for (const url of finding.sourceUrls) { try { domains.add(new URL(url).hostname); } catch { /* invalid source is not an origin */ } }
  const independenceScore = domains.size === 0 ? 0.2 : domains.size === 1 ? 0.33 : domains.size === 2 ? 0.67 : 1;
  const scored = Number((sourceQuality * 0.35 + directness * 0.25 + recencyScore * 0.2 + independenceScore * 0.2).toFixed(3));
  return { sourceQuality, directness, recencyScore, independenceScore, confidence: researchConfidence(scored, finding.confidence, capToFinding), signalStrength: null };
}
export interface ResearchReportStore {
  createResearchJob(data: Parameters<typeof createResearchJob>[0]): Promise<{ id: number }>;
  addResearchSource(data: Parameters<typeof addResearchSource>[0]): Promise<{ id: number }>;
  addResearchObservation(data: Parameters<typeof addResearchObservation>[0]): Promise<unknown>;
  completeResearchJob(id: number): Promise<unknown>;
  failResearchJob(id: number): Promise<unknown>;
}
export async function saveResearchReport(
  report: ResearchReport,
  options: { capConfidenceToFinding?: boolean; researchJobId?: number } = {},
  store?: ResearchReportStore,
): Promise<number> {
  if (!store) {
    // Lazy import keeps pure scoring usable by the persistence adapter.
    const { saveAtomicResearchReport } = await import("../db/fashionMemory.js");
    return saveAtomicResearchReport(report, options);
  }
  // Preserve the explicit legacy injection boundary used by existing offline callers.
  // Production always uses the transaction above; this adapter is not atomic.
  const researchJob = await store.createResearchJob({ topic: report.topic, scope: report.scope, market: report.market,
    segment: report.segment, category: report.category, geography: report.geography, timeRange: report.timeRange,
    summary: report.summary, asOf: parseDate(report.asOf) });
  try {
    const ids = new Map<string, number>();
    for (const source of report.sources) {
      const row = await store.addResearchSource({ researchJobId: researchJob.id, title: source.title, url: source.url,
        sourceType: source.sourceType, publishedAt: parseDate(source.publishedAt) });
      ids.set(source.url, row.id);
    }
    for (const finding of report.findings) {
      const sourceIds = [...new Set(finding.sourceUrls.map(url => ids.get(url)).filter((id): id is number => id !== undefined))];
      await store.addResearchObservation({ researchJobId: researchJob.id, type: finding.type, subject: finding.subject,
        statement: finding.statement, evidence: finding.evidence, market: report.market, segment: report.segment, category: report.category,
        ...scoreResearchFinding(report, finding, options.capConfidenceToFinding === true), sourceIds });
    }
    await store.completeResearchJob(researchJob.id);
    return researchJob.id;
  } catch (error) {
    await store.failResearchJob(researchJob.id);
    throw error;
  }
}
