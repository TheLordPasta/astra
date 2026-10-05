import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { loadPublicImage } from "./publicImage.js";
import { analyzeDressImages, DressAnalysisSchema } from "./instagramVisualResearch.js";
import type { DressAnalysis } from "./instagramVisualResearch.js";
import type { ResearchReport } from "./mushMushResearch.js";

// Version includes the prompt, schema, preprocessing and interpretation contract.
// Bump whenever any of these change. A model change also invalidates reuse.
export const VISUAL_MEMORY_VERSION = "dress-visual-v1";
const prefix = "visual-content:";
const EntrySchema = z.object({
  version: z.string(), model: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/),
  analyzedAt: z.iso.datetime(), analysis: DressAnalysisSchema,
});
type Entry = z.infer<typeof EntrySchema>;
export interface VisualMemoryStore {
  find(subject: string): Promise<{ id: number; evidence: string | null } | null>;
}
// Uses the SAME ResearchObservation/ResearchJob tables and saveResearchReport
// transaction lifecycle. No second database, cache service or filesystem store.
export const persistentVisualMemory: VisualMemoryStore = {
  async find(subject) {
    const { prisma } = await import("../db/client.js");
    return prisma.researchObservation.findFirst({
      where: { type: "other", subject, researchJob: { status: "completed" } },
      orderBy: { observedAt: "desc" }, select: { id: true, evidence: true },
    });
  },
};
export function visualContentKey(data: string[], model: string, version = VISUAL_MEMORY_VERSION) {
  // Hash decoded bytes, not expiring CDN URLs or engagement/caption metadata.
  const hashes = data.map(value => {
    const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
    if (!match) throw new Error("Visual memory requires validated still-image data");
    return createHash("sha256").update(Buffer.from(match[1]!, "base64")).digest("hex");
  });
  return createHash("sha256").update(JSON.stringify({ version, model, hashes })).digest("hex");
}
export interface VisualMemoryDependencies {
  store: VisualMemoryStore;
  load(url: string): Promise<string>;
  analyze(urls: string[], load: typeof loadPublicImage): Promise<DressAnalysis>;
  model: string;
  now(): Date;
}
export function createVisualResearchMemory(overrides: Partial<VisualMemoryDependencies> = {}) {
  const deps: VisualMemoryDependencies = {
    store: persistentVisualMemory, load: loadPublicImage, analyze: analyzeDressImages,
    model: process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-6-astra",
    now: () => new Date(), ...overrides,
  };
  const pending = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<DressAnalysis>>();
  const events: { digest: string; outcome: "analyzed" | "reused_stored" | "reused_run"; observationId: number | null; analyzedAt: string }[] = [];
  const warnings = new Set<string>();
  async function analyze(urls: string[]): Promise<DressAnalysis> {
    if (!urls.length || urls.length > 2) throw new Error("Visual memory accepts one or two still images");
    // Always revalidate URL/DNS/type/limits and refresh bytes. A URL alone cannot
    // establish unchanged content, even when a post ID is unchanged.
    const data: string[] = [];
    for (const url of urls) data.push(await deps.load(url));
    const digest = visualContentKey(data, deps.model);
    const existing = inFlight.get(digest);
    if (existing) {
      const analysis = await existing;
      events.push({ digest, outcome: "reused_run", observationId: null, analyzedAt: pending.get(digest)?.analyzedAt ?? deps.now().toISOString() });
      return structuredClone(analysis);
    }
    const work = (async () => {
      let stored: Awaited<ReturnType<VisualMemoryStore["find"]>>;
      try { stored = await deps.store.find(prefix + digest); }
      catch {
        warnings.add("Research-memory lookup failed; affected images were not sent to vision. No silent paid fallback.");
        throw new Error("Research-memory lookup unavailable; visual analysis skipped");
      }
      if (stored?.evidence) {
        let parsed: ReturnType<typeof EntrySchema.safeParse> | undefined;
        try { parsed = EntrySchema.safeParse(JSON.parse(stored.evidence)); } catch { /* invalid evidence is not reusable */ }
        if (parsed?.success && parsed.data.digest === digest && parsed.data.version === VISUAL_MEMORY_VERSION && parsed.data.model === deps.model) {
          events.push({ digest, outcome: "reused_stored", observationId: stored.id, analyzedAt: parsed.data.analyzedAt });
          return parsed.data.analysis;
        }
        warnings.add("An invalid visual-memory record was ignored; its content required fresh analysis.");
      }
      // The provider receives exactly the bytes hashed above, with no second
      // download / time-of-check-to-time-of-use content mismatch.
      const byUrl = new Map(urls.map((url, i) => [url, data[i]!]));
      const analysis = DressAnalysisSchema.parse(await deps.analyze(urls, async url => {
        const image = byUrl.get(url);
        if (!image) throw new Error("Unknown prepared image");
        return image;
      }));
      const entry: Entry = { digest, model: deps.model, version: VISUAL_MEMORY_VERSION, analyzedAt: deps.now().toISOString(), analysis };
      pending.set(digest, entry);
      events.push({ digest, outcome: "analyzed", observationId: null, analyzedAt: entry.analyzedAt });
      return analysis;
    })();
    inFlight.set(digest, work);
    try { return structuredClone(await work); }
    catch { inFlight.delete(digest); throw new Error("Visual research memory or analysis failed; no successful reuse recorded"); }
  }
  function appendToReport(report: ResearchReport) {
    for (const [digest, entry] of pending) {
      // Internal evidence, deliberately not a high-confidence market finding.
      report.findings.push({ type: "other", subject: prefix + digest,
        statement: "Reusable visual analysis of a versioned image-content bundle; not an independent trend observation.",
        evidence: JSON.stringify(entry), confidence: 0, sourceUrls: [] });
    }
    report.uncertainties.push(...warnings,
      "Visual reuse checks exact bytes plus model/prompt version, not garment identity. Reused observations are not new independent evidence.",
      "Fresh visual-memory entries become durable only if this research report is saved and its job completes; failed saves may require re-analysis.");
    const summary = {
      version: VISUAL_MEMORY_VERSION, freshAnalyses: events.filter(e => e.outcome === "analyzed").length,
      storedReuses: events.filter(e => e.outcome === "reused_stored").length,
      sameRunReuses: events.filter(e => e.outcome === "reused_run").length,
      events: [...events], warnings: [...warnings],
    };
    report.findings.push({ type: "other", subject: "Visual analysis reuse audit",
      statement: "Content reuse audit; engagement was refreshed independently of image analysis.",
      evidence: JSON.stringify(summary), confidence: 0, sourceUrls: [] });
    return summary;
  }
  return { analyze, appendToReport };
}
