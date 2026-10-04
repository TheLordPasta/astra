import { runInstagramVisualResearch, liveVisualDependencies } from "./instagramVisualResearch.js";
import type { VisualResearchArguments, VisualResearchDependencies } from "./instagramVisualResearch.js";
import { summarizeDesignDirections } from "./designDirections.js";
import { createVisualResearchMemory } from "./researchVisualMemory.js";

export async function runDesignDirectionResearch(args: VisualResearchArguments, deps?: VisualResearchDependencies) {
  // Explicit injected dependencies keep offline callers independent of live DB/API.
  // Production Classroom research always uses durable research-memory lookup.
  const memory = deps ? null : createVisualResearchMemory();
  const result = await runInstagramVisualResearch(args, deps ?? { ...liveVisualDependencies, analyze: memory!.analyze });
  const visualReuse = memory?.appendToReport(result.report) ?? null;
  const designSynthesis = summarizeDesignDirections(result.posts);
  result.report.summary += ` ${designSynthesis.summary}`;
  for (const direction of designSynthesis.directions) {
    result.report.findings.push({ type: "market_signal", subject: direction.name,
      statement: direction.statement, evidence: JSON.stringify(direction),
      confidence: direction.confidence, sourceUrls: direction.evidence.map(e => e.url) });
  }
  result.report.uncertainties.push(...designSynthesis.unavailableMetrics,
    "Compound design directions are proposed interpretations of visible co-occurrence, not approved lessons or forecasts.");
  return { ...result, designSynthesis, visualReuse };
}
