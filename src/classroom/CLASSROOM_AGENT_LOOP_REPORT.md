# Classroom agent-loop resilience

## Phase 1: inspected baseline
Baseline: clean detached HEAD 6f9672f; development branch mushmush/classroom-agent-loop-safety.
Only runtime resilience is in scope. No Instagram/video/trend/handoff changes.

Inspected classroom.ts -> classroomRuntime.ts -> safeToolCall in runtimeSafety.ts -> executeClassroomTool in classroomTools.ts -> developer dispatchers and runDeveloperCheck in classroomGit.ts. Inspected classroomHttp.ts, ui/apiClient.js, existing runtime/transport tests, and package.json.

Findings:
- runDeveloperCheck already returns {check, success:true, output:""} for a silent successful compiler. Empty stdout is NOT an empty tool response.
- Lessons are JSON.stringify'd into instructions; no evidence of malformed lessons.
- Tool argument JSON.parse sites in classroomTools.ts, classroomDeveloperTools.ts and classroomGit.ts sit behind safeToolCall argument validation; legacy dispatcher catches lose failure stages and sometimes retain raw error messages.
- safeToolCall checks serialized results but permits arbitrary JSON primitives/arrays, and the exported dispatcher itself lacks the same normalized contract.
- UI apiClient.js already reads text and guards JSON.parse. classroomHttp.ts already catches route exceptions. OpenAI SDK decoding happens inside atStage, not response.json in the agent loop.
- Loop has 40 rounds but no total call limit, deadline, per-operation timeout or preservation callback. Final generation relies on another provider response. No correlation diagnostics for successful intermediate stages.
- Existing tests reproduce empty/truncated HTTP JSON, but do not establish the cause of the intermittent production incident. No production root-cause claim is justified.

## Planned phases
2. Normalize tool envelopes, strengthen model transport parsing and sanitized diagnostics.
3. Bound rounds/calls/time and final generation; best-effort safe checkpoint of this run's validated writes only, never unrelated work; report preservation failures honestly.
4. Add targeted regression tests.
5. Run typecheck/tests, review changed sources/diff and record actual results.

No implementation changes or new validation results at phase 1. This report is the inspection checkpoint, not a claim of a completed fix.
