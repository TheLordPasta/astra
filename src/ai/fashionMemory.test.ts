import assert from "node:assert/strict";
import { test } from "node:test";
import { assessConcept, canonicalEvidenceUrl, conceptIdentity, createEvidence, claimFromFinding, EvidenceSchema, parseStored } from "./fashionMemory.js";
import type { ConceptClaim, FashionScope } from "./fashionMemory.js";
import type { ResearchReport } from "./mushMushResearch.js";
import type { FashionDatabase } from "../db/fashionMemory.js";

// No live database, provider, or model calls in these tests.
process.env.SUPABASE_DATABASE_URL = "postgresql://offline:offline@127.0.0.1:1/offline";
const { saveAtomicResearchReport, loadFashionKnowledge, loadFashionResearchPlan } = await import("../db/fashionMemory.js");
const { scoreResearchFinding } = await import("./researchMemory.js");
const scope: FashionScope = { market: "Bridal", segment: "designers", category: "dresses", geography: "Israel" };
const claim: ConceptClaim = { name: "A-line", kind: "silhouette", stance: "support" };
function report(url = "https://a.example/design", stance: ConceptClaim["stance"] = "support"): ResearchReport {
  return { topic: "fashion fixture", scope: "bounded", ...scope, timeRange: "2025-01", asOf: "2025-04-01T00:00:00Z", summary: "proposed only", uncertainties: ["limited sample"],
    sources: [{ title: "design", url, sourceType: "designer", publishedAt: "2025-01-10T00:00:00Z" }],
    findings: [{ type: "trend", subject: "A-line", statement: `source ${stance}`, evidence: JSON.stringify({ fashionConcept: { ...claim, stance } }), confidence: 0.6, sourceUrls: [url] }] };
}
function evidence(url: string, overrides: Partial<ConceptClaim> = {}) {
  const r = report(url);
  return createEvidence({ claim: { ...claim, ...overrides }, scope, finding: r.findings[0]!, jobId: 1, observationId: 1,
    source: { ...r.sources[0]!, id: 1 }, asOf: r.asOf, limitations: r.uncertainties })!;
}
// Deliberately small transactional repository fake. It verifies calls/rollback, not PostgreSQL isolation.
type Row = Record<string, any>;
function fixture() {
  let state: Record<string, Row[]> = { jobs: [], sources: [], observations: [], trends: [], history: [] };
  let sequence = 0;
  let failAssessment = false;
  const matches = (r: Row, w: Row = {}): boolean => Object.entries(w).every(([k, v]) => {
    if (k === "AND") return v.every((clause: Row) => matches(r, clause));
    if (v && typeof v === "object") {
      if ("in" in v) return v.in.includes(r[k]);
      if ("startsWith" in v) return String(r[k]).startsWith(v.startsWith);
      if ("contains" in v) return String(r[k]).toLowerCase().includes(v.contains.toLowerCase());
    }
    return r[k] === v;
  });
  const table = (key: string) => ({
    create: async ({ data }: Row) => {
      if (failAssessment && data.signal === "fashion_assessment_v1") throw new Error("private driver detail");
      const row = { id: ++sequence, ...structuredClone(data) }; state[key]!.push(row); return structuredClone(row);
    },
    findMany: async ({ where, orderBy, take }: Row) => {
      let rows = state[key]!.filter(r => matches(r, where));
      if (orderBy?.id === "desc") rows = [...rows].reverse();
      return structuredClone(take ? rows.slice(0, take) : rows);
    },
    findFirst: async ({ where }: Row) => structuredClone(state[key]!.find(r => matches(r, where)) ?? null),
    findUniqueOrThrow: async ({ where }: Row) => {
      const row = state[key]!.find(r => matches(r, where)); if (!row) throw new Error("missing"); return structuredClone(row);
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = state[key]!.filter(r => matches(r, where)); for (const row of rows) Object.assign(row, data); return { count: rows.length };
    },
    update: async ({ where, data }: Row) => {
      const row = state[key]!.find(r => matches(r, where)); if (!row) throw new Error("missing"); Object.assign(row, data); return structuredClone(row);
    },
  });
  const tx = { researchJob: table("jobs"), researchSource: table("sources"), researchObservation: table("observations"), trend: table("trends"), trendObservation: table("history"), $executeRaw: async () => 1 };
  const db = { ...tx, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const before = structuredClone(state);
    try { return await fn(tx); } catch (error) { state = before; throw error; }
  } } as unknown as FashionDatabase;
  return { db, state: () => state, fail: () => { failAssessment = true; } };
}

