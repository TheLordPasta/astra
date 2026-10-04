# Task 3 — Trend/design intelligence: validated checkpoint

## Scope and status

Branch: `mushmush/trend-design-intelligence-v1`.
This report preserves the first Task 3 phase and the requested cross-run visual research-memory reuse. It does not claim Task 3 is complete. No fresh market research, live Meta/vision/database validation, merge, or deployment was performed for this checkpoint.

## Implemented

- `src/ai/designDirections.ts`: conservative compound-feature synthesis for botanical transparency, reflective botanical surfaces, architectural volume, and geometric transparency. Requires visible-feature co-occurrence and at least two account names. Deduplicates account/post rows, excludes low-confidence or failed observations, includes supporting permalinks and comparison-post evidence. Outputs proposed sampled directions, not approved trends. Confidence is a capped evidence heuristic, not a forecast probability. Explicitly abstains from growth forecasts without longitudinal evidence.
- `src/ai/designDirectionResearch.ts`: wraps the existing Instagram research pipeline, adds compound directions and reuse audit records to its existing ResearchReport. Production uses durable memory; explicitly injected offline dependencies bypass live memory/API access.
- `src/ai/researchVisualMemory.ts`: content-based visual reuse through existing ResearchObservation and ResearchJob storage. No separate database, cache service, schema migration, or filesystem cache.
- `src/ai/instagramVisualResearch.ts`: exports existing live dependencies; allows an internal prepared-image loader so analysis uses exactly the downloaded bytes fingerprinted by memory; deduplicates post IDs before engagement comparison and sampling.
- `src/tools/instagramVisualResearchTool.ts`: routes Classroom designer research through the new wrapper while retaining existing budgets, permissions boundaries, persistence acknowledgment and image/video tools.
- `src/ai/designDirections.test.ts`: six focused synthesis/wrapper regression tests.
- `src/ai/researchVisualMemory.test.ts`: ten memory regression tests listed below.
- `package.json`: adds both new test files to the existing suite.

Existing read-only Instagram scope remains unchanged: supplied professional-account usernames, bounded photo/carousel sampling, no Instagram writes, no Reels ingestion or unrestricted search, and no new paid provider.

## Exact cross-run reuse workflow

1. Refresh available post metadata and engagement through existing retrieval. Deduplicate post IDs within each collected account before sampling. Neither a post ID nor a URL alone is proof of unchanged visual content.
2. Download selected still images again using existing secure public-image retrieval (one or two images per analysis). URL/DNS/type/size controls still apply.
3. Hash decoded image bytes individually with SHA-256, then hash the ordered image hashes together with the configured model identifier and `VISUAL_MEMORY_VERSION` (`dress-visual-v1`). CDN URL, caption and engagement do not enter this visual key.
4. Coalesce identical content-bundle analysis within the current memory instance, including concurrent requests. Return defensive copies of the analysis.
5. Look up `ResearchObservation` with type `other`, subject `visual-content:<digest>`, and a completed parent ResearchJob. Validate stored JSON against the entry and dress-analysis schemas and match digest, model and version before reuse.
6. If there is no valid reusable result, analyze the exact prepared bytes used for the key; do not download again inside the vision call. Schema-validate the result. Failed analysis is not cached.
7. Append successful fresh entries and a reuse audit to the existing research report. The existing report-save workflow supplies durability when its job completes. Internal entries have confidence zero and are explicitly not independent trend observations. Audit records record fresh/stored/same-run outcomes and stored observation IDs where available; they do not contain raw image bytes or CDN URLs.
8. Existing per-post observations and engagement snapshots still carry the current post source links and metadata. Reusing visual analysis does not skip metadata refresh or count the reused result as new independent corroboration.

### Reuse versus re-analysis

- Same exact ordered image bundle + same configured model + same contract version + valid completed stored record: reuse, even if CDN URLs changed or engagement changed.
- Same URL but changed image bytes: fresh analysis.
- Changed configured model, contract version, image count, or image order: new key, fresh analysis.
- Missing, malformed, truncated, schema-invalid, or mismatched stored evidence: not reusable; fresh analysis is allowed.
- Memory lookup error: skip affected visual analysis with sanitized failure; do not silently fall back to another paid vision call.
- Download failure or invalid input bounds: no vision call.
- Failed analysis: no successful cache record; later explicit retry may analyze again.
- Unsaved/failed research report: no guaranteed cross-run reuse; a future run may repeat analysis.

