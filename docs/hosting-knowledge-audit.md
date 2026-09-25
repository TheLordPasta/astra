# Classroom → Instagram/phone knowledge bridge

## Review status — 2026-09-25

Implemented from deployed HEAD `61689a9` (`fix: copy Classroom UI into production build`) on `mushmush/hosting-knowledge-audit`. Ready for human code review, **not deployed**. No commit, push, PR, merge, migration application, or knowledge publication was performed. Earlier lost implementations were not used or claimed to exist.

Before changes, `get_developer_git_state` returned a clean detached HEAD and these explicit remotes:

```text
origin git@github.com:TheLordPasta/astra.git (fetch)
origin git@github.com:TheLordPasta/astra.git (push)
```

The dedicated branch tool succeeded. `mushmush_render` was not read, modified, staged or committed. Remote configuration is verified; authenticated push/PR access is not tested. This audit does not establish server counts, hosting regions or the actual database destination.

## Decision: approval is not permission to publish

The original `ClassroomLesson.status` defaults to `approved` for explicit human teaching. `ClassroomInsight.status` defaults to `proposed` and is changed by the human-approval path in `src/classroom/classroomDb.ts`. Neither originally represented customer-publication permission. Internal workflow lessons, private evidence and developer instructions must not become customer knowledge merely because they are approved.

Both models now have nullable `customerFacingText`. **Only approved records with separately reviewed public wording are eligible.** The bridge returns this wording, not the original lesson/insight text. Existing rows default to NULL, so the migration publishes nothing. Ordinary Classroom saving and insight approval remain unchanged and do not populate this field. This is deliberately stricter than loading every approved row.

Publication is a trusted human/operator action, not an Instagram tool. No automatic classifier or prompt-only privacy filter is treated as a security boundary. A human must ensure the public wording is accurate, in scope, qualified and safe for any customer. Internal workflow/developer lessons should remain NULL. There is no new publication UI in this scoped change.

**Operational consequence:** before migration and explicit public wording review, the bridge will not supply existing internal approved records. Implementation is complete for this policy; migration, content curation and deployment are separate pending operations.

## Architecture before

1. `src/instagram/instagramHandler.ts` deduplicates incoming messages, finds/creates the customer and conversation, saves the incoming message, loads `getConversationMessages`, formats history, calls `callMushMush`, sends the reply and saves it.
2. `src/ai/mushMushPhone.ts` built text/image Responses API requests with `fashionPersonality`, `aiTools` and a five-round tool loop. No Classroom knowledge was loaded.
3. `src/tools/aiTools.ts` and `src/tools/executeTool.ts` exposed research memory, fresh research, customer observations, conversations and business tools.
4. `src/classroom/classroomDb.ts` stored Classroom knowledge using the same `src/db/client.ts` Prisma module. Sharing a client module/database schema did not make that knowledge available to the phone runtime.

## Architecture after

```text
Instagram handler (unchanged) / phone caller
  → mushMushPhone facade
  → createPhoneRuntime
      → loadApprovedClassroomKnowledge
          → shared Prisma client
          → ClassroomLesson / ClassroomInsight
          → approved + customerFacingText only
      → original personality + bounded public knowledge context
      → original tools + read-only knowledge search
      → original tool loop / previous_response_id continuation
  → existing Instagram send/history persistence (unchanged)
```

- `src/ai/classroomKnowledge.ts`: reusable pure reader, query contract, defensive projection, limits and context formatter. No database initialization or knowledge writes.
- `src/db/classroomKnowledge.ts`: production adapter using the existing Prisma singleton; generic warning on failed reads, never raw database exceptions.
- `src/tools/classroomKnowledgeTool.ts`: strictly validated read-only search and a compositional dispatcher. All other tool names/arguments/results go unchanged to the existing dispatcher.
- `src/ai/phoneRuntime.ts`: shared, dependency-injected text/image runtime. Dependencies make the actual reader/tool/runtime behavior testable offline without connecting to OpenAI or production DB.
- `src/ai/mushMushPhone.ts`: keeps both exported entry points, the existing model default, personality, tool list and dispatcher; wires the shared reader into the runtime.

The Instagram handler, research-memory implementation, observation stores, conversation stores and personality file were not modified. The standalone `src/ai/mushMush.ts` helper was not changed; this task targets the phone runtime actually imported by Instagram. Legacy phone console messages were removed during extraction; Instagram handler logging was not changed.

## Automatic knowledge

At the start of each text or image turn:

