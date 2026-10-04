import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDesignDirections } from "./designDirections.js";
import { runDesignDirectionResearch } from "./designDirectionResearch.js";
import type { AnalyzedPost, DressAnalysis } from "./instagramVisualResearch.js";

const analysis: DressAnalysis = { garmentVisible: true, confidence: 0.8,
  visibleFacts: { silhouette: null, neckline: null, sleeves: null, colors: [], lace: "floral", transparency: "sheer", embellishments: [] },
  visibleTags: ["large-floral-lace", "sheer-panels"], fabricHypotheses: [], limitations: ["fixture"] };
function post(username: string, id = "1"): AnalyzedPost {
  return { username, id, caption: "", permalink: `https://www.instagram.com/p/${username}${id}/`,
    timestamp: "2025-01-01T00:00:00Z", likes: null, comments: null,
    engagement: { ageBucket: "30-plus-days", peerCount: 0, medianLikes: null, relativeLikes: null },
    sampleRole: "comparison", imagesAvailable: 1, imagesAnalyzed: 1, analysis, analysisError: null };
}
test("abstains with empty data and one account", () => {
  assert.equal(summarizeDesignDirections([]).directions.length, 0);
  assert.equal(summarizeDesignDirections([post("a"), post("a", "2")]).directions.length, 0);
});
test("compound features require co-occurrence, not separate garments", () => {
  const a = post("a"), b = post("b");
  a.analysis = { ...analysis, visibleTags: ["large-floral-lace"] };
  b.analysis = { ...analysis, visibleTags: ["sheer-panels"] };
  assert.equal(summarizeDesignDirections([a, b]).directions.length, 0);
});
test("deduplicates rows and account casing; excludes failed and low-quality analyses", () => {
  const a = post("a"), b = post("b");
  b.analysis = null;
  assert.equal(summarizeDesignDirections([a, a, post("A"), b]).directions.length, 0);
  b.analysis = { ...analysis, confidence: 0.2 };
  assert.equal(summarizeDesignDirections([a, b]).directions.length, 0);
});
test("reports source-backed directions and negative comparison evidence, not forecasts", () => {
  const c = post("c"); c.analysis = { ...analysis, visibleTags: ["opaque"] };
  const result = summarizeDesignDirections([post("a"), post("b"), c]);
  const d = result.directions[0]!;
  assert.equal(d.name, "Botanical transparency");
  assert.equal(d.status, "proposed"); assert.equal(d.distinctAccounts, 2);
  assert.equal(d.comparison.analyzed, 3); assert.equal(d.comparison.supporting, 2);
  assert.deepEqual(d.comparison.withoutDirection, [c.permalink]);
  assert.equal(d.evidence[0]!.relativeLikes, null);
  assert.equal(d.forecast.status, "insufficient_evidence");
  assert.ok(d.confidence <= 0.6); assert.equal(d.evidence.length, 2);
});
test("hypotheses do not become visible direction evidence", () => {
  const a = post("a"), b = post("b");
  for (const p of [a,b]) p.analysis = { ...analysis, visibleTags: [], fabricHypotheses: [{ material: "floral lace", visualBasis: "uncertain", confidence: 0.9 }] };
  assert.equal(summarizeDesignDirections([a,b]).directions.length, 0);
});
test("research wrapper retains original signals and persists direction evidence in existing report", async () => {
  const result = await runDesignDirectionResearch({ usernames: ["a", "b"], market: "bridal", segment: "designers", category: "lace", geography: "Israel", since: "2025-01-01T00:00:00Z", until: "2025-01-31T00:00:00Z" }, {
    now: () => new Date("2025-02-01T00:00:00Z"), analyze: async () => analysis,
    collect: async username => { const { id, caption, permalink, timestamp, likes, comments } = post(username);
      return { posts: [{ username, id, caption, permalink, timestamp, likes, comments, images: ["https://example.com/a.jpg"] }], scanned: 1, retrievedAt: "2025-02-01T00:00:00Z", limitations: [] }; },
  });
  assert.ok(result.candidates.length > 0);
  assert.equal(result.designSynthesis.directions.length, 1);
  const finding = result.report.findings.find(f => f.subject === "Botanical transparency")!;
  assert.equal(finding.type, "market_signal"); assert.equal(finding.sourceUrls.length, 2);
  assert.equal(JSON.parse(finding.evidence!).status, "proposed");
});
