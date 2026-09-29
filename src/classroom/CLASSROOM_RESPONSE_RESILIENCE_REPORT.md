# Classroom response resilience

## Scope and findings
Branch: `mushmush/classroom-response-resilience`.

Prevent raw response-parsing exceptions from reaching the Classroom interface; retain useful stage diagnostics without recording payloads or credentials. Video, handoff, and advanced trend work are outside this change.

Tests reproduce SyntaxError from unguarded response.json() on empty, malformed and truncated bodies. Valid lessons followed by a failed message/model response are separately covered. This establishes a reproducible failure mechanism, NOT the exact origin of the intermittent production incident. No evidence establishes that the lessons payload is malformed. Production transport/provider logs are still needed to identify the original incident.

## Implementation and files
- `src/classroom/runtimeSafety.ts`: guarded JSON parsing, HTTP/body handling, model-envelope validation, registered-tool argument/result validation, failure normalization, allowlisted stage/kind/status/body-length diagnostics and reference IDs. Never logs raw error messages, payloads, URLs, headers or arguments through these failure helpers.
- `src/classroom/classroomRuntime.ts`: staged model/tool loop, conversational failures, no automatic tool replay, best-effort assistant persistence, preserves returned content on save failure.
- `src/classroom/classroom.ts`: runtime wiring; stages database preparation and model work; disables SDK automatic retries.
- `src/classroom/classroomHttp.ts`: testable Fastify application with safe route/error envelopes and UI helper asset route.
- `src/classroom/classroomServer.ts`: application construction and sanitized listen failure handling.
- `src/classroom/ui/apiClient.js`: reads bodies defensively, checks HTTP status, rejects empty/invalid JSON and invalid shapes, sanitizes browser-facing errors without forwarding server payloads.
- `src/classroom/ui/app.js`: transport integration and local conversational notices; preserves returned replies rather than immediately replacing them with possibly stale stored history.
- `src/instagram/instagramGraphClient.ts`: staged read-only Meta transport, safe JSON handling, preserves numeric error codes for the existing unsupported-field fallback.
- `src/classroom/runtimeSafety.test.ts`, `src/classroom/responseTransport.test.ts`, `src/classroom/ui/apiClient.test.js`: regression coverage.
- `package.json`: includes resilience suites in the standard test command.

No database schema or migration changes. No new paid services. Interrupted potentially mutating work is not automatically replayed; notices instruct the operator to inspect current state.

## Actual final validation before submission
Re-run in this submission turn using `run_developer_check`:
- `typecheck`: success=true, output empty (silent successful `npx tsc --noEmit`).
- `test`: success=true; **154 tests, 154 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**.
- Test command: `tsc --noEmit 1>&2 && tsx --test src/ai/classroomKnowledge.test.ts src/ai/classroomKnowledge.integration.test.ts src/ai/instagramVisualResearch.test.ts src/ai/instagramVisualResearch.integration.test.ts src/ai/instagramVisualResearch.storage.test.ts src/classroom/runtimeSafety.test.ts src/classroom/responseTransport.test.ts src/classroom/ui/apiClient.test.js 1>&2`.
- Coverage includes empty/truncated/malformed bodies, non-2xx empty/HTML responses, aborted transport/tool calls, unusable/incomplete model responses, valid lessons followed by failure, persistence failures, and no automatic replay.
- SDK parsing uses the actual OpenAI SDK with fixture transport; Fastify routes run in tests; UI submit handling uses a simulated DOM. Meta/model/database dependencies use fixtures or mocks. No live provider, production proxy, real-browser acceptance, or database verification was performed.

## Review and limitations
Reviewed current runtime safety, runtime orchestration, HTTP application, server wiring, UI transport/message handling and Meta transport source during submission preparation. `git_diff` succeeded but exposes only tracked-file statistics, not patches or untracked contents. Full base-to-head patch review remains a human PR-review requirement; it is not claimed complete. Initial status identified all intended modified/untracked files; explicit commit paths exclude unrelated work.

Transport/process failure can prevent server delivery entirely. Browser notices work only if the application JavaScript is running. These changes do not guarantee recovery from process termination, unavailable infrastructure, or browser shutdown. Error helpers deliberately omit raw bodies and credentials, limiting deep diagnosis to safe stage/category metadata. Existing integrations may sanitize inner errors before they reach the outer tool wrapper.

## Submission
The human explicitly authorized committing, pushing and creating a PR. This report is prepared for that submission; actual commit/push/PR outcomes will be reported in chat after tool confirmation. No merge or deployment is authorized or performed.
