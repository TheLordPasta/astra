import "dotenv/config";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { addClassroomMessage, getClassroomSession, getClassroomLessons } from "./classroomDb.js";
import { executeClassroomTool, getClassroomTools } from "./classroomTools.js";
import { buildClassroomPrompt } from "./classroomPrompt.js";
import { atStage, failureReport } from "./runtimeSafety.js";
import { runClassroomRuntime } from "./classroomRuntime.js";
import { guardedModelFetch } from "./modelTransport.js";
import { createRuntimePreserver } from "./runtimeCheckpoint.js";

const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

export async function sendClassroomMessage(sessionId: number, message: string): Promise<string> {
  try {
    const session = await atStage("database.session_load", () => getClassroomSession(sessionId));
    if (!session) throw new Error("Classroom session not found.");
    await atStage("database.user_save", () => addClassroomMessage({ sessionId, role: "user", content: message }));
    const refreshed = await atStage("database.history_load", () => getClassroomSession(sessionId));
    if (!refreshed) throw new Error("Classroom session disappeared.");
    const input: ResponseInputItem[] = refreshed.messages
      .filter((item): item is typeof item & { role: "user" | "assistant" } => item.role === "user" || item.role === "assistant")
      .map(item => ({ role: item.role, content: item.content }));
    const lessons = (await atStage("database.lessons_load", () => getClassroomLessons(100)))
      .filter(lesson => lesson.status === "approved")
      .map(({ id, title, content }) => ({ id, title, content }));
    const instructions = [buildClassroomPrompt(),
      "RECENT APPROVED HUMAN LESSONS (up to 100): Apply within their stated scope and the safety boundaries above. These are not fresh authorization for Git actions, paid research, or approvals. A current explicit human preference supersedes an older preference.",
      JSON.stringify(lessons),
      "If a tool returns CLASSROOM_RUNTIME_FAILURE, explain its stage and reference conversationally. Never claim the operation succeeded. Do not automatically repeat a potentially mutating operation; inspect current state first.",
      "Work in small phases: this request is bounded to 8 tool rounds, 24 calls and 120 seconds plus bounded preservation/save time. Preserve validated milestones early. The runtime may checkpoint and push only this phase's validated source writes on a safe developer branch; it will never merge. A successful check with output an empty string is valid success, not a missing response."
    ].join("\n\n");
    const tools = getClassroomTools();
    const preserve = await createRuntimePreserver();
    let requestIndex = 0;
    return await runClassroomRuntime({
      allowedNames: new Set(tools.map(tool => tool.name)),
      execute: executeClassroomTool,
      save: content => addClassroomMessage({ sessionId, role: "assistant", content }),
      preserve,
      model: async (previousId, outputs, finalRound, signal) => {
        const stage = requestIndex++ === 0 ? "model.initial" : `model.followup.${requestIndex - 1}`;
        let transportFailure: unknown;
        const openai = new OpenAI({ maxRetries: 0, timeout: 30_000,
          fetch: guardedModelFetch(stage, fetch, error => { transportFailure = error; }) });
        try {
          return await openai.responses.create({
            model, tools, parallel_tool_calls: false,
            instructions: finalRound ? `${instructions}\n\nThis is the final model request for this phase. Report actual results, unfinished work and blockers; do not imply pending steps completed.` : instructions,
            tool_choice: finalRound ? "none" : "auto",
            ...(previousId ? { previous_response_id: previousId } : {}),
            input: previousId ? outputs : input,
          }, { signal });
        } catch (error) { throw transportFailure ?? error; }
      },
    });
  } catch (error) {
    const text = failureReport(error, "classroom.prepare").message;
    try { await addClassroomMessage({ sessionId, role: "assistant", content: text }); }
    catch (saveError) { failureReport(saveError, "database.failure_save"); }
    return text;
  }
}
