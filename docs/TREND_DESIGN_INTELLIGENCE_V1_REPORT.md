# Task 3 — Trend/design intelligence and semantic-memory checkpoint

Branch: `mushmush/trend-design-intelligence-v1`. No merge or deployment.

## Current recovery milestone

Recovered from clean checkpoint `96248dba9f057bfa2fbcda33373da63bf3ddb981` after interrupted validation work. The existing semantic-memory implementation was not restarted or rewritten.

Verified `npm test` already equals `node scripts/task3Validation.js all`. `scripts/` contained only the bounded runner: no custom compiler API experiment or temporary diagnostic-only command remained. package.json was left unchanged.

The preserved runner still attempted full compilation on every all-mode invocation. Cleanup adds a fixed read-only cgroup resource policy: hosts with <=512 MiB memory or <=0.5 CPU skip compiler launch and record `unverified_resource_limit`, attempt zero, null exit code and `success:false`. Full/focused tests still run. This is not a successful compiler check. Aggregate npm test remains nonzero whenever compilation is skipped or a stage fails; nothing hides the gap. Larger or unknown-resource hosts retain one bounded official CLI attempt (120 seconds), not a custom compiler API. No compiler strictness, tsconfig scope or legitimate source inclusion was changed.

### Fresh validation results

One invocation of `run_developer_check(test)` ran the normal npm test command:

| Stage | Result | Captured wall duration |
|---|---|---:|
| Focused semantic-memory tests | 15 passed, zero failures; exit 0 | 2.178 s |
| Official full typecheck | NOT RUN: resource policy; unverified | 0 s |
| Full suite (including four new runner regression tests) | 249 passed, zero failed/cancelled/skipped; exit 0 | 20.784 s |

Both test stages had empty stderr, no termination signal and no timeout. Real cgroup readings: 536870912 memory bytes and 0.5 CPU. The top-level tool returned CLASSROOM_RUNTIME_FAILURE because the aggregate command exits 1 for unverified compilation. File-backed results were recovered successfully without retrying the command. Exact stage results and sanitized output are in `docs/TASK3_COMPILER_DIAGNOSTICS.md`.

Historical conversation diagnostics reported official `tsc --noEmit` timing out at 30 and 120 seconds without compiler output in this resource class. The current checkpoint originally documented only the 30-second run. These are historical results, not new attempts. Treat this as an environment validation limitation unless actual compiler diagnostics establish a code defect. Full type safety remains unverified; tsx execution does not replace TypeScript checking.

### Recovery policy and larger-environment validation

Do not retry full typecheck in this constrained container. Use `node scripts/task3Validation.js local`, `npm run test:task3`, or `npm run test:full` for explicitly tests-only validation. Normal npm test remains all-mode and clearly marks the compilation gap. Run `npm run typecheck` / bounded all-mode in stronger CI before merge; no CI pass or configured CI job is claimed. Each stage has one attempt, fixed arguments, a deadline, 1 MiB output capture bound, credential-pattern redaction, and file-backed terminal status. If a wrapper fails, read diagnostics before any retry. If metadata is unavailable, there is at most one bounded attempt, never an automatic recovery loop.

Four new tests cover constrained resource policy and unverified status, larger/unlimited/missing resource metadata, all/local mode scope and invalid commands, and silent output/redaction. Runner imports have no validation side effects.

## Previously preserved design/visual-memory phase

Commit `6378046e709aee33df3d805cb9364404bfc7250c` contains compound design-direction synthesis and cross-run visual-analysis reuse (historically 230 tests and typecheck passed). Downloads use secure retrieval; ordered image bytes, model and analysis version determine the reuse hash. Changed CDN URL alone does not invalidate matching bytes. Changed bytes/model/version/order require fresh analysis. Metadata and engagement refresh. Same-instance concurrent calls coalesce; failed lookup does not silently cause a paid fallback. Reuse is durable after report save; images are not archived. The ten original regression cases cover prepared bytes, changed URLs across runs, concurrency, changed content, versioning, lookup failure, malformed records, failed analysis, unsaved reports and invalid/download inputs.