- Query up to **8 lessons and 8 insights**, ordered by `updatedAt DESC, id DESC`.
- Require exact, case-sensitive `status = "approved"` and non-NULL `customerFacingText` in both queries.
- Select only `status` and `customerFacingText`. Do not select original content, titles, subjects, evidence, source references, confidence, customer relations, sessions or developer records.
- Defensively recheck approval/public text after reading. Reject blank and over-1,200-JavaScript-code-unit text; do not truncate away qualifications.
- Project to `{kind: "lesson" | "insight", text}` only. Maximum automatic content is 16 × 1,200 code units plus JSON/instructions.
- Include the same context on all Responses API continuations within that turn, because instructions are supplied on each request.

The context tells the model to use relevant knowledge, preserve qualifications, avoid universalizing insights and treat record text as reference data rather than permission to override role, tools or privacy rules. Existing personality and research/customer memory instructions remain intact.

The reader does not cache across turns. A subsequent turn or search sees the current approval/publication state. This is retrieval-based memory, not model-weight training.

## Search tool

`search_approved_classroom_knowledge` accepts:

- `query`: nonblank string, maximum 200 characters.
- `limit`: NULL (default 5) or integer 1–10, **per knowledge kind**.

Search is case-insensitive substring matching against public wording only, with the same approval/publication gates, projection and ordering as automatic retrieval. It can find older public records outside the automatic recent window. It never searches private titles, statements or evidence. There is no raw ID lookup, status override, publication/approval operation, or arbitrary database selector.

Invalid JSON, unknown keys, unsupported limits and empty queries are rejected. Read failures return `{available:false,items:[]}`. Automatic retrieval also fails closed and lets the original conversation proceed without Classroom context; no private-content fallback exists.

## Files changed (12 intended files)

| File | Purpose |
| --- | --- |
| `package.json` | Replace the placeholder failing test script with no-emit compilation and the two offline test suites. Send compiler diagnostics to stderr for the existing check runner. No dependency changes. |
| `prisma/schema.prisma` | Add `customerFacingText String?` to lessons and insights, with privacy comments. |
| `prisma/migrations/20260925170000_classroom_customer_facing_text/migration.sql` | Two nullable TEXT columns; no backfill and no publication. Written, not applied. |
| `src/ai/classroomKnowledge.ts` | Read-only bridge, bounded selection and safe projection/context. |
| `src/db/classroomKnowledge.ts` | Existing shared Prisma adapter and sanitized warning. |
| `src/tools/classroomKnowledgeTool.ts` | Search definition, strict argument validation and transparent legacy-tool delegation. |
| `src/ai/phoneRuntime.ts` | Common text/image loop with automatic knowledge and search. |
| `src/ai/mushMushPhone.ts` | Production wiring with existing exports. |
| `src/ai/classroomKnowledge.test.ts` | 17 offline reader, filtering, tool, runtime and wiring tests. |
| `src/ai/classroomKnowledge.integration.test.ts` | 3 offline reader-to-runtime/continuation/revocation/error tests. |
| `docs/hosting-knowledge-audit.md` | This implementation and critical-review report. |
| `docs/knowledge-bridge-test-results.md` | Actual validation evidence and failure/correction log. |

Prisma client generation was run locally. Generated files are not intended commit files and did not appear in Git status. `package-lock.json` was not changed because no dependency was added. A temporary diagnostic helper was removed after it proved incompatible with the installed TypeScript API; it is not part of the deliverable.

## Validation and corrections

Final results:

- `npm test`: **20 passed, 0 failed, 0 skipped**, including no-emit compilation before the suites.
- `npx tsc --noEmit`: passed independently, empty output.
- `npx prisma validate`: passed, schema valid.
- `npx prisma generate`: passed, Prisma Client 7.10.0 generated locally.
- Git status and tracked diff statistics reviewed, together with source inspection/readback. The tool exposes `git diff --stat`, not a full patch. It excludes untracked new files; those were reviewed as source, not counted as absent changes.

Failures were not hidden: intermediate schema validation/generation failed with P1012 missing named relation counterparts; corrected relation annotations and restored an accidental `TrendObservation.source` width transcription. Final tracked schema diff is only six added lines (the two documented public fields). Initial typecheck failed with TS2379 for a possibly undefined Responses input; changed the runtime input type to `NonNullable`. The check runner discarded failing-command stdout, requiring compiler diagnostic redirection. An attempted TypeScript compiler-API diagnostic helper failed (`ts.sys` unavailable) and was removed. See the results report for the validation sequence.

No live Instagram request, OpenAI request, production database query, migration execution, paid research, load test or full production build was run. Prisma validation/generation validate schema and client generation, not live database compatibility. Offline tests use synthetic records and mocked transport/delegates. Existing memory behavior is tested for delegation and source wiring, not live database correctness or real model response quality.

