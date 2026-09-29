import "dotenv/config";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import {
  addClassroomMessage,
  getClassroomSession,
  getClassroomLessons,
} from "./classroomDb.js";
import { executeClassroomTool, getClassroomTools } from "./classroomTools.js";
import { buildClassroomPrompt } from "./classroomPrompt.js";
import { atStage, failureReport } from "./runtimeSafety.js";
import { runClassroomRuntime } from "./classroomRuntime.js";

const openai = new OpenAI({ maxRetries: 0 });
const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

export async function sendClassroomMessage(
  sessionId: number,
  message: string,
): Promise<string> {
  try {
    const session = await atStage("database.session_load", () =>
      getClassroomSession(sessionId),
    );
    if (!session) throw new Error("Classroom session not found.");
    // Legacy mode labels never restrict capabilities.
    await atStage("database.user_save", () =>
      addClassroomMessage({ sessionId, role: "user", content: message }),
    );
    const refreshed = await atStage("database.history_load", () =>
      getClassroomSession(sessionId),
    );
    if (!refreshed) throw new Error("Classroom session disappeared.");
    const input: ResponseInputItem[] = refreshed.messages
      .filter(
        (item): item is typeof item & { role: "user" | "assistant" } =>
          item.role === "user" || item.role === "assistant",
      )
      .map((item) => ({ role: item.role, content: item.content }));
    const lessons = (
      await atStage("database.lessons_load", () => getClassroomLessons(100))
    )
      .filter((lesson) => lesson.status === "approved")
      .map(({ id, title, content }) => ({ id, title, content }));
    const instructions = [
      buildClassroomPrompt(),

      `DEVELOPMENT EXECUTION RULES:

Work actively and autonomously within the bounded tool budget.

The goal of each development turn is to complete one meaningful implementation milestone, not merely inspect or plan.

Normal development problems are not blockers:
- repository read failures
- file-list/search failures
- compiler errors
- failing tests
- ordinary implementation bugs
- validation failures caused by your own changes

For READ-ONLY operations such as reading files, listing files, searching source, Git inspection, or validation queries:
- a single failure is NOT a blocker
- retry once when safe
- if it fails again, use another available read-only method
- if the missing information is non-essential, continue using the verified information already available

For CODE/VALIDATION failures:
- inspect the actual error
- fix problems caused by your implementation
- rerun the relevant check
- continue while useful work remains within the turn budget

For MUTATING operations such as file writes, deletes, commits, pushes, PR creation, database writes, or research jobs:
- do not blindly replay an operation when its completion state is uncertain
- inspect current state before retrying

Do not restart a task from scratch because one operation failed.

Do not stop immediately after inspection when safe implementation work can still be completed.

Stop only when:
1. one meaningful implementation milestone has been completed and validated,
2. the bounded tool budget is exhausted,
3. or a genuine blocker remains after reasonable recovery.

A genuine blocker means progress requires unavailable credentials, permissions, external information, destructive authorization, or tooling that does not exist. A failed command by itself is not a blocker.

When stopping because more work remains, clearly state what was completed and what the next implementation phase is.`,

      "RECENT APPROVED HUMAN LESSONS (up to 100): Apply within their stated scope and the safety boundaries above. These are not fresh authorization for Git actions, paid research, or approvals. A current explicit human preference supersedes an older preference.",

      JSON.stringify(lessons),

      `RUNTIME FAILURE RECOVERY:

If a tool returns CLASSROOM_RUNTIME_FAILURE, inspect its stage and kind.

Read-only failures may be retried once or recovered through another read-only method.

Do not automatically retry potentially mutating operations when their completion state is uncertain; inspect current state first.

Never claim an operation succeeded without evidence.`,
    ].join("\n\n");

    const tools = getClassroomTools();
    return await runClassroomRuntime({
      allowedNames: new Set(tools.map((tool) => tool.name)),
      execute: executeClassroomTool,
      save: (content) =>
        addClassroomMessage({ sessionId, role: "assistant", content }),
      model: (previousId, outputs, finalRound) =>
        openai.responses.create({
          model,
          tools,
          instructions: finalRound
            ? `${instructions}\n\nThe tool budget for this request is now exhausted. Report actual results, unfinished work and blockers. Do not imply that pending steps completed.`
            : instructions,
          tool_choice: finalRound ? "none" : "auto",
          ...(previousId ? { previous_response_id: previousId } : {}),
          input: previousId ? outputs : input,
        }),
    });
  } catch (error) {
    const text = failureReport(error, "classroom.prepare").message;
    try {
      await addClassroomMessage({
        sessionId,
        role: "assistant",
        content: text,
      });
    } catch (saveError) {
      failureReport(saveError, "database.failure_save");
    }
    return text;
  }
}