## Semantic persistence/retrieval already implemented

- `src/ai/fashionMemory.ts`: typed claims, stable scoped concept identities, canonical evidence URLs, support/contradiction evidence, cautious assessments and planning.
- `src/db/fashionMemory.ts`: transactional research saving and semantic retrieval through existing PostgreSQL research/Trend/TrendObservation architecture.
- `src/ai/researchMemory.ts`: production saves delegate to atomic persistence; existing confidence scoring and optional visual ceiling retained. Injected legacy stores retain their documented offline non-atomic compatibility path.
- `src/ai/fashionMemory.test.ts`: 15 regressions using transactional repository mocks.

No schema migration or parallel memory database. Trend descriptions hold versioned fashion-memory metadata. TrendObservation holds fashion evidence and append-only assessments; ResearchJob/Source/Observation and links retain source evidence. Human lessons remain separate and authoritative.

Concept keys normalize kind, name and market/segment/category/geography. Explicit aliases handle known variants, not arbitrary semantic equivalence. Valid structured fashionConcept claims and linked sources are required; unsupported/future evidence does not create learned concepts. Instagram/web producers are not yet fully integrated.

Evidence retains job/observation/source references, canonical URL, origin, stance, dates, confidence, statement, limitations and optional measurements. A concept+canonical-URL key has one current vote. Unchanged fingerprints add neither vote nor assessment; revisions append history rather than overwrite it. Cross-URL copies, garment identity and account ownership remain unresolved.

First/last observation and current support/contradiction references are retained. Temporal increasing/declining/stable/emerging require comparable non-overlapping measurement windows, two supporting origins and no conflicts. New discovery alone remains uncertain. Emergence requires earlier zero prevalence plus sufficient change. Confidence caps and 0.15 change threshold are conservative heuristics, not calibrated forecasts. Upstream comparability needs verification.

Persistence starts a running job before its save transaction. Sources, observations, limitations, concept evidence and completion are transactional; an advisory lock serializes concept updates. Rollbacks preserve failure status where possible. Semantic retrieval excludes evidence from incomplete jobs. General raw-memory filtering and jobs that fail before report saving remain separate gaps. PostgreSQL lock/timeout behavior has not been live-tested.

`loadFashionResearchPlan` retrieves scoped knowledge, flags stale (>90 days), weak, conflicting or missing temporal evidence. It is tested but not yet wired into both fresh-research entry points.

## Fifteen existing semantic-memory regressions

1. Alias/scope identities and distinct concepts.
2. Canonical tracking-free Instagram evidence URLs.
3. Malformed claims/records.
4. Recurrence is not automatic emergence.
5. Temporal states and conflicts.
6. Revision vote deduplication and first observation.
7. Same concept across runs and source links.
8. Duplicates do not inflate confidence/history.
9. Contradiction preserves previous assessments.
10. Temporal state changes preserve history.
11. Failed/incomplete jobs excluded.
12. Transaction rollback and failed-job record.
13. Scoped memory planning and gaps.
14. Legacy confidence/ceiling/uncertainties.
15. Unsupported/future evidence rejected.

## Remaining Task 3 work

Connect Instagram/web structured-claim generation and memory-first planning; expose semantic retrieval through existing research memory; improve broader concept equivalence and cross-URL content deduplication; reliable pre-research job history; scalability beyond description scans/global lock; upstream temporal comparability; live PostgreSQL acceptance and full compiler check; broader design vocabulary, original design briefs and separately available rendering.

No live Meta, web research, vision or database requests were made during validation recovery. Tests use mocked persistence/model behavior; existing native media tests executed real synthetic-media FFmpeg paths successfully. No fresh paid research was run.

## Cleanup review / delivery

Only runner, runner tests, diagnostics and this report changed in the recovery checkpoint. package.json and business logic were preserved. Source reviewed directly; available git_diff exposes statistics only, so full unified-patch review is not claimed. Commit/push results are reported after confirmation. A clean pushed checkpoint is required before resuming research integration.
