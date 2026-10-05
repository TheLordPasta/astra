import { prisma } from "./client.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { ResearchReport } from "../ai/mushMushResearch.js";
import { scoreResearchFinding } from "../ai/researchMemory.js";
import { assessConcept, claimFromFinding, conceptIdentity, ConceptMetadataSchema, createEvidence, EvidenceSchema, normalizeConcept, parseStored, planFashionResearch } from "../ai/fashionMemory.js";
import type { FashionKnowledge, FashionScope } from "../ai/fashionMemory.js";

// Extend the existing tables with versioned records; never modify legacy trends or human lessons.
const PREFIX = "fashion-memory-v1:";
const EVIDENCE = "fashion_evidence_v1";
const ASSESSMENT = "fashion_assessment_v1";
export type FashionDatabase = Pick<typeof prisma, "researchJob" | "trend" | "trendObservation" | "$transaction">;

async function completedEvidence(db: Pick<Prisma.TransactionClient, "researchJob">, rows: { evidence: string | null }[], currentJobId?: number) {
  const evidence = rows.flatMap(row => { const e = parseStored(row.evidence, EvidenceSchema); return e ? [e] : []; });
  const jobs = await db.researchJob.findMany({ where: { id: { in: [...new Set(evidence.map(e => e.jobId))] }, status: "completed" }, select: { id: true } });
  const valid = new Set(jobs.map(j => j.id));
  // Current job is allowed only inside its atomic transaction, before completion.
  if (currentJobId !== undefined) valid.add(currentJobId);
  return evidence.filter(e => valid.has(e.jobId));
}

export async function persistFashionConcepts(tx: Prisma.TransactionClient, report: ResearchReport, jobId: number, observations: { id: number; index: number }[], sourceIds: Map<string, number>) {
  if (!observations.some(o => claimFromFinding(report.findings[o.index]!) !== null)) return;
  // Global transaction-scoped lock prevents races creating identities without a schema migration.
  // No network/model calls occur while holding it; lock wait is bounded by transaction timeout.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(731904182)`;
  const scope: FashionScope = { market: report.market, segment: report.segment, category: report.category, geography: report.geography };
  const touched = new Set<number>();
  for (const stored of observations) {
    const finding = report.findings[stored.index]!;
    const claim = claimFromFinding(finding);
    if (!claim) continue;
    const key = conceptIdentity(claim, scope);
    const description = PREFIX + JSON.stringify({ version: 1, key, name: claim.name, kind: claim.kind,
      scope: Object.fromEntries(Object.entries(scope).map(([k, v]) => [k, v === null ? null : normalizeConcept(v)])) });
    let trend = await tx.trend.findFirst({ where: { description: { startsWith: `${PREFIX}{"version":1,"key":"${key}"` } } });
    const entries = finding.sourceUrls.flatMap(url => {
      const source = report.sources.find(s => s.url === url), id = sourceIds.get(url);
      if (!source || id === undefined) return [];
      const e = createEvidence({ claim, scope, finding, jobId, observationId: stored.id, source: { ...source, id }, asOf: report.asOf, limitations: report.uncertainties });
      return e ? [e] : [];
    });
    if (!entries.length) continue;
    if (!trend) trend = await tx.trend.create({ data: { name: claim.name, category: claim.kind, description } });
    const rows = await tx.trendObservation.findMany({ where: { trendId: trend.id, signal: EVIDENCE }, orderBy: { id: "asc" } });
    const old = await completedEvidence(tx, rows, jobId);
    const latest = new Map(old.map(e => [e.key, e.fingerprint]));
    for (const e of entries) {
      if (latest.get(e.key) === e.fingerprint) continue;
      await tx.trendObservation.create({ data: { trendId: trend.id, market: report.market, segment: report.segment, garmentType: report.category, signal: EVIDENCE, evidence: JSON.stringify(e), source: e.url.slice(0, 500), observedAt: new Date(e.observedAt), confidence: e.confidence } });
      latest.set(e.key, e.fingerprint);
      touched.add(trend.id);
    }
  }
  for (const trendId of touched) {
    const rows = await tx.trendObservation.findMany({ where: { trendId, signal: EVIDENCE }, orderBy: { id: "asc" } });
    const assessment = assessConcept(await completedEvidence(tx, rows, jobId), report.asOf);
    await tx.trendObservation.create({ data: { trendId, market: report.market, segment: report.segment, garmentType: report.category,
      signal: ASSESSMENT, confidence: assessment.confidence, evidence: JSON.stringify({ ...assessment, jobId }), observedAt: new Date(report.asOf) } });
  }
}

