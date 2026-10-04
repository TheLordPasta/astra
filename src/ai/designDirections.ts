import type { AnalyzedPost } from "./instagramVisualResearch.js";

// Interpretations of co-occurring visible features, not fabric identities or forecasts.
const directions = [
  { name: "Botanical transparency", groups: [["large-floral-lace", "small-floral-lace"], ["sheer-panels"]], interpretation: "Floral motifs contrasted with visibly sheer areas." },
  { name: "Reflective botanical surfaces", groups: [["large-floral-lace", "small-floral-lace"], ["beading", "sequins"]], interpretation: "Floral lace combined with reflective decorative details; exact motif placement requires inspection of the cited images." },
  { name: "Architectural volume", groups: [["ballgown", "a-line"], ["pleats", "ruffles"]], interpretation: "Full silhouettes articulated by folds or gathered surface volume." },
  { name: "Geometric transparency", groups: [["geometric-lace"], ["sheer-panels"]], interpretation: "Geometric lace and visible transparency occurring in the same garment image." },
] as const;

export function summarizeDesignDirections(input: AnalyzedPost[]) {
  // Repeated rows must not inflate support. Different posts of one garment can
  // still recur: garment identity cannot be established from the current schema.
  const unique = [...new Map(input.map(p => [`${p.username.toLowerCase()}:${p.id}`, p])).values()];
  const usable = unique.filter(p => p.analysis?.garmentVisible && p.analysis.confidence >= 0.5);
  const candidates = directions.flatMap(direction => {
    const support = usable.filter(p => direction.groups.every(group =>
      group.some(tag => (p.analysis!.visibleTags as readonly string[]).includes(tag))));
    const accounts = [...new Set(support.map(p => p.username.toLowerCase()))];
    if (accounts.length < 2) return [];
    const supportingKeys = new Set(support.map(p => `${p.username.toLowerCase()}:${p.id}`));
    const comparisons = usable.filter(p => p.sampleRole === "comparison");
    return [{
      status: "proposed" as const, name: direction.name,
      classification: "recurring_sample_direction" as const,
      interpretation: direction.interpretation,
      statement: `${direction.name} appears in ${support.length} analyzed posts from ${accounts.length} accounts; this is a sampled design direction, not established market growth.`,
      distinctAccounts: accounts.length,
      supportingPosts: support.length,
      analyzedPosts: usable.length,
      evidence: support.map(p => ({ username: p.username, postId: p.id, url: p.permalink,
        publishedAt: p.timestamp, sampleRole: p.sampleRole,
        visibleTags: p.analysis!.visibleTags, visibleFacts: p.analysis!.visibleFacts,
        relativeLikes: p.engagement.relativeLikes, peerCount: p.engagement.peerCount })),
      comparison: {
        analyzed: comparisons.length,
        supporting: comparisons.filter(p => supportingKeys.has(`${p.username.toLowerCase()}:${p.id}`)).length,
        withoutDirection: comparisons.filter(p => !supportingKeys.has(`${p.username.toLowerCase()}:${p.id}`)).map(p => p.permalink),
      },
      confidence: Math.min(0.6, 0.3 + accounts.length * 0.05, ...support.map(p => p.analysis!.confidence)),
      confidenceMeaning: "Conservative evidence-quality heuristic, not a calibrated forecast probability.",
      forecast: { status: "insufficient_evidence" as const, reason: "No matched longitudinal sample or verified garment deduplication; growth and the next big thing cannot be inferred." },
      limitations: [
        "Rules recognize only a small design vocabulary; absence of a direction is not evidence of absence in fashion.",
        "Accounts are not verified independent designers; repeated garments and campaigns may inflate support.",
        "Comparison posts are non-random samples, not negative controls or causal evidence.",
        "Co-occurrence does not prove that embellishment outlines the lace motif or uses a particular technique.",
        "Likes do not establish sales, design quality, or feature-driven popularity.",
      ],
    }];
  });
  return {
    status: "proposed" as const,
    analyzedPosts: usable.length,
    excludedOrDuplicatePosts: input.length - usable.length,
    directions: candidates,
    summary: candidates.length
      ? `Observed sample directions: ${candidates.map(c => c.name).join("; ")}. No growth forecast is established.`
      : "Insufficient cross-account visual evidence for the supported compound design directions; do not invent a trend.",
    unavailableMetrics: ["Follower-normalized engagement and video views are not supplied by this analysis layer; missing metrics must not be treated as zero."],
    nextEvidenceNeeded: ["Comparable earlier-period samples", "Verified distinct garments and independent designers", "Broader construction, motif-placement and surface-technique observations"],
  };
}
