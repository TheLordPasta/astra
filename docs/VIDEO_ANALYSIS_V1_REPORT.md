# Video analysis v1 — retrieval, extraction and Classroom analysis

## Status and scope

Implemented on `mushmush/video-analysis-v1`, continuing the pushed retrieval checkpoint `6ec5ad9f309a1e370ec0d792e1a6a15c0d47546c`. This report replaces the retrieval-only status; that implementation was preserved, not rebuilt.

Direct public HTTPS MP4/WebM -> secure bounded retrieval -> native metadata probing -> deterministic JPEG samples -> structured model analysis -> timestamped Classroom result is wired in code. Native extraction and mocked model integration are validated. A live end-to-end external download/model run has NOT been performed. No merge or deployment is included.

Instagram Reel/page ingestion, audio, direct uploads, automatic research storage and trend conclusions are not implemented. These are not implied by accepting direct video-file URLs.

## Files

Previously committed and unchanged in this phase:
- `src/ai/publicVideo.ts`: secure retrieval.
- `src/ai/publicVideo.test.ts`: 30 retrieval tests.

New in this phase:
- `src/ai/videoFrames.ts`: bounded native processes, metadata validation, sampling, extraction and cleanup.
- `src/ai/videoAnalysis.ts`: existing dress-schema reuse, actual vision-model request path, evidence validation and synthesis.
- `src/ai/videoAnalysis.test.ts`: 30 additional tests, including native FFmpeg tests.
- `src/tools/videoAnalysisTool.ts`: strict Classroom function schema and sanitized result envelopes.

Updated:
- `src/tools/instagramVisualResearchTool.ts`: registers and dispatches the video tool through the existing Classroom visual-tool architecture; still-image behavior remains intact.
- `src/ai/instagramVisualResearch.integration.test.ts`: registration expectations now include the third (video) tool.
- `package.json`: includes video analysis tests.
- `docs/VIDEO_ANALYSIS_V1_REPORT.md`: this report.

## Retrieval controls retained

Maximum **25 MiB (26,214,400 bytes)**. HTTPS only, using existing secure image URL/DNS foundations; credentials, unsafe ports, local/private addresses and mixed public/private DNS rejected. DNS is pinned to the validated public IPv4 while hostname-based TLS verification remains enabled. Redirect URL/DNS checks run at every hop, with at most three redirects/four requests. Each request has a 15-second deadline; streaming byte limits and declared lengths are checked. Only HTTP 200, uncompressed MP4/WebM responses with matching preliminary signatures are accepted. MIME parameters are normalized. Errors do not return source URLs or provider details.

## Native processing controls

- Maximum duration: **60 seconds**; one video stream; at most eight total streams.
- Containers: ffprobe's MP4/MOV family or Matroska/WebM, matching retrieved MIME.
- Codec allowlist: H.264, HEVC, VP8, VP9, AV1. Actual decoder availability still depends on the installed FFmpeg build.
- Maximum side: 4096 pixels; maximum area: 4096 x 2160 pixels.
- Deterministic equally spaced midpoint seek targets; one to six frames, at most six.
- 30-second shared native processing deadline, at most eight seconds per process; 64 KiB probe output and stderr caps.
- JPEG output scaled within 768 x 768; at most 1 MiB per frame, at most 6 MiB retained frame bytes.
- Fixed executable names and argument arrays, `shell: false`, no user-supplied process arguments. Input is a server-created local path, not a URL passed to FFmpeg.
- Forced container demuxer, restricted file/pipe protocols, bounded probing, single decode/filter threads and 64 MiB maximum individual native allocation.
- One extraction and one analysis pipeline at a time per process; no unbounded local queue.
- Private temporary directory and exclusive input file creation (0600); at most 25 MiB input on disk. Frames use bounded stdout, not disk files.
- Deadline/output-limit failures kill the child and wait for close before cleanup. The temporary directory is removed in `finally`; cleanup failures are reported, not silently ignored.

These controls are NOT an OS sandbox or a hard aggregate native-memory quota. Process-local concurrency is not a cross-worker global limit. Malicious native-decoder vulnerabilities and local-file access are not eliminated by a protocol allowlist; patched FFmpeg and deployment isolation remain important. Abrupt host termination can bypass application cleanup. The bounds above do not claim instantaneous timeout delivery under an unresponsive host.

