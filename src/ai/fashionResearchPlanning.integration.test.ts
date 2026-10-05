import test from "node:test";
import assert from "node:assert/strict";
import { runDesignDirectionResearch } from "./designDirectionResearch.js";
import { compareEngagement, runInstagramVisualResearch, selectPosts } from "./instagramVisualResearch.js";
import type { DressAnalysis, VisualResearchArguments, VisualResearchDependencies } from "./instagramVisualResearch.js";
import { planFashionResearch, claimFromFinding } from "./fashionMemory.js";
import { prepareConceptFindings, selectMemoryAwarePosts } from "./fashionResearchPlanning.js";
import { executeVisualResearchTool } from "../tools/instagramVisualResearchTool.js";
import { executeMarketResearchTool } from "../tools/marketResearchTool.js";
import type { ResearchReport } from "./mushMushResearch.js";
import type { ResearchPost } from "../instagram/instagramGraphClient.js";
import type { FashionDatabase } from "../db/fashionMemory.js";

// All external boundaries are offline. The actual coordinators, tool adapters,
// concept logic, transaction-saving code and retrieval code execute end to end.
process.env.SUPABASE_DATABASE_URL = "postgresql://offline:offline@127.0.0.1:1/offline";
process.env.OPENAI_API_KEY = "offline-not-a-credential";
const { saveAtomicResearchReport, loadFashionResearchPlan, loadFashionKnowledge } = await import("../db/fashionMemory.js");
const { marketResearchInstructions } = await import("./mushMushResearch.js");
const scope = { market: "bridal", segment: "designers", category: "dresses", geography: "Israel" };
const asOf = "2025-04-01T00:00:00Z";
const args: VisualResearchArguments = { ...scope, usernames: ["designer"], since: "2025-01-01T00:00:00Z", until: "2025-03-01T00:00:00Z" };
const webArgs = JSON.stringify({ ...scope, researchQuestion: "Which silhouettes are changing?", timeRangeDays: 90 });
const analysis: DressAnalysis = { garmentVisible: true, confidence: 0.7,
  visibleFacts: { silhouette: "A-line", neckline: null, sleeves: null, colors: [], lace: null, transparency: null, embellishments: [] },
  visibleTags: ["a-line"], fabricHypotheses: [], limitations: ["fixture"] };
