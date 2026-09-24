# Context-driven Classroom review

## Scope

Classroom-only changes: one conversation supports teaching, learning, research,
review, and development without selecting a mode. Customer-facing engine files
and database schemas are not changed by this implementation.

- Remove mode selection from the UI and mode-based tool restrictions.
- Keep legacy database mode metadata for compatibility; it does not route work.
- Preserve existing conversations and automatically create a first conversation.
- Load up to 100 recent approved human lessons into Classroom instructions.
- Require context-sensitive authorization and factual reports after actions.
- Execute tool calls through a bounded loop with a final progress report.
- Render messages as plain text, including untrusted content.
- Prevent overlapping turns within a conversation in one server process and
  ignore stale client responses after locking the workspace.

## Validation status at submission

- Inspected all six modified implementation files, Classroom database helpers,
  existing styles, dependencies, TypeScript configuration, and check-runner code.
- Git status and diff summary succeeded. The available git_diff check returns
  only `git diff --stat`; it does not provide a full patch review.
- Typecheck: attempted, but the runner returned `spawn EINVAL` before compiler
  diagnostics were available. This is NOT a passing typecheck.
- Tests: attempted, but the runner returned `spawn EINVAL`. The current package
  test script is a placeholder that exits with an error; no test suite passed.
- Browser, API integration, database compatibility, and model-behavior tests
  have not been executed. No browser test tool is available in this workspace.
- No database migration or deployment was performed.

The existing check runner invokes Windows npm/npx `.cmd` files through execFile;
this is a likely cause of the launch error. The runner was not modified as part
of this submission. Run the checks in a supported local environment before merge.

## Human verification before merge

1. Run `npx tsc --noEmit` and resolve any diagnostics.
2. Start Classroom using the project's existing private configuration; do not
   commit keys or environment files.
3. Confirm missing/incorrect credentials cannot access any data API.
4. Open existing conversations with different legacy modes; verify history is
   preserved and the interface presents no mode picker.
5. Send a first message with no existing conversation; verify automatic creation.
6. In one thread, teach a fabric alias, request stored evidence, and request a
   code review without implementation. Verify the appropriate tools are used
   and no unauthorized writes, research, or approvals occur.
7. Verify a fresh research request with missing scope prompts for clarification.
8. Check English preference, Hebrew text display, multiline messages, narrow
   screens, navigation, context panel, keyboard controls, and locking.
9. Test overlapping sends and API failures; verify the UI warns that work may
   already have completed rather than silently retrying.
10. Verify lessons remain approved knowledge while proposed insights still
    require explicit approval of the specific item.

## Known boundaries

- Concurrent-turn protection is in-process, not distributed across server instances.
- Conversation history stores user/assistant text, not a durable tool-call audit.
- Loaded lessons are limited to the most recent 100 records.
- Messages render as safe plain text, not rich Markdown.
- This is a review submission, not evidence that behavioral tests passed.
- Human review is required. Do not automatically merge or deploy.
