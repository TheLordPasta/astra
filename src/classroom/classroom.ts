import "dotenv/config";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { addClassroomMessage, getClassroomSession, getClassroomLessons } from "./classroomDb.js";
import { executeClassroomTool, getClassroomTools } from "./classroomTools.js";
import { buildClassroomPrompt } from "./classroomPrompt.js";
import { atStage, failureReport } from "./runtimeSafety.js";
import { runClassroomRuntime } from "./classroomRuntime.js";

const openai = new OpenAI({ maxRetries: 0 });
const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

export async function sendClassroomMessage(sessionId: number, message: string): Promise<string> {
  try {
    const session = await atStage("database.session_load", () => getClassroomSession(sessionId));
    if (!session) throw new Error("Classroom session not found.");
    // Legacy mode labels never restrict capabilities.
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
      "If a tool returns CLASSROOM_RUNTIME_FAILURE, explain its stage and reference conversationally. Never claim the operation succeeded. Do not automatically repeat a potentially mutating operation; inspect current state first."
    ].join("\n\n");
    const tools = getClassroomTools();
    return await runClassroomRuntime({
      allowedNames: new Set(tools.map(tool => tool.name)),
      execute: executeClassroomTool,
      save: content => addClassroomMessage({ sessionId, role: "assistant", content }),
      model: (previousId, outputs, finalRound) => openai.responses.create({
        model, tools,
        instructions: finalRound ? `${instructions}\n\nThe tool budget for this request is now exhausted. Report actual results, unfinished work and blockers. Do not imply that pending steps completed.` : instructions,
        tool_choice: finalRound ? "none" : "auto",
        ...(previousId ? { previous_response_id: previousId } : {}),
        input: previousId ? outputs : input,
      }),
    });
  } catch (error) {
    const text = failureReport(error, "classroom.prepare").message;
    try { await addClassroomMessage({ sessionId, role: "assistant", content: text }); }
    catch (saveError) { failureReport(saveError, "database.failure_save"); }
    return text;
  }
}