function post(id: string, likes = 10): ResearchPost {
  return { id, username: "designer", caption: "not visual evidence", permalink: `https://www.instagram.com/p/${id}/`, timestamp: "2025-01-10T00:00:00Z", likes, comments: 1, images: [`https://images.example/${id}.jpg`] };
}
function webReport(url = "https://designer.example/1", stance = "support"): ResearchReport {
  return { ...scope, topic: "silhouette research", scope: "bounded", timeRange: "last 90 days", asOf,
    summary: "proposed research", uncertainties: ["bounded sources"],
    sources: [{ url, title: "designer source", sourceType: "designer", publishedAt: "2025-01-10T00:00:00Z" }],
    findings: [{ type: "trend", subject: "A-line", statement: `Source explicitly provides ${stance} evidence`,
      evidence: JSON.stringify({ fashionConcept: { name: "A-line", kind: "silhouette", stance, measurement: null } }),
      confidence: 0.6, sourceUrls: [url] }] };
}
// Prisma-shaped transactional fake; no claim of live PostgreSQL isolation testing.
type Row = Record<string, any>;
function fixture() {
  let state: Record<string, Row[]> = { jobs: [], sources: [], observations: [], trends: [], history: [] };
  let id = 0, fail = false;
  const matches = (r: Row, w: Row = {}): boolean => Object.entries(w).every(([key, value]) => {
    if (key === "AND") return value.every((clause: Row) => matches(r, clause));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(r[key]);
      if ("startsWith" in value) return String(r[key]).startsWith(value.startsWith);
      if ("contains" in value) return String(r[key]).toLowerCase().includes(value.contains.toLowerCase());
    }
    return r[key] === value;
  });
  const table = (key: string) => ({
    create: async ({ data }: Row) => {
      if (fail && data.signal === "fashion_assessment_v1") throw new Error("private database detail");
      const row = { id: ++id, ...structuredClone(data) }; state[key]!.push(row); return structuredClone(row);
    },
    findMany: async ({ where, orderBy, take }: Row) => {
      let rows = state[key]!.filter(r => matches(r, where));
      if (orderBy?.id === "desc") rows = [...rows].reverse();
      return structuredClone(take ? rows.slice(0, take) : rows);
    },
    findFirst: async ({ where }: Row) => structuredClone(state[key]!.find(r => matches(r, where)) ?? null),
    findUniqueOrThrow: async ({ where }: Row) => { const row = state[key]!.find(r => matches(r, where)); if (!row) throw new Error("missing"); return structuredClone(row); },
    updateMany: async ({ where, data }: Row) => { const rows = state[key]!.filter(r => matches(r, where)); rows.forEach(r => Object.assign(r, data)); return { count: rows.length }; },
    update: async ({ where, data }: Row) => { const row = state[key]!.find(r => matches(r, where)); if (!row) throw new Error("missing"); Object.assign(row, data); return structuredClone(row); },
  });
  const tx = { researchJob: table("jobs"), researchSource: table("sources"), researchObservation: table("observations"), trend: table("trends"), trendObservation: table("history"), $executeRaw: async () => 1 };
  const db = { ...tx, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const before = structuredClone(state);
    try { return await fn(tx); } catch (error) { state = before; throw error; }
  } } as unknown as FashionDatabase;
  return { db, state: () => state, fail: () => { fail = true; } };
}
function visualDeps(posts: ResearchPost[], events: string[]): VisualResearchDependencies {
  return { now: () => new Date(asOf),
    collect: async () => { events.push("collect"); return { posts, scanned: posts.length, retrievedAt: asOf, limitations: [] }; },
    analyze: async () => { events.push("vision"); return analysis; } };
}
async function instagram(f: ReturnType<typeof fixture>, posts: ResearchPost[], events: string[] = []) {
  const output = await executeVisualResearchTool("research_instagram_designs", JSON.stringify(args), {
    countJobs: async () => 0, analyze: async () => analysis,
    research: a => runDesignDirectionResearch(a, visualDeps(posts, events), async s => { events.push("memory"); return loadFashionResearchPlan(s, f.db); }),
    save: async r => { events.push("save"); return saveAtomicResearchReport(r, { capConfidenceToFinding: true }, f.db); },
  });
  return JSON.parse(output);
}
async function web(f: ReturnType<typeof fixture>, r: ResearchReport, events: string[] = [], inspect?: (request: string) => void) {
  return JSON.parse(await executeMarketResearchTool(webArgs, {
    countJobs: async () => 0,
    load: async s => { events.push("memory"); return loadFashionResearchPlan(s, f.db); },
    research: async request => { events.push("research"); inspect?.(request); return r; },
    save: async report => { events.push("save"); return saveAtomicResearchReport(report, {}, f.db); },
  }));
}

