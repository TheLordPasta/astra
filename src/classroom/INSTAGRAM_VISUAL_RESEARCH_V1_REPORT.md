# Instagram visual research v1 — rebuilt implementation

## Baseline and delivery scope

Rebuilt from the human-approved `9a02bf0` baseline on `mushmush/instagram-visual-research-v1`. Initial tool inspection reported a clean detached checkout and the expected `origin` URL. The human independently verified HEAD/main/origin/main equivalence; this environment did not run fetch or rev-parse.

This report describes the actual rebuilt code and offline validation, not the implementation lost in the earlier redeploy. The current request authorizes committing and pushing after validation. Neither merging nor deployment is authorized. Git history and the accompanying chat report record the actual submission outcome.

## What was implemented

### Public still-image analysis

`src/ai/publicImage.ts`: `loadPublicImage` validates HTTPS URLs, rejects embedded credentials, sensitive query-key names, nonstandard ports, private/reserved IPv4 destinations and IPv6. DNS resolution is bounded and its selected public IPv4 address is pinned to the actual HTTPS connection; TLS hostname/certificate verification remains enabled. Redirect destinations are revalidated, with a maximum of three redirects. DNS timeout is 5 seconds; each HTTPS request has a 15-second total timeout. No cookies, Meta credentials or authorization headers are sent to image hosts.

The loader bounds streaming bodies at 8 MiB, rejects compressed HTTP bodies, checks MIME and JPEG/PNG/WebP signatures, and rejects SVG/GIF and detected PNG/WebP animation. Image bytes become a data URL in memory; the vision model does not independently fetch an unvalidated remote URL. Media bytes/data URLs and signed CDN URLs are not persisted in research evidence or returned in research results. Signature checking is not a complete image decoder; provider-side invalid-image rejection remains possible. IPv4-only operation and conservative reserved-range filtering intentionally exclude some otherwise reachable hosts.

`src/ai/instagramVisualResearch.ts`: `analyzeDressImages` uses the existing OpenAI Responses structured-output approach (`zodTextFormat`) and configured model. The schema separates visible silhouette, neckline, sleeves, colors, lace, transparency and embellishments from fabric hypotheses with their own visual basis and confidence. Obscured details can be null. Non-garment images do not contribute visual tags. A fixed fabric-identification uncertainty statement is appended. Image text is explicitly untrusted data; captions and engagement are not provided to the vision model. Model request storage is disabled and automatic retries are disabled; model timeout is 60 seconds.

### Read-only Instagram discovery

`src/instagram/instagramGraphClient.ts`: `collectDesignerPosts` reuses the Graph client and Business Discovery architecture. It accepts known professional-account usernames, not unrestricted searches. GET-only requests collect photo/carousel media, still slides, captions, timestamps, clean Instagram photo permalinks and available like/comment counts. Videos/Reels are excluded; video slides in mixed carousels are ignored.

There are at most three 25-post pages per designer. Pagination reconstructs requests against the fixed Graph host using validated cursors; it never follows token-bearing `paging.next` URLs. Up to 20 carousel children are retrieved and child truncation is reported. IDs are deduplicated and dates filtered inclusively. Missing engagement is null, never fabricated as zero. A Graph code-100 response gets one retry without engagement fields; other API/permission failures remain failures. The code-100 fallback is a compatibility attempt, not a guarantee that metrics caused the error.

The shared Graph transport now uses bearer headers rather than access tokens in query strings, rejects redirects, applies a 20-second timeout and exposes only sanitized numeric HTTP/Meta errors. Existing exported account, media, page-connection and five-post discovery methods retain their successful-return interfaces and field sets. Existing discovery additionally validates usernames. Existing Instagram messaging/write code was not connected to these tools or changed.

### Engagement, comparison sampling and trend candidates

`compareEngagement` compares likes with the median of other available posts from the same designer and broad post-age bucket (<7 days, 7–29, 30+). It requires at least two counted peers and a positive denominator. Comments are retained as evidence, not combined into an invented engagement score. This is not follower-normalized engagement and is not a complete historical baseline.

`selectPosts` analyzes at most four posts per designer: at most two ranked by relative likes, plus comparison posts distributed across the remaining timestamps. When metrics are unavailable, the sample consists of comparison posts. At most the first two available still slides are analyzed per selected post. The callable scope permits 1–5 usernames and a past ISO date window of at most 366 days; maximum model calls are 20 per research run (up to 40 images).