## Ten memory regression cases

1. Fresh analysis consumes the hashed bytes once; internal records contain neither source URL nor raw image data and have confidence zero.
2. A future run reuses persisted content despite a changed CDN URL, with stored observation ID in its audit.
3. Concurrent same-run identical content coalesces vision calls and returns defensive copies.
4. Changed bytes at the same URL require fresh analysis.
5. Model, contract version, image count and image order change the content key; non-data-image input is rejected.
6. Lookup failure prevents paid fallback and sanitizes provider details.
7. Empty, malformed, truncated and schema-invalid stored evidence cannot be reused.
8. Failed vision results are not cached and can be retried explicitly.
9. An unsaved report does not provide cross-run durability.
10. Invalid image-count bounds and download failures never reach vision.

Six additional design-direction tests cover abstention with insufficient accounts, feature co-occurrence, duplicate/low-quality exclusion, source-backed directions with comparison evidence, exclusion of fabric hypotheses from visible evidence, and preservation of original research signals/report integration.

## Actual validation rerun before preservation

- `run_developer_check(typecheck)` / `npx tsc --noEmit`: success, no compiler output. Silent output is valid success.
- `run_developer_check(test)` / `npm test`: **230 tests passed, 0 failed, 0 cancelled, 0 skipped** (230/230). The script includes typechecking and both new test files. Reported duration: 15812.792601 ms.
- Task 3 tests use fixture posts, injected vision and mocked in-memory storage. No real Meta calls, vision calls, database persistence or external image transport were exercised for this feature.
- The full suite also successfully ran existing native FFmpeg tests; that is not evidence of live Task 3 API/database behavior.
- Expected structured runtime-error diagnostics appeared in negative-path tests; the overall suite passed.

## Review and intended commit scope

Verified branch and inspected working-tree status. Read all eight changed/new source/configuration files listed above. The available `git_diff` check returned statistics only for the three tracked modifications (11 insertions, 6 deletions); it does not provide a unified patch or include untracked files. Full unified-diff review therefore remains unavailable. New files were reviewed directly. Only these eight implementation/test/configuration files plus this report are intended for the checkpoint; no unrelated modifications, secrets, generated artifacts or environment files are included.

## Limitations and remaining Task 3 work

- Images are downloaded again to verify exact bytes. This avoids repeat vision analysis, not all repeat network requests or repeat research jobs.
- Exact byte reuse is not perceptual similarity or garment identity. Re-encoding/resizing, alternate photos or a changed two-slide selection require fresh analysis. Same garment shown in multiple distinct posts may still inflate evidence; independent designers/account ownership are not verified.
- Same-run coalescing is instance-local. Separate processes can duplicate work; there is no cross-process claim/lock or unique content-record guarantee.
- Reuse is durable only after existing report persistence succeeds. Memory does not provide separate per-image checkpoint persistence.
- Analysis contract version must be bumped manually for prompt/schema/preprocessing changes. An unchanged model alias does not detect provider-side model updates.
- Captions are refreshed separately and do not invalidate image-only analysis; generic web research, standalone image tools, and video analysis are outside this reuse path.
- Internal memory evidence is stored as validated JSON in existing observations, not an approved human lesson. No insight is automatically approved.
- Current compound rules cover only a small fixed vocabulary. Broader construction, motif placement, surface-technique reasoning, verified garment deduplication and richer design understanding remain unfinished.
- Longitudinal sampling/comparison, calibrated trend emergence/forecasting, and additional available follower/view metrics remain unfinished. Missing metrics are not treated as zero.
- Original trend-informed design briefs and any rendered design generation remain unfinished.
- Live Meta permissions/data availability, actual vision quality, database lookup/persistence and cross-run production acceptance testing remain unverified.

## Delivery boundary

This is a preservation checkpoint only. Commit and push this exact validated scope, then stop. Do not begin the next Task 3 phase, merge, or deploy. The resulting commit hash and confirmed push outcome are reported in the conversation after those operations complete.
