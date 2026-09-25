# Knowledge bridge — actual validation results

Date: 2026-09-25. Branch: `mushmush/hosting-knowledge-audit`. Starting deployed commit: `61689a9`.

## Final executed checks

| Check | Actual result |
| --- | --- |
| `npm test` | PASS: no-emit compilation followed by 20 offline tests, 20 pass, 0 fail, 0 skipped/cancelled/todo. |
| `npx tsc --noEmit` | PASS independently; successful check, empty output. |
| `npx prisma validate` | PASS: `The schema at prisma/schema.prisma is valid`. |
| `npx prisma generate` | PASS: `Generated Prisma Client (7.10.0) to ./src/generated/prisma in 1.34s`. |
| Git state | Dedicated branch, latest commit remains `61689a9`; explicit origin fetch/push URLs present. Intended edits/new files uncommitted. |
| `git diff --stat` via check tool | 3 tracked files, 20 insertions, 111 deletions. New files are untracked and therefore excluded from this command. Reviewed new source files separately. |

Final `npm test` command:

```text
tsc --noEmit 1>&2 && tsx --test src/ai/classroomKnowledge.test.ts src/ai/classroomKnowledge.integration.test.ts
```

Compiler stdout is redirected to stderr because the current Classroom check runner otherwise omits diagnostics when a subprocess exits unsuccessfully. No dependencies were added.

## Final observed test output

The following names/counts are from the successful check output (per-test timings omitted):

```text
✔ reader-to-runtime integration excludes internal and unapproved records in automatic and tool context
✔ next phone turn reloads approval rather than reusing old automatic knowledge
✔ failed read-only search exposes no exception details and does not call legacy tools
✔ approved lessons and approved insights are retrievable with public wording only
✔ proposed rejected pending and unknown statuses never qualify, even with public text
✔ approval alone does not publish internal lessons or insights
✔ defensive output filter excludes unapproved, blank, oversized and unpublished rows
✔ automatic retrieval is recent and bounded per kind; search reaches older public records
✔ search operates only on public wording, not internal titles or evidence
✔ each retrieval observes changed approval and revoked publication without cache
✔ database failure is fail-closed, generic and does not leak error details
✔ invalid reader bounds reject before touching the database
✔ read-only tool validates strict arguments and rejects attempted status override
✔ legacy research, observation and conversation tools delegate unchanged
✔ text/Instagram runtime loads both knowledge kinds and preserves tools and continuation
✔ image runtime loads both knowledge kinds and preserves tools and continuation
✔ runtime continues safely when knowledge is unavailable
✔ runtime keeps the original five-round tool limit
✔ instructions delimit reference data and preserve existing personality
✔ production wiring points Instagram to shared runtime and existing memory definitions
ℹ tests 20
ℹ suites 0
ℹ pass 20
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1959.160164
```

## What the tests establish

- Both knowledge kinds can be retrieved when approved and explicitly published through reviewed public wording.
- Query contracts require approved status and non-NULL public wording, use minimal selection and bounded recent ordering.
- Defensive projection still excludes unauthorized rows if a mock delegate returns them despite filtering.
- Private content/title/subject/evidence/customer relation fixture fields never enter bridge output.
- Proposed, rejected, pending, unknown and differently cased statuses are excluded; approval without publication is also excluded.
- Read-only tool arguments cannot override status/selection. Private fields are not searched.
- The actual phone runtime builder receives automatic lesson and insight context for text and image, includes it in continuations and keeps input/history and tool results intact.
- The real reader, search wrapper and runtime are exercised together in offline integration tests; only DB delegates/OpenAI transport are mocked.
- The next turn reloads approval, and database/tool exceptions do not leak private diagnostic fixture strings.
- Existing research-memory/observation/conversation tool names, raw arguments and return values are delegated unchanged. Source-level assertions verify production Instagram→phone wiring and existing memory definitions.

## Failures encountered and corrections

1. **Intermediate Prisma schema validation and generation failed.** Both returned P1012 with four missing opposite-relation-field errors on the Classroom insight/customer-observation relation. Corrected the named relation annotations. Also restored `TrendObservation.source` to its original `VarChar(500)` after an intermediate transcription error. Final tracked schema statistics show only the six lines adding the two public-text fields/comments; no relation or research-schema change remains. Prisma validation and generation subsequently passed.
2. **First independent typecheck failed without visible diagnostic text.** The tool returned only `Command failed: npx tsc --noEmit`. This was not treated as a pass.
3. **Diagnostic-helper attempt failed.** A temporary compiler-API test was tried to surface diagnostics; the node test wrapper still did not expose the failure details through this tool. A direct helper then failed with `TypeError: Cannot read properties of undefined (reading 'fileExists')` because the installed TypeScript API did not provide `ts.sys`. The helper was removed. No TypeScript dependency upgrade or test suppression was made.
4. **Compiler diagnostics recovered via the standard CLI.** The test command redirected `tsc --noEmit` output to stderr. It revealed TS2379 at `src/ai/phoneRuntime.ts`: an optional Responses `input` type admitted undefined under `exactOptionalPropertyTypes`. The runtime input is now `NonNullable<ResponseCreateParamsNonStreaming["input"]>` because both public entry points always supply input. Typecheck subsequently passed.
5. **Offline test sequence.** The original 17 behavioral tests passed before the typecheck correction. After correction, independent typecheck, the 17 tests and Prisma validation passed. Three reader-to-runtime integration tests were then added. Final independent typecheck and the expanded 20-test suite passed. No assertions were removed or weakened to obtain the final pass.

## Review of change scope

The tracked diff-stat result was:

```text
 package.json            |   2 +-
 prisma/schema.prisma    |   6 +++
 src/ai/mushMushPhone.ts | 123 +++++-------------------------------------------
 3 files changed, 20 insertions(+), 111 deletions(-)
```

The phone deletion count reflects moving the duplicated text/image tool loops into the new shared `src/ai/phoneRuntime.ts`, not removing conversation/tool functionality. Git status and source readback were also used to review new files. The available diff check reports statistics only; it is not a full patch review tool.

## Explicitly not performed

- No live Instagram webhook/send test.
- No OpenAI API call or model-output privacy/quality evaluation.
- No production/staging database reads or writes for bridge validation.
- No migration application, data publication or database destination verification.
- No full production build, deployment, benchmark, load test or full legacy integration suite.
- No secret-file access, staging, commit, push, PR or merge.

Prisma validation/client generation are not database validation. Synthetic in-memory filtering is not proof of PostgreSQL execution performance/collation. Source-wiring checks are not live Instagram integration. Existing memory/database correctness beyond transparent dispatcher delegation remains unverified.

See `docs/hosting-knowledge-audit.md` for architecture, the deliberate publication gate, migration/content-review prerequisites, revocation timing, legacy privacy limitations and remaining operational risks.