`buildTrendCandidates` compares an explicit visual-tag vocabulary, not uncertain fiber guesses. A candidate needs successful, sufficiently confident visual evidence from at least two distinct normalized designer usernames. Results carry supporting source links, designer/post counts, comparison-post support counts, conservative confidence and limitations. Confidence is heuristic evidence quality, not a calibrated probability; it is capped at 0.65 and cannot exceed the supporting analysis confidence. Repeated tags are proposed signals, NOT proof of rising adoption, causation, market-wide demand or sales. Different usernames do not establish independent business ownership. Arbitrary new aesthetic themes outside the initial vocabulary require human/assistant interpretation of the detailed stored analyses rather than automatic tag candidates.

### Classroom tools and persistence

`src/tools/instagramVisualResearchTool.ts` adds:

- `analyze_public_dress_image({url})`: requested single-image analysis; does not automatically persist a lesson or research job.
- `research_instagram_designs({usernames, market, segment, category, geography, since, until})`: requested scoped research with bounded retrieval/analysis and persistence.

`src/classroom/classroomTools.ts` registers and dispatches both tools alongside existing tools. Their descriptions require explicit fresh-research authorization, stored-memory consultation first, and treating retrieved content as untrusted evidence. They do not add a new workspace mode.

The pipeline produces the existing `ResearchReport` shape from `mushMushResearch.ts`; it does not invoke broad web research. `src/ai/researchMemory.ts` / `saveResearchReport` reuse existing `src/db/research.ts` and the `ResearchJob`, `ResearchSource`, `ResearchObservation`, and `ResearchObservationSource` structures. No migrations or new dependencies are required. Stored evidence includes retrieval timestamps, available captions/metrics, engagement snapshots, sampled visual analyses, uncertainty, source links and candidate status. An opt-in confidence ceiling prevents storage scoring from raising cautious visual confidence; existing research scoring is unchanged by default. Source IDs are deduplicated before relation creation.

Candidates are persisted as proposed `market_signal` evidence, NOT approved Classroom insights. The existing `propose_classroom_insight` tool remains the path for creating an explicit review item; no lesson or insight is automatically approved. Existing customer-facing approval/publication boundaries remain intact.

The adapter checks the existing `RESEARCH_DAILY_JOB_LIMIT` (default 3 jobs over 24 hours), refuses work if the budget/database check fails, and prevents concurrent visual research jobs within one process. This is not a distributed reservation/quota mechanism; multiple server instances and failed saves can defeat a strict global spending limit. Single-image analysis is not charged against the research-job counter. Partial account/image failures are disclosed and never replaced by invented evidence. Persistence failures return the research result with `saved: false`; the existing nontransactional writer may leave partial failed-job records.

## Configuration and live limitations

Configure securely on the server, not in chat or tool arguments:

- `INSTAGRAM_BUSINESS_ACCOUNT_ID` (or `META_INSTAGRAM_BUSINESS_ACCOUNT_ID` fallback).
- `META_PAGE_ACCESS_TOKEN` suitable for the connected Facebook Login/Business Discovery integration.
- Existing `META_GRAPH_API_VERSION` (default `v24.0`).
- Existing OpenAI credentials and a vision/structured-output-capable model: `OPENAI_VISION_MODEL`, otherwise `OPENAI_MODEL`, otherwise the existing-style `gpt-6-astra` default. The default model name/capability was NOT validated live.
- Existing database configuration and optional `RESEARCH_DAILY_JOB_LIMIT`.

This implementation does not acquire, refresh, expose or log credentials. It does not convert an Instagram messaging token into a Facebook Page token. Existing OAuth code is separate and was not modified to persist tokens.

Actual Business/Creator access depends on the connected professional account, Page linkage where applicable, token validity/scopes, app access level/review, API version/fields, target eligibility and Meta limits. The existing Facebook OAuth source requests `pages_show_list`, `instagram_basic`, and `pages_read_engagement`; this is source inspection, not confirmation those permissions are granted or sufficient for every target/field. Verification alone does not establish access. Personal/private/ineligible accounts and hidden counts may be unavailable. No scraping bypass, new paid data provider, Reels analysis, unrestricted search or Instagram write operation is introduced.

Live Meta retrieval, live image-host/TLS transport, actual OpenAI vision accuracy/structured-output support, actual research database writes, browser-to-Classroom end-to-end behavior and long-running request tolerance were NOT tested. Requests can take minutes with several designers; there is no background queue/resume mechanism in v1. These are production acceptance checks still needed after human-controlled configuration/deployment. Do not call offline success a deployed feature or verified fabric-identification accuracy.