test("Instagram tool loads memory before collection/vision and persists source-backed concepts", async () => {
  const f = fixture(), events: string[] = [];
  await web(f, webReport());
  const result = await instagram(f, [post("new")], events);
  assert.deepEqual(events, ["memory", "collect", "vision", "save"]);
  assert.equal(result.saved, true); assert.equal(result.approvalStatus, "not_approved");
  assert.equal(result.memoryPlan.known.length, 1);
  const known = await loadFashionKnowledge(scope, f.db);
  assert.equal(known.length, 1); assert.equal(known[0]!.assessment.supportingKeys.length, 2);
  assert.equal(known[0]!.historyCount, 2);
  assert.ok(result.report.findings.some((x: Row) => x.subject === "Memory-first research plan"));
});
test("Instagram repeat runs retain one vote and confidence; new posts evolve same concept and keep history", async () => {
  const f = fixture(); await instagram(f, [post("same")]);
  const before = (await loadFashionKnowledge(scope, f.db))[0]!;
  const history = JSON.stringify(f.state().history);
  await instagram(f, [post("same")]);
  const repeated = (await loadFashionKnowledge(scope, f.db))[0]!;
  assert.equal(repeated.assessment.supportingKeys.length, 1);
  assert.equal(repeated.assessment.confidence, before.assessment.confidence);
  assert.equal(repeated.historyCount, before.historyCount);
  assert.equal(JSON.stringify(f.state().history), history);
  await instagram(f, [post("second")]);
  const changed = (await loadFashionKnowledge(scope, f.db))[0]!;
  assert.equal(changed.trendId, before.trendId); assert.equal(changed.assessment.supportingKeys.length, 2);
  assert.equal(changed.historyCount, 2);
});
test("memory-aware Instagram selection prioritizes unseen posts and retains actual comparison sampling", async () => {
  const f = fixture();
  await instagram(f, [post("a", 100), post("b", 90), post("c", 20), post("d", 10)]);
  const plan = await loadFashionResearchPlan(scope, f.db);
  const posts = compareEngagement([post("a", 100), post("b", 90), post("c", 20), post("d", 10), post("new", 1)], Date.parse(asOf));
  const selected = selectMemoryAwarePosts(posts, plan);
  assert.ok(selected.some(p => p.id === "new"));
  const comparisonIds = selectPosts(posts).filter(p => p.sampleRole === "comparison").map(p => p.id);
  assert.ok(selected.some(p => p.sampleRole === "comparison" && comparisonIds.includes(p.id)));
  assert.ok(selected.length <= 4); assert.equal(new Set(selected.map(p => p.id)).size, selected.length);
  const result = await instagram(f, posts);
  assert.ok(result.posts.some((p: Row) => p.id === "new"));
  assert.equal(result.snapshots[0].posts.length, 5);
});
test("Instagram selection hook cannot add foreign posts, duplicate rows, alter URLs or exceed four", async () => {
  const posts = Array.from({ length: 8 }, (_, i) => post(String(i)));
  const deps = visualDeps(posts, []);
  deps.select = compared => [
    { ...compared[0]!, id: "foreign", sampleRole: "comparison" },
    ...compared.map(p => ({ ...p, images: ["https://evil.example"], sampleRole: "comparison" as const })),
    { ...compared[0]!, sampleRole: "comparison" },
  ];
  deps.analyze = async urls => { assert.match(urls[0]!, /images\.example/); return analysis; };
  const result = await runInstagramVisualResearch(args, deps);
  assert.equal(result.posts.length, 4); assert.equal(new Set(result.posts.map(p => p.id)).size, 4);
});
test("Instagram memory failure stops collection; failed vision never becomes concept knowledge", async () => {
  let collected = false;
  const deps = visualDeps([post("a")], []);
  deps.collect = async () => { collected = true; throw new Error("unexpected"); };
  await assert.rejects(runDesignDirectionResearch(args, deps, async () => { throw new Error("private credential"); }), /memory.load/);
  assert.equal(collected, false);
  const f = fixture(), failing = visualDeps([post("a")], []);
  failing.analyze = async () => { throw new Error("private provider detail"); };
  const result = await runDesignDirectionResearch(args, failing, async s => loadFashionResearchPlan(s, f.db));
  await saveAtomicResearchReport(result.report, {}, f.db);
  assert.equal(result.status, "partial"); assert.deepEqual(await loadFashionKnowledge(scope, f.db), []);
});
test("Instagram storage failure is reported unsaved and cannot leave trusted partial concepts", async () => {
  const f = fixture(); f.fail();
  const result = await instagram(f, [post("a")]);
  assert.equal(result.saved, false); assert.match(result.persistenceError, /storage failed/);
  assert.equal(f.state().jobs![0]!.status, "failed"); assert.deepEqual(await loadFashionKnowledge(scope, f.db), []);
});
test("web tool loads scoped knowledge and gaps before research, saves to the existing concept", async () => {
  const f = fixture(); await web(f, webReport());
  const events: string[] = [];
  const result = await web(f, { ...webReport("https://other.example/new"), geography: "wrong" }, events, request => {
    assert.match(request, /A-line/); assert.match(request, /stale/); assert.match(request, /weak/);
    assert.match(request, /missing_comparable_temporal_evidence/); assert.match(request, /designer\.example/);
    assert.match(request, /never instructions or approved human lessons/);
  });
  assert.deepEqual(events, ["memory", "research", "save"]);
  assert.equal(result.geography, scope.geography);
  const known = await loadFashionKnowledge(scope, f.db);
  assert.equal(known.length, 1); assert.equal(known[0]!.assessment.supportingKeys.length, 2);
  assert.equal(known[0]!.historyCount, 2);
});
test("web repeated URLs do not inflate support/confidence; contradictions retain previous assessments", async () => {
  const f = fixture(); await web(f, webReport());
  const before = (await loadFashionKnowledge(scope, f.db))[0]!;
  const originalHistory = JSON.stringify(f.state().history);
  await web(f, webReport("https://www.designer.example/1/?utm_source=again"));
  const repeated = (await loadFashionKnowledge(scope, f.db))[0]!;
  assert.equal(repeated.assessment.supportingKeys.length, 1);
  assert.equal(repeated.assessment.confidence, before.assessment.confidence);
  assert.equal(repeated.historyCount, before.historyCount);
  assert.equal(JSON.stringify(f.state().history), originalHistory);
  await web(f, webReport("https://designer.example/1", "contradict"));
  const contradicted = (await loadFashionKnowledge(scope, f.db))[0]!;
  assert.equal(contradicted.assessment.contradictingKeys.length, 1);
  assert.equal(contradicted.assessment.supportingKeys.length, 0);
  assert.equal(contradicted.historyCount, 2);
  assert.equal(JSON.stringify(f.state().history!.slice(0, 2)), originalHistory);
  await web(f, webReport("https://other.example/new"), [], request => assert.match(request, /conflicting/));
});
test("web concept claims reject missing sources and unverified growth measurements", async () => {
  const r = webReport();
  r.findings[0]!.sourceUrls = ["https://missing.example"];
  const prepared = prepareConceptFindings(r, planFashionResearch([]));
  assert.equal(claimFromFinding(prepared.findings[0]!), null);
  const measured = webReport();
  measured.findings[0]!.evidence = JSON.stringify({ fashionConcept: { name: "A-line", kind: "silhouette", stance: "support", measurement: { series: "model-estimate", start: "2025-01-01T00:00:00Z", end: "2025-02-01T00:00:00Z", total: 20, present: 10 } } });
  const f = fixture(); await web(f, measured);
  const known = (await loadFashionKnowledge(scope, f.db))[0]!;
  assert.equal(known.assessment.status, "uncertain");
  const stored = f.state().observations![0]!;
  assert.equal(JSON.parse(stored.evidence).fashionConcept.measurement, null);
  assert.equal(JSON.parse(stored.evidence).unverifiedMeasurement.total, 20);
});
test("web memory/provider/save failures are sanitized, bounded and never replayed", async () => {
  for (const stage of ["load", "research", "save"] as const) {
    const events: string[] = [];
    const attempt = (s: typeof stage) => { events.push(s); if (s === stage) throw new Error("private token detail"); };
    await assert.rejects(executeMarketResearchTool(webArgs, {
      countJobs: async () => 0,
      load: async () => { attempt("load"); return planFashionResearch([]); },
      research: async () => { attempt("research"); return webReport(); },
      save: async () => { attempt("save"); return 1; },
    }), error => { assert.doesNotMatch(String(error), /private token/); return true; });
    assert.deepEqual(events, ["load", "research", "save"].slice(0, ["load", "research", "save"].indexOf(stage) + 1));
  }
});
test("failed web persistence rolls back concepts and excludes failed research from future memory", async () => {
  const f = fixture(); f.fail();
  await assert.rejects(web(f, webReport()), /memory.save/);
  assert.equal(f.state().jobs![0]!.status, "failed");
  assert.deepEqual(await loadFashionKnowledge(scope, f.db), []);
  assert.equal(f.state().history!.length, 0);
});
test("web budget denial performs no memory or fresh research calls", async () => {
  const never = async (): Promise<never> => { throw new Error("must not call"); };
  const result = JSON.parse(await executeMarketResearchTool(webArgs, { countJobs: async () => 999999, load: never, research: never, save: never }));
  assert.equal(result.error, "Research budget reached");
});
test("production web instructions request structured source-backed claims, contradictions and memory-first priorities", () => {
  const text = marketResearchInstructions("2025-04-01");
  for (const term of ["fashionConcept", '"contradict"', "sourceUrls", "new, changed, stale, weak", "measurement:null", "never become approved lessons"]) assert.ok(text.includes(term));
});