export async function loadFashionKnowledge(filters: Partial<FashionScope> & { subject?: string | null; minConfidence?: number | null; limit?: number | null } = {}, db: FashionDatabase = prisma): Promise<FashionKnowledge[]> {
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
  const clauses = Object.entries({ market: filters.market, segment: filters.segment, category: filters.category, geography: filters.geography })
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1]);
  const trends = await db.trend.findMany({ where: { AND: [
    { description: { startsWith: PREFIX } },
    ...clauses.map(([key, value]) => ({ description: { contains: `${JSON.stringify(key)}:${JSON.stringify(normalizeConcept(value))}`, mode: "insensitive" as const } })),
    ...(filters.subject ? [{ name: { contains: filters.subject, mode: "insensitive" as const } }] : []),
  ] }, orderBy: { id: "desc" }, take: limit });
  const result: FashionKnowledge[] = [];
  for (const trend of trends) {
    const concept = parseStored(trend.description?.slice(PREFIX.length) ?? null, ConceptMetadataSchema);
    if (!concept) continue;
    const rows = await db.trendObservation.findMany({ where: { trendId: trend.id, signal: EVIDENCE }, orderBy: { id: "asc" } });
    const evidence = await completedEvidence(db, rows);
    if (!evidence.length) continue;
    const assessment = assessConcept(evidence, new Date().toISOString());
    if (assessment.confidence < (filters.minConfidence ?? 0)) continue;
    const validJobs = [...new Set(evidence.map(e => e.jobId))];
    const history = await db.trendObservation.findMany({ where: { trendId: trend.id, signal: ASSESSMENT }, orderBy: { id: "asc" } });
    const historyCount = history.filter(row => {
      try { return validJobs.includes(JSON.parse(row.evidence ?? "null")?.jobId); } catch { return false; }
    }).length;
    result.push({ trendId: trend.id, concept, assessment, historyCount });
  }
  return result;
}
export async function loadFashionResearchPlan(scope: Partial<FashionScope>, db: FashionDatabase = prisma) {
  return planFashionResearch(await loadFashionKnowledge(scope, db));
}

export async function saveAtomicResearchReport(report: ResearchReport, options: { researchJobId?: number; capConfidenceToFinding?: boolean } = {}, db: FashionDatabase = prisma): Promise<number> {
  const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value) : null;
  const job = options.researchJobId !== undefined ? await db.researchJob.findUniqueOrThrow({ where: { id: options.researchJobId } }) : await db.researchJob.create({ data: { topic: report.topic, scope: report.scope, market: report.market, segment: report.segment, category: report.category, geography: report.geography, timeRange: report.timeRange, status: "running" } });
  if (job.status !== "running") throw new Error("Research persistence requires a running job");
  try {
    return await db.$transaction(async tx => {
      const claimed = await tx.researchJob.updateMany({ where: { id: job.id, status: "running" }, data: { status: "saving" } });
      if (claimed.count !== 1) throw new Error("Research job is already finalized");
      const sources = new Map<string, number>();
      for (const source of report.sources) {
        if (sources.has(source.url)) continue;
        const row = await tx.researchSource.create({ data: { researchJobId: job.id, title: source.title, url: source.url, sourceType: source.sourceType, publishedAt: date(source.publishedAt) } });
        sources.set(source.url, row.id);
      }
      const observations: { id: number; index: number }[] = [];
      for (const [index, finding] of report.findings.entries()) {
        const row = await tx.researchObservation.create({ data: { researchJobId: job.id, type: finding.type, subject: finding.subject, statement: finding.statement, evidence: finding.evidence,
          market: report.market, segment: report.segment, category: report.category,
          ...scoreResearchFinding(report, finding, options.capConfidenceToFinding === true),
          observedAt: date(report.asOf) ?? new Date(),
          sources: { create: [...new Set(finding.sourceUrls.map(url => sources.get(url)).filter((id): id is number => id !== undefined))].map(researchSourceId => ({ researchSourceId })) } } });
        observations.push({ id: row.id, index });
      }
      await tx.researchObservation.create({ data: { researchJobId: job.id, type: "research_limitations_v1", subject: report.topic, statement: "Limitations required to interpret this research run", evidence: JSON.stringify({ uncertainties: report.uncertainties }), confidence: 0 } });
      await persistFashionConcepts(tx, report, job.id, observations, sources);
      await tx.researchJob.update({ where: { id: job.id }, data: { summary: report.summary, asOf: date(report.asOf), timeRange: report.timeRange, status: "completed", completedAt: new Date() } });
      return job.id;
    }, { maxWait: 10000, timeout: 60000 });
  } catch {
    await db.researchJob.updateMany({ where: { id: job.id, status: "running" }, data: { status: "failed", completedAt: new Date() } }).catch(() => undefined);
    throw new Error("Research persistence failed; completion unconfirmed. Partial transactional writes are rolled back on failure; inspect job status before retrying. Run may remain incomplete if failure marking was unavailable.");
  }
}