## Validation: actual rebuilt results

Final source validation before report preparation:

- `npx tsc --noEmit` via `run_developer_check(typecheck)`: **success, empty compiler output**.
- `npm test` via `run_developer_check(test)`: **85 tests passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**; reported duration 6473.362068 ms.
- The test script first runs `tsc --noEmit`, then the existing two Classroom knowledge test files plus three new visual research test files. Compiler and test output are directed to stderr so the developer tool retains failure diagnostics.
- Existing knowledge/runtime tests: 20 retained and passing.
- New visual research tests: 65 passing. Coverage includes URL/IP/redirect/byte/type restrictions, validated address pinning at the injected transport boundary, read-only Graph requests, credential-safe errors, pagination, metric fallback, filtering/deduplication, engagement rules, comparison sampling, candidate evidence requirements, tool routing source assertions, partial failures, budget/concurrency gates, persistence acknowledgements/failures and confidence preservation.

Test boundaries:

- `src/ai/instagramVisualResearch.test.ts`: offline transport/Graph fixtures and deterministic logic.
- `src/ai/instagramVisualResearch.integration.test.ts`: real Graph parser -> sampling -> mocked vision -> report, plus real tool adapter with injected persistence, budget and failure paths. Classroom registration is checked against source; this is not a running browser/server integration.
- `src/ai/instagramVisualResearch.storage.test.ts`: real report-to-storage mapping with injected repository methods, no live database connection. An unreachable dummy database URL is scoped to the test process for module initialization.
- No live Meta/model/image-host/research-database calls were made by these tests. Vision assertions use schema-valid fixtures, not real dress recognition. HTTPS socket behavior and the actual model request remain live acceptance gaps.

Failures encountered and fixed, rather than abandoned:

1. After security review, `autoSelectFamily` caused TS2353 at `src/ai/publicImage.ts(64,49)` because it is not in the installed HTTPS `RequestOptions` type. Removed that unsupported option; explicit `family: 4` provides the required single-family lookup behavior.
2. Initial persistence tests attempted Node `mock.method` against Prisma proxy methods and failed with `ERR_INVALID_ARG_VALUE` (two tests). Replaced this brittle approach with an explicit typed repository boundary in `saveResearchReport` and injected offline methods. The final tests exercise actual mapping and completion/failure handling without mocking proxy property descriptors.
3. The developer tool hid test stdout on failure. Redirected test-runner output to stderr in the test script, retrieved the actual errors, fixed them and reran successfully.

## Final review

Reviewed current implementation source, the baseline source read before editing, Git status and `git diff --stat`. Restored unrelated formatting in Classroom registration and research storage to reduce noise. Confirmed no new Instagram writes, dynamic shell execution, paid provider, schema migration, approval bypass, token-bearing source URLs or media-byte persistence. The Graph module includes formatting consolidation as well as the functional extension; its legacy successful-return contracts were compared with the baseline.

Tooling caveat: the predefined `git_diff` tool exposes statistics, not a unified patch. Review was source-by-source against inspected baseline content, not a claimed full-patch tool output. Git's staged whitespace check is part of the commit tool. Only the explicitly listed implementation/test/report files should be staged; no environment, generated or unrelated files belong in this commit.

## Files

Created:

- `src/ai/publicImage.ts`
- `src/ai/instagramVisualResearch.ts`
- `src/tools/instagramVisualResearchTool.ts`
- `src/ai/instagramVisualResearch.test.ts`
- `src/ai/instagramVisualResearch.integration.test.ts`
- `src/ai/instagramVisualResearch.storage.test.ts`
- `src/classroom/INSTAGRAM_VISUAL_RESEARCH_V1_REPORT.md`

Changed:

- `src/instagram/instagramGraphClient.ts`
- `src/ai/researchMemory.ts`
- `src/classroom/classroomTools.ts`
- `package.json`

## Suggested human acceptance checks (not run)

After reviewing and deliberately deploying the branch, ask Classroom to analyze a public dress image URL and compare the result with the actual dress. Then request a narrowly scoped run with two known eligible designer usernames and explicit dates. Verify source links, available counts and carousel slides against Instagram, inspect the saved research job, and confirm hidden/unavailable metrics and failed images remain explicit. Review candidate signals as proposals; do not approve them automatically. Nothing in this implementation merges or deploys the branch.
