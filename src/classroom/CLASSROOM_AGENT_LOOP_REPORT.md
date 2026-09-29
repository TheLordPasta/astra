# Classroom agent-loop resilience

Scope: runtime only. Branch mushmush/classroom-agent-loop-safety from clean 6f9672f.

## Phase 1 — inspection (pushed c7ce955)
Path: classroom.ts -> classroomRuntime.ts -> runtimeSafety.safeToolCall -> classroomTools -> developer/Git dispatchers. UI: classroomHttp.ts -> ui/apiClient.js.
Inspected those sources, classroomDeveloperTools.ts, package.json and existing runtime/transport tests.
runDeveloperCheck already returns {check,success:true,output:""} for silent success. Lessons are serialized, not parsed here; no evidence of broken lessons. Legacy argument JSON.parse calls are behind safeToolCall argument validation. Dispatcher exceptions are sanitized at the outer boundary. UI JSON.parse is already guarded. SDK decoding is inside atStage.
Loop had 40 rounds but no total call/deadline/operation bounds or preservation callback. Last-turn generation depended on a further model request.

## Phase 2 — defensive boundaries
runtimeSafety.ts now always supplies structured object success envelopes (arrays in output); rejects primitives/null/empty/malformed serialized results; preserves exact successful compiler envelope with empty stdout. Added duplicate/blank call-ID validation and string model-response guards. HTTP failure takes precedence over empty/broken error body; timeout classification includes SDK timeout errors.
modelTransport.ts adds bounded non-streaming HTTP JSON decoding before the SDK, status-before-body handling, an 8 MiB response ceiling, stage-specific failures and original-cause capture. Integration into the model loop follows in phase 3.
Validation at this phase: typecheck passed (empty compiler stdout); existing suite 154 passed, 0 failed, 0 skipped. No live provider calls. New targeted regression tests follow in phase 4.

## Remaining phases
3. Wire guarded transport, bounded loop and safe preservation.
4. Regression tests for long-loop/finalization and transport failures.
5. Final validation/source review/diff/report.

Exact intermittent production cause remains unconfirmed. Existing fixture tests reproduce unguarded empty/truncated JSON failure; silence from a successful compiler is not evidence of bad JSON. No feature work, merge or deployment.
