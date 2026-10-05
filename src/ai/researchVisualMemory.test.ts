import test from "node:test";
import assert from "node:assert/strict";
import { createVisualResearchMemory, visualContentKey } from "./researchVisualMemory.js";
import type { DressAnalysis } from "./instagramVisualResearch.js";
import type { ResearchReport } from "./mushMushResearch.js";

const image = (text: string) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`;
const analysis: DressAnalysis = { garmentVisible: true, confidence: 0.8,
  visibleFacts: { silhouette: "column", neckline: null, sleeves: null, colors: [], lace: null, transparency: null, embellishments: [] },
  visibleTags: ["column"], fabricHypotheses: [], limitations: ["fixture"] };
function report(): ResearchReport {
  return { topic: "test", scope: "test", market: "bridal", segment: "designers", category: "lace", geography: "Israel",
    timeRange: "test", asOf: "2025-01-01T00:00:00Z", summary: "", uncertainties: [], sources: [], findings: [] };
}
function harness() {
  const records = new Map<string, { id: number; evidence: string | null }>();
  let calls = 0, downloads = 0;
  const deps = { model: "fixture-model", now: () => new Date("2025-01-01T00:00:00Z"),
    store: { find: async (subject: string) => records.get(subject) ?? null },
    load: async (_url: string) => { downloads++; return image("same"); },
    analyze: async (urls: string[], load: (url: string) => Promise<string>) => {
      calls++; for (const url of urls) assert.equal(await load(url), image("same"));
      return structuredClone(analysis);
    } };
  return { records, deps, calls: () => calls, downloads: () => downloads,
    persist: (value: ResearchReport) => { for (const f of value.findings) if (f.subject.startsWith("visual-content:")) records.set(f.subject, { id: records.size + 1, evidence: f.evidence }); } };
}
test("fresh analysis consumes hashed bytes once and stores no source URL or raw bytes", async () => {
  const h = harness(), memory = createVisualResearchMemory(h.deps);
  await memory.analyze(["https://cdn.example/a?secret=fixture"]);
  const r = report(), audit = memory.appendToReport(r);
  assert.equal(h.calls(), 1); assert.equal(h.downloads(), 1); assert.equal(audit.freshAnalyses, 1);
  assert.ok(!JSON.stringify(r).includes("secret=fixture"));
  assert.ok(!JSON.stringify(r).includes(image("same")));
  assert.equal(r.findings[0]!.confidence, 0);
});
test("future run reuses persisted content despite changed CDN URL", async () => {
  const h = harness(), first = createVisualResearchMemory(h.deps);
  await first.analyze(["https://cdn.example/old"]);
  const r = report(); first.appendToReport(r); h.persist(r);
  const second = createVisualResearchMemory(h.deps);
  assert.deepEqual(await second.analyze(["https://cdn.example/new"]), analysis);
  const audit = second.appendToReport(report());
  assert.equal(h.calls(), 1); assert.equal(h.downloads(), 2);
  assert.equal(audit.storedReuses, 1); assert.equal(audit.events[0]!.observationId, 1);
});
test("same-run identical content coalesces concurrent calls and returns defensive copies", async () => {
  const h = harness(), memory = createVisualResearchMemory(h.deps);
  const [a,b] = await Promise.all([memory.analyze(["https://x/a"]), memory.analyze(["https://x/b"])]);
  a.visibleTags.length = 0;
  assert.deepEqual(b.visibleTags, ["column"]); assert.equal(h.calls(), 1);
  assert.equal(memory.appendToReport(report()).sameRunReuses, 1);
});
test("changed bytes at same URL require fresh analysis", async () => {
  const h = harness(); let bytes = image("same"), calls = 0;
  const memory = createVisualResearchMemory({ ...h.deps, load: async () => bytes, analyze: async () => { calls++; return analysis; } });
  await memory.analyze(["https://x/a"]); bytes = image("changed"); await memory.analyze(["https://x/a"]);
  assert.equal(calls, 2);
});
test("model, contract version, image count and ordering participate in the content key", () => {
  const base = visualContentKey([image("a")], "m");
  assert.notEqual(base, visualContentKey([image("a")], "n"));
  assert.notEqual(base, visualContentKey([image("a")], "m", "next"));
  assert.notEqual(base, visualContentKey([image("a"),image("b")], "m"));
  assert.notEqual(visualContentKey([image("a"),image("b")], "m"), visualContentKey([image("b"),image("a")], "m"));
  assert.throws(() => visualContentKey(["https://x/a"], "m"));
});
test("lookup failure prevents paid fallback and sanitizes provider details", async () => {
  const h = harness(), memory = createVisualResearchMemory({ ...h.deps, store: { find: async () => { throw new Error("token=secret"); } } });
  await assert.rejects(memory.analyze(["https://x/a"]), e => e instanceof Error && !e.message.includes("secret"));
  assert.equal(h.calls(), 0); assert.equal(memory.appendToReport(report()).warnings.length, 1);
});
test("malformed, truncated and schema-invalid stored evidence cannot be reused", async () => {
  for (const evidence of ["", "{", "{}", "null"]) {
    const h = harness(), memory = createVisualResearchMemory({ ...h.deps, store: { find: async () => ({ id: 1, evidence }) } });
    await memory.analyze(["https://x/a"]); assert.equal(h.calls(), 1);
  }
});
test("failed vision results are not cached and can be retried explicitly", async () => {
  let calls = 0;
  const h = harness(), memory = createVisualResearchMemory({ ...h.deps, analyze: async () => { if (++calls === 1) throw new Error("secret"); return analysis; } });
  await assert.rejects(memory.analyze(["https://x/a"]));
  assert.equal(memory.appendToReport(report()).freshAnalyses, 0);
  await memory.analyze(["https://x/a"]); assert.equal(calls, 2);
});
test("unsaved report does not provide cross-run durability", async () => {
  const h = harness(); await createVisualResearchMemory(h.deps).analyze(["https://x/a"]);
  await createVisualResearchMemory(h.deps).analyze(["https://x/a"]); assert.equal(h.calls(), 2);
});
test("invalid input bounds and download failures never reach vision", async () => {
  const h = harness(), memory = createVisualResearchMemory({ ...h.deps, load: async () => { throw new Error("download unavailable"); } });
  await assert.rejects(memory.analyze([])); await assert.rejects(memory.analyze(["a","b","c"]));
  await assert.rejects(memory.analyze(["https://x/a"])); assert.equal(h.calls(), 0);
});