test("concept identity normalizes known aliases and scope, without merging different concepts", () => {
  assert.equal(conceptIdentity(claim, scope), conceptIdentity({ ...claim, name: "A LINE SILHOUETTE" }, { ...scope, market: " bridal " }));
  assert.notEqual(conceptIdentity(claim, scope), conceptIdentity({ ...claim, kind: "motif" }, scope));
  assert.notEqual(conceptIdentity(claim, scope), conceptIdentity(claim, { ...scope, geography: "France" }));
});
test("canonical evidence strips tracking and unifies Instagram permalink variants", () => {
  assert.equal(canonicalEvidenceUrl("https://www.instagram.com/reel/ABC/?igsh=secret#top"), canonicalEvidenceUrl("https://instagram.com/p/ABC/"));
  assert.equal(canonicalEvidenceUrl("file:///private"), null);
  assert.equal(canonicalEvidenceUrl("https://user:secret@example.com/"), null);
});
test("malformed claims and stored records are ignored without parsing exceptions", () => {
  for (const raw of ["", "{", "null", "[]", '{"fashionConcept":{}}']) {
    assert.equal(claimFromFinding({ ...report().findings[0]!, evidence: raw }), null);
    assert.equal(parseStored(raw, EvidenceSchema), null);
  }
});
test("recent recurrence is not emerging without comparable temporal measurements", () => {
  const a = evidence("https://a.example/1"), b = evidence("https://b.example/2");
  assert.equal(assessConcept([a, b], "2025-04-01T00:00:00Z").status, "uncertain");
});
test("temporal measurements support cautious states and conflicts force uncertainty", () => {
  const measurement = (start: string, end: string, present: number) => ({ series: "same-designer-panel-v1", start, end, present, total: 20 });
  const a = evidence("https://a.example/1", { measurement: measurement("2025-01-01T00:00:00Z", "2025-02-01T00:00:00Z", 2) });
  const b = evidence("https://b.example/2", { measurement: measurement("2025-02-01T00:00:00Z", "2025-03-01T00:00:00Z", 10) });
  assert.equal(assessConcept([a, b], "2025-04-01T00:00:00Z").status, "increasing");
  assert.equal(assessConcept([{ ...a, measurement: { ...a.measurement!, present: 0 } }, b], "2025-04-01T00:00:00Z").status, "emerging");
  assert.equal(assessConcept([{ ...a, measurement: { ...a.measurement!, present: 18 } }, b], "2025-04-01T00:00:00Z").status, "declining");
  assert.equal(assessConcept([{ ...a, measurement: { ...a.measurement!, present: 10 } }, b], "2025-04-01T00:00:00Z").status, "stable");
  assert.equal(assessConcept([a, b, { ...b, key: "contradiction", stance: "contradict" }], "2025-04-01T00:00:00Z").status, "uncertain");
  assert.equal(assessConcept([a, b, { ...b, key: "conflict", measurement: { ...b.measurement!, present: 1 } }], "2025-04-01T00:00:00Z").status, "uncertain");
});
test("repeated/revised evidence has one vote while first observation is preserved", () => {
  const a = evidence("https://a.example/1");
  const result = assessConcept([a, { ...a, observedAt: "2025-02-01T00:00:00Z", stance: "contradict" }], "2025-04-01T00:00:00Z");
  assert.equal(result.supportingKeys.length, 0); assert.equal(result.contradictingKeys.length, 1);
  assert.equal(result.firstObserved, a.observedAt);
  assert.equal(assessConcept([a, a, a], "2025-04-01T00:00:00Z").confidence, assessConcept([a], "2025-04-01T00:00:00Z").confidence);
});
test("same concept in separate runs retains source links and distinct evidence in existing tables", async () => {
  const f = fixture();
  await saveAtomicResearchReport(report(), {}, f.db);
  await saveAtomicResearchReport(report("https://b.example/design"), {}, f.db);
  const known = await loadFashionKnowledge(scope, f.db);
  assert.equal(f.state().trends!.length, 1); assert.equal(known.length, 1);
  assert.equal(known[0]!.assessment.supportingKeys.length, 2); assert.equal(known[0]!.historyCount, 2);
  assert.ok(known[0]!.assessment.evidence.every(e => e.sourceId && e.observationId && e.jobId));
});
test("duplicate evidence across runs adds no vote or artificial confidence/history", async () => {
  const f = fixture();
  await saveAtomicResearchReport(report(), {}, f.db);
  const before = await loadFashionKnowledge({}, f.db);
  await saveAtomicResearchReport(report("https://www.a.example/design/?utm_source=new"), {}, f.db);
  const after = await loadFashionKnowledge({}, f.db);
  assert.equal(after[0]!.assessment.supportingKeys.length, 1);
  assert.equal(after[0]!.assessment.confidence, before[0]!.assessment.confidence);
  assert.equal(after[0]!.historyCount, 1); assert.equal(f.state().jobs!.length, 2);
});
test("contradiction appends a new assessment while preserving earlier evidence/history", async () => {
  const f = fixture();
  await saveAtomicResearchReport(report(), {}, f.db);
  const original = JSON.stringify(f.state().history![1]);
  await saveAtomicResearchReport(report("https://a.example/design", "contradict"), {}, f.db);
  const known = await loadFashionKnowledge({}, f.db);
  assert.equal(known[0]!.historyCount, 2); assert.equal(known[0]!.assessment.contradictingKeys.length, 1);
  assert.equal(known[0]!.assessment.supportingKeys.length, 0); assert.equal(JSON.stringify(f.state().history![1]), original);
});
test("trend state changes across runs and previous assessments remain immutable", async () => {
  const f = fixture();
  const first = report(), second = report("https://b.example/design");
  first.findings[0]!.evidence = JSON.stringify({ fashionConcept: { ...claim, measurement: { series: "fixed-panel", start: "2025-01-01T00:00:00Z", end: "2025-02-01T00:00:00Z", present: 2, total: 20 } } });
  second.findings[0]!.evidence = JSON.stringify({ fashionConcept: { ...claim, measurement: { series: "fixed-panel", start: "2025-02-01T00:00:00Z", end: "2025-03-01T00:00:00Z", present: 12, total: 20 } } });
  await saveAtomicResearchReport(first, {}, f.db);
  assert.equal((await loadFashionKnowledge({}, f.db))[0]!.assessment.status, "uncertain");
  await saveAtomicResearchReport(second, {}, f.db);
  assert.equal((await loadFashionKnowledge({}, f.db))[0]!.assessment.status, "increasing");
  const assessments = f.state().history!.filter(h => h.signal === "fashion_assessment_v1").map(h => JSON.parse(h.evidence).status);
  assert.deepEqual(assessments, ["uncertain", "increasing"]);
});
test("failed/incomplete jobs never contribute trusted concept evidence", async () => {
  for (const status of ["failed", "running", "saving"]) {
    const f = fixture(); await saveAtomicResearchReport(report(), {}, f.db);
    f.state().jobs![0]!.status = status;
    assert.deepEqual(await loadFashionKnowledge({}, f.db), []);
  }
});
test("transaction failure rolls back report and concepts but retains a failed job", async () => {
  const f = fixture(); f.fail();
  await assert.rejects(saveAtomicResearchReport(report(), {}, f.db), error => {
    assert.match(String(error), /completion unconfirmed/); assert.doesNotMatch(String(error), /private driver/); return true;
  });
  assert.equal(f.state().jobs![0]!.status, "failed");
  for (const key of ["sources", "observations", "trends", "history"]) assert.equal(f.state()[key]!.length, 0);
});
test("planning retrieves existing concepts and flags stale/weak/conflicting evidence", async () => {
  const f = fixture(); await saveAtomicResearchReport(report("https://a.example/design", "contradict"), {}, f.db);
  const plan = await loadFashionResearchPlan(scope, f.db);
  assert.equal(plan.authority, "revisable_research_not_human_lesson"); assert.equal(plan.known.length, 1);
  assert.deepEqual(plan.priorities[0]!.reasons, ["stale", "weak", "conflicting", "missing_comparable_temporal_evidence"]);
  assert.equal((await loadFashionResearchPlan({ geography: "France" }, f.db)).known.length, 0);
});
test("atomic saving preserves legacy scores, visual ceiling and report uncertainties", async () => {
  const f = fixture(), r = report(); r.findings[0]!.confidence = 0.2;
  await saveAtomicResearchReport(r, { capConfidenceToFinding: true }, f.db);
  const stored = f.state().observations![0]!;
  const expected = scoreResearchFinding(r, r.findings[0]!, true);
  for (const [key, value] of Object.entries(expected)) assert.equal(stored[key], value);
  assert.equal(stored.confidence, 0.2);
  assert.ok(scoreResearchFinding(r, r.findings[0]!, false).confidence > 0.2);
  assert.deepEqual(JSON.parse(f.state().observations![1]!.evidence).uncertainties, ["limited sample"]);
});
test("source-free claims and future evidence do not create learned concepts", async () => {
  const f = fixture(), r = report(); r.findings[0]!.sourceUrls = [];
  await saveAtomicResearchReport(r, {}, f.db); assert.equal(f.state().trends!.length, 0);
  const future = report(); future.sources[0]!.publishedAt = "2099-01-01T00:00:00Z";
  await saveAtomicResearchReport(future, {}, f.db); assert.equal(f.state().trends!.length, 0);
});