## Structured visual understanding

`analyze_public_dress_video` accepts a direct public file URL. Extracted JPEG bytes are sent as data URLs to the configured vision model; the source video URL is not handed to the model. The request uses structured output, a 60-second model timeout, no automatic retries, a 7000-token output cap, and `store: false`.

Per-frame observations reuse `DressAnalysisSchema`: silhouette, neckline, sleeves, colors, lace, transparency, embellishments, visible tags and uncertain fabric hypotheses. Video-level visible observations and hypotheses cite frame indices, validated against the actual extracted sample. Missing/duplicate/out-of-range frame records are rejected. No-garment frames cannot support video-level garment claims. Trusted sampling timestamps are attached by application code, not accepted from model text.

Sampling times are requested seek targets, NOT verified exact presentation timestamps. Sparse stills do not establish continuous movement, speed, exact fabric fibers, weight, hand-feel or product identity. The prompt and returned limitations explicitly distinguish facts from fabric/style/movement inferences and account for camera movement/editing. Audio is not analyzed. Image text is treated as untrusted data. No trend or designer identity is claimed from one video.

Failures return non-empty structured `CLASSROOM_RUNTIME_FAILURE` envelopes with stage information and safe guidance. No source URL, temporary path, JPEG bytes or raw native stderr is intentionally returned by the tool. Results declare `saved: false`; no database persistence is claimed.

## Validation and recovered test failure

Earlier full-suite failure: an existing integration test still expected exactly two registered visual tools after video registration added a third. The registration expectation was updated; runtime behavior was not changed to satisfy the stale assertion.

Final validation executed in this continuation:
- `run_developer_check({check: "test"})`: **success: true**; `npm test` executes TypeScript validation followed by the entire configured suite.
- **214 tests passed; 0 failed, 0 cancelled, 0 skipped, 0 todo.** This includes 30 retrieval tests and 30 video processing/analysis tests.
- `run_developer_check({check: "typecheck"})`: **success: true**, output `""`. Silent output is valid compiler success.
- Negative fixtures intentionally emitted structured runtime diagnostics; these are expected passing tests, not production failures.

Real native execution in this environment:
- FFmpeg generated synthetic MP4/H.264 and WebM/VP8 clips; ffprobe inspected them and FFmpeg extracted multiple JPEG frames through the real production extraction path.
- Real process timeout and output-cap tests passed.

Mocked/unit coverage:
- HTTP/DNS retrieval fixtures; URL, MIME/signature, redirects, size and transport failures.
- Metadata and duration/dimension/codec rejection; deterministic sampling; fixed arguments; cleanup success/failure paths; invalid JPEGs; concurrent extraction rejection.
- Model fixtures and dependency-injected pipeline; timestamp association; evidence schema validation; no-garment constraints; sanitized adapter failures and Classroom dispatch.

Review: current extraction, analysis, adapter, registration and test source were read directly. `git_diff` exposes statistics only and excludes untracked content before staging; a complete baseline unified-patch review was unavailable. No unrelated task 2/3 implementation was included.

## Live validation and deployment limitations

- No actual external video download or real vision inference in this phase. Synthetic test patterns do not establish dress-recognition quality.
- Native HTTP socket deadline/stream-limit behavior was not directly exercised by mocked retrieval tests.
- No live Meta or database test; this public-video tool uses neither Meta ingestion nor automatic database saving.
- FFmpeg and ffprobe must be installed in the running Classroom environment. Native test success here does not install them in other deployments.
- A vision-capable model supporting the structured schema and secure API configuration must exist in deployment. No credentials were inspected or exposed.
- API result wiring is tested, but a live Classroom conversation accepting a real garment clip is still an acceptance test.

## Next steps / acceptance

Review this branch, verify target deployment media binaries/model configuration, then test a short public garment MP4/WebM in Classroom. Confirm timestamped facts versus hypotheses, rejection of inaccessible/oversized/long files, and safe failure messages. Instagram video/Reel retrieval remains separate work, not part of the completed direct-file implementation. Tasks 2 and 3 remain untouched.

## Preservation

Commit and push the validated phase and this report on the existing branch. Exact commit and push outcome are reported in chat after confirmation. Nothing is merged or deployed by these operations.
