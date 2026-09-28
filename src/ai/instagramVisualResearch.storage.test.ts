import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResearchReport } from "./mushMushResearch.js";
import type { ResearchReportStore } from "./researchMemory.js";

// Only injected repository methods are used. Never connect to a configured live database.
process.env.SUPABASE_DATABASE_URL = "postgresql://offline:offline@127.0.0.1:1/offline";
const { saveResearchReport, researchConfidence } = await import("./researchMemory.js");
const report: ResearchReport = {
  topic: "visual fixture", scope: "bounded fixture", market: "bridal", segment: "designers", category: "dresses", geography: "Israel",
  timeRange: "2025-01", asOf: "2025-01-20T00:00:00Z", summary: "proposed signal", uncertainties: ["not a market fact"],
  sources: [{ title: "post", url: "https://www.instagram.com/p/fixture/", sourceType: "social", publishedAt: "2025-01-10T00:00:00Z" }],
  findings: [{ type: "market_signal", subject: "a-line", statement: "proposed", evidence: '{"status":"proposed","limitations":["not a market fact"]}', confidence: 0.2,
    sourceUrls: ["https://www.instagram.com/p/fixture/", "https://www.instagram.com/p/fixture/"] }],
};
const fixtureStore: ResearchReportStore = {
  createResearchJob: async () => ({ id: 10 }), addResearchSource: async () => ({ id: 20 }),
  addResearchObservation: async () => ({}), completeResearchJob: async () => ({}), failResearchJob: async () => ({}),
};

test("visual persistence caps confidence, deduplicates evidence links and completes existing job", async () => {
  const observations: Parameters<ResearchReportStore["addResearchObservation"]>[0][] = [];
  const statuses: string[] = [];
  const store: ResearchReportStore = { ...fixtureStore,
    addResearchObservation: async data => { observations.push(data); return {}; },
    completeResearchJob: async () => { statuses.push("completed"); },
    failResearchJob: async () => { statuses.push("failed"); },
  };
  assert.equal(await saveResearchReport(report, { capConfidenceToFinding: true }, store), 10);
  assert.equal(observations[0]?.confidence, 0.2); assert.match(observations[0]!.evidence!, /proposed/);
  assert.deepEqual(observations[0]?.sourceIds, [20]); assert.deepEqual(statuses, ["completed"]);
});

test("storage failure marks research job failed without approving anything", async () => {
  const statuses: string[] = [];
  const store: ResearchReportStore = { ...fixtureStore,
    addResearchSource: async () => { throw new Error("fixture storage failure"); },
    failResearchJob: async () => { statuses.push("failed"); },
  };
  await assert.rejects(saveResearchReport(report, { capConfidenceToFinding: true }, store), /fixture storage failure/);
  assert.deepEqual(statuses, ["failed"]);
});

test("confidence ceiling is opt-in and cannot inflate model confidence", () => {
  assert.equal(researchConfidence(0.7, 0.2, false), 0.7);
  assert.equal(researchConfidence(0.7, 0.2, true), 0.2);
  assert.equal(researchConfidence(0.3, 0.9, true), 0.3);
  assert.equal(researchConfidence(0.7, 0, true), 0);
});