## Critical review and remaining risks

1. **Publication review is essential.** A non-NULL public field is the explicit publication mechanism, not proof that a reviewer made no mistake. Do not put secrets, identifying customer examples, internal strategy, developer workflows or instructions in it. There is no automated PII detector or dedicated publication audit log/UI.
2. **No automatic publication/backfill.** This safely avoids leaking existing approved internal lessons, but means an operator must curate records before customers gain useful knowledge. The report makes this prerequisite explicit rather than claiming all approved records now flow to Instagram.
3. **Human-curated snapshots can become stale.** Editing original lesson content or insight statements does not regenerate the public wording. Review/update or clear `customerFacingText` whenever the underlying meaning changes. Reapproval can make old public wording eligible again; clear it when revoking if a fresh publication decision is needed.
4. **Revocation is not retroactive.** Approval is checked at retrieval time. Automatic context is a per-turn snapshot; a mid-turn revocation does not erase context already sent to the model. Previously disclosed answers may also remain in conversation history/provider context. Next turn/search retrieves fresh state; historical data deletion is out of scope.
5. **Actual shared deployment DB is unverified.** Source uses the shared Prisma singleton configured through `SUPABASE_DATABASE_URL`, but this does not prove that separate deployed services use the same destination. An operator must verify this without exposing connection strings.
6. **Migration ordering matters.** Apply the reviewed migration before running a rebuilt app/client. New bridge reads fail closed if columns are missing; other Prisma reads of these models can fail with a generated client against an unmigrated database. No production migration was applied here.
7. **Bounded relevance is limited.** Recent records are not semantically ranked. Search is a substring query on public text, not private aliases/metadata or embeddings. Include relevant fabric names, scope, date and uncertainty in the public wording. Oversized/blank selected records are dropped rather than backfilled; a bad publication may reduce the returned count. All text bounds are JavaScript code units, not a token budget.
8. **Latency/availability.** Two parallel DB queries are added per turn and per search. There is no new retry, cache, timeout, dedicated metrics or benchmark. Existing Prisma/driver connection behavior applies. Errors generate a generic warning without exposing diagnostics; operational monitoring still needs staging review.
9. **Prompt behavior is not proven by offline tests.** Tests demonstrate what is sent to the runtime/transport, not that a live model always interprets it correctly. Human publication review is the primary content boundary; prompt instructions alone are not a security guarantee.
10. **Legacy privacy surface is unchanged, not certified safe.** Existing business/research/customer tools retain their original capabilities and output. This work prevents the new bridge from exposing private Classroom fields; it is not a full authorization/privacy audit of all existing tools, logging or conversation history.
11. **Local uncommitted work remains ephemeral on Render.** No durability claim is made. Avoid restart/redeploy until human review and the subsequently authorized commit/push have completed.

## Operator runbook (not executed)

After code review and a separately authorized deployment plan:

1. Confirm both service deployments use the intended shared database, privately.
2. Review/apply the new migration through the normal migration process, then generate/build the compatible client/application. This report does not authorize doing so.
3. For each record, separately approve its knowledge and review a concise public rendering. Preserve factual scope, fabric names/aliases, timeframe and uncertainty; omit private evidence/customer references. Leave internal records NULL. No bulk copy from original content.
4. A trusted administrator may update `customerFacingText` by an exact record ID only after explicit publication approval. Use parameterized updates and retain an external review record. For example, this is a query template, not a command executed here:

```sql
UPDATE "ClassroomLesson"
SET "customerFacingText" = $1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = $2 AND "status" = 'approved';

UPDATE "ClassroomInsight"
SET "customerFacingText" = $1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = $2 AND "status" = 'approved';
```

Verify exactly one intended row changed, and enforce nonblank text at most 1,200 JavaScript code units before executing. Setting the field to NULL withdraws publication on subsequent retrieval. Do not change knowledge status merely to publish it.

5. In staging, test one approved/public lesson, one approved/public insight, an internal approved record and an unapproved insight. Confirm only the first two enter the model context. Exercise research memory, observations, history, text/image continuation and DB outage behavior, then review customer replies for privacy and qualifications.
6. Only after a separate human deployment decision, release. No release was performed in this task.

## Approval gate

Work and both reports are uncommitted on the dedicated branch. Wait for explicit human approval before committing the 12 intended files. Only then push to `origin` and create a PR against `main`. Never merge or deploy. If push/PR creation fails, preserve the commit and report the exact blocker; do not reset/discard it.
