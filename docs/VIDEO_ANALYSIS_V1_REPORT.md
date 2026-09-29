# Video analysis v1 — milestone 1: secure video retrieval

## Scope and status

This milestone preserves the existing secure video-retrieval implementation on `mushmush/video-analysis-v1`. It does not implement frame extraction, video understanding, Classroom video tools, or Instagram Reels ingestion. No deployment or merge is included.

Files:
- `src/ai/publicVideo.ts`: bounded public HTTPS retrieval and sanitized failures.
- `src/ai/publicVideo.test.ts`: 30 focused retrieval tests.
- `package.json`: includes the retrieval tests in the existing test suite.
- `docs/VIDEO_ANALYSIS_V1_REPORT.md`: this report.

## Implemented behavior

`loadPublicVideo` returns in-memory bytes, MIME, and byte length, without returning source URLs. The maximum body size is **25 MiB (26,214,400 bytes)**. Only HTTP 200 bodies declared as `video/mp4` or `video/webm` are accepted; MIME parameters and case are normalized. Container signatures are checked against the declared type. MP4 checks examine the ftyp box and supported brands; WebM checks require the EBML signature and WebM document-type marker. These are preliminary type checks, NOT proof of a complete, valid, decodable video or supported codec.

No new provider, API credentials, database structures, or Instagram writes are introduced. Existing still-image files are unchanged.

## Security controls and architectural reuse

The implementation imports `validateImageUrl`, `resolveImageHost`, and `isPublicIPv4` from the existing secure image retrieval module rather than replacing that foundation.

- HTTPS URL restrictions inherited from image validation, including rejection of credentials, unsafe ports, private/local targets, fragments and disallowed sensitive query parameters.
- Public IPv4 validation; empty or mixed public/private DNS results are rejected.
- Validated DNS address pinned to the HTTPS socket while retaining hostname-based TLS verification; no shared connection agent.
- Redirect destination URL and DNS revalidated at every hop; maximum three redirects/four requests.
- Absolute 15-second deadline per HTTP request, not merely a resettable idle timeout.
- Declared content-length checks plus streaming enforcement of the 25 MiB limit; incomplete or inconsistent bodies rejected.
- Compressed responses, partial responses and non-200 final statuses rejected.
- MIME and preliminary container signature validation; HTML and mismatched types rejected.
- `VideoAccessError` provides sanitized stage information (`url`, `dns`, `transport`, `redirect`, `http`, `size`, `type`) without propagating provider messages, credentials or potentially signed URLs.
- Retrieval remains in memory; this milestone creates no video temporary files.

## Test coverage

The 30 new tests cover MP4/WebM metadata, public-address pinning at the transport abstraction, MIME normalization, unsafe URLs, private/mixed DNS, relative and cross-host redirects, redirect revalidation and limits, missing redirect locations, HTTP errors/partial responses, empty and oversized bodies, the exact size boundary, compressed responses, invalid signatures/container mismatches, sanitized DNS/transport failures, and abort failures.

Tests use synthetic container bytes and injected/mock transport. The boundary test deliberately does not claim the accepted bytes are decodable. Existing knowledge, still-image, research-storage and Classroom response-resilience tests also ran.

## Actual validation rerun for preservation

- `run_developer_check({check: "typecheck"})`: **success: true**, output `""`. Silent compiler output is valid success.
- `run_developer_check({check: "test"})`: **success: true**. `npm test` runs `tsc --noEmit` followed by the configured test files.
- Final result: **184 tests passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**, including 30 video retrieval tests.
- Expected structured runtime-failure diagnostics appeared from negative regression fixtures; the suite passed.
- Current retrieval implementation, test source and package script were read for review. The available `git_diff` check returns statistics only and omits untracked file content; it showed only the package script change before staging. Full patch review via tooling was not available. The two new source files were reviewed directly instead.

## Known unverified areas and limits

- No real external video download was performed in this preservation phase.
- Native HTTPS socket behavior, deadline firing, streaming limit enforcement and truncated-network-body handling were not directly exercised by these mock-transport tests.
- Container checks do not validate codecs, duration, resolution, frame count, media integrity, or decode resource usage.
- No real video decoding, frame extraction or model invocation was performed.
- No live Meta permission, video retrieval, vision accuracy or database validation occurred; those capabilities are outside this milestone.
- No Classroom video-analysis tool is available from this retrieval layer alone.

## Next phase — not started

Add duration/codec probing and resource-bounded decoding; extract a limited number of timestamped frames with cleanup. Then reuse structured visual analysis to distinguish visible design facts from uncertain fabric/movement hypotheses, and expose the capability through Classroom with integration tests. Instagram Reels ingestion remains separate pending explicit implementation scope and Meta access.

## Preservation

This report and the three milestone files are intended to be committed and pushed together on `mushmush/video-analysis-v1`. The exact commit hash and confirmed push outcome are reported in chat after those operations complete. No merge or deployment is authorized by this milestone.
