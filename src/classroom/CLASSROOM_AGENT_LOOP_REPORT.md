# Classroom agent-loop resilience

Scope: runtime only. Branch mushmush/classroom-agent-loop-safety from clean 6f9672f.

## Phase 1 — inspection (pushed c7ce955)
Path: classroom.ts -> classroomRuntime.ts -> runtimeSafety.safeToolCall -> classroomTools -> developer/Git dispatchers. UI: classroomHttp.ts -> ui/apiClient.js.
Inspected those sources, classroomDeveloperTools.ts, package.json and existing runtime/transport tests.
runDeveloperCheck already returns {check,success:true,output:""} for silent success. Lessons are serialized, not parsed here; no evidence of broken lessons. Legacy argument JSON.parse calls are behind safeToolCall argument validation. UI JSON.parse is already guarded. SDK decoding is inside atStage.
Loop had 40 rounds but no total call/deadline/operation bounds or preservation callback. Last-turn generation depended on a further model request.

## Phase 2 — defensive boundaries (pushed d7f3335)
runtimeSafety.ts always supplies structured object success envelopes (arrays in output); rejects primitives/null/empty/malformed serialized results; preserves exact successful compiler envelope with empty stdout. Added duplicate/blank call-ID validation, model-response string guards, HTTP status priority and SDK timeout classification.
modelTransport.ts adds bounded non-streaming HTTP JSON decoding before SDK, status-before-body handling, 8 MiB ceiling and original-cause capture.
Typecheck passed (empty stdout); 154 existing tests passed, 0 failed/skipped.

## Phase 3 — bounded loop and preservation
classroomRuntime.ts: 8 rounds, 24 total calls, 120-second execution budget, model timeout 30 seconds, tool timeout 60 seconds capped to remaining budget, bounded checkpoint 60 seconds and save 5 seconds. Limits cannot be raised/disabled by invalid overrides. Limit fallback is deterministic: no extra model response is needed to return a conversational phase-ended message. Failure notices remain visible even if the model ignores them. Repeated tool call IDs cannot replay operations.
Allowlisted run/stage/start/success/failure/count/elapsed diagnostics exclude payloads, credentials, URLs, command output and raw exception stacks.
Process-local checkout lease blocks overlapping agent loops and remains held until timed-out operations settle. A non-cooperative tool is NOT treated as cancelled; no checkpoint races an in-flight operation. Multi-process shared-checkout coordination is not implemented.
classroom.ts wires guarded transport, SDK retries disabled, real AbortSignal and tool_choice:none on the warning/final model round. Existing lesson/history behavior retained.
runtimeCheckpoint.ts snapshots clean baseline before actions. Preservation only considers paths from this run's attempted write/delete tools, on a safe mushmush branch descending from baseline. Rejects pre-existing dirty state, pre-staged/unrelated/protected paths and symlinks. Runs typecheck and tests before exact-path checkpoint; pushes without force; never resets/merges/deploys. State/path/staging checks repeated after validation. If validation, push or timeout fails, report remote preservation unconfirmed; no destructive cleanup. Initial dirty work is left untouched for human-directed preservation.
Normal completed write phases and failed model followups also attempt preservation where safe. This cannot guarantee survival of process termination mid-operation.
Phase-3 typecheck passed; existing suite 154 passed, 0 failed/skipped. New targeted tests follow next.

## Remaining
4. Regression tests for long loops, finalization, timeout leases, checkpoint guards and guarded transport.
5. Final validation/source review/diff/report.

Exact intermittent production cause remains unconfirmed. Existing fixtures reproduce unguarded empty/truncated JSON errors; compiler silence is valid. No live model/provider/production incident reproduction. No feature work, merge or deployment.
