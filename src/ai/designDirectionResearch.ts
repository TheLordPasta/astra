import { runInstagramVisualResearch, liveVisualDependencies } from "./instagramVisualResearch.js";
import type { VisualResearchArguments, VisualResearchDependencies } from "./instagramVisualResearch.js";
import { summarizeDesignDirections } from "./designDirections.js";
import { createVisualResearchMemory } from "./researchVisualMemory.js";
import { addVisualConceptClaims, prepareConceptFindings, prepareFashionResearch, recordFashionPlan, selectMemoryAwarePosts, summarizePlan } from "./fashionResearchPlanning.js";
import type { PlanLoader } from "./fashionResearchPlanning.js";

export async function runDesignDirectionResearch(args: VisualResearchArguments, deps?: VisualResearchDependencies, loadPlan?: PlanLoader) {
  // Lookup failure aborts before Meta/vision calls: unavailable memory is not empty memory.
  const plan = await prepareFashionResearch({ market: args.market, segment: args.segment, category: args.category, geography: args.geography }, loadPlan);
  const memory = deps ? null : createVisualResearchMemory();
  const result = await runInstagramVisualResearch(args, {
    ...(deps ?? { ...liveVisualDependencies, analyze: memory!.analyze }),
    select: posts => selectMemoryAwarePosts(posts, plan),
  });
  const visualReuse = memory?.appendToReport(result.report) ?? null;
  const designSynthesis = summarizeDesignDirections(result.posts);
  result.report.summary += ` ${designSynthesis.summary}`;
  for (const direction of designSynthesis.directions) {
    result.report.findings.push({ type: "market_signal", subject: direction.name,
      statement: direction.statement, evidence: JSON.stringify({ ...direction,
        fashionConcept: { name: direction.name, kind: "compound_direction", stance: "support", measurement: null } }),
      confidence: direction.confidence, sourceUrls: direction.evidence.map(e => e.url) });
  }
  result.report.uncertainties.push(...designSynthesis.unavailableMetrics,
    "Compound design directions are proposed interpretations of visible co-occurrence, not approved lessons or forecasts.");
  addVisualConceptClaims(result.report, result.posts);
  result.report = prepareConceptFindings(result.report, plan);
  recordFashionPlan(result.report, plan);
  // Classroom adapter saves this report through the existing atomic concept/history path.
  return { ...result, designSynthesis, visualReuse, memoryPlan: summarizePlan(plan) };
}
