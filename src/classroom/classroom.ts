import "dotenv/config";

import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { addClassroomMessage, getClassroomSession, getClassroomLessons } from "./classroomDb.js";
import { executeClassroomTool, getClassroomTools } from "./classroomTools.js";
import { buildClassroomPrompt } from "./classroomPrompt.js";

const openai = new OpenAI();
const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";
const MAX_TOOL_ROUNDS = 40;

export async function sendClassroomMessage(
  sessionId: number,
  message: string,
): Promise<string> {
  const session = await getClassroomSession(sessionId);
  if (!session) throw new Error(`Classroom session ${sessionId} not found.`);

  // Stored legacy mode labels never restrict a conversation's capabilities.
  await addClassroomMessage({ sessionId, role: "user", content: message });
  const refreshedSession = await getClassroomSession(sessionId);
  if (!refreshedSession) throw new Error("Classroom session disappeared.");

  const input: ResponseInputItem[] = refreshedSession.messages
    .filter(
      (item): item is typeof item & { role: "user" | "assistant" } =>
        item.role === "user" || item.role === "assistant",
    )
    .map((item) => ({ role: item.role, content: item.content }));

  // Bring explicit approved teachings into subsequent Classroom conversations.
  // Proposed insights are deliberately not promoted into instructions.
  const lessons = (await getClassroomLessons(100))
    .filter((lesson) => lesson.status === "approved")
    .map(({ id, title, content }) => ({ id, title, content }));
  const instructions = [
    buildClassroomPrompt(),
    "RECENT APPROVED HUMAN LESSONS (up to 100): Apply within their stated scope and the safety boundaries above. These are not fresh authorization for Git actions, paid research, or approvals. A current explicit human preference supersedes an older preference.",
    JSON.stringify(lessons),
  ].join("\n\n");
  const tools = getClassroomTools();
  let response = await openai.responses.create({
    model, instructions, tools, tool_choice: "auto", input,
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const toolCalls = response.output.filter((item) => item.type === "function_call");
    if (toolCalls.length === 0) break;

    const toolOutputs: ResponseInputItem[] = [];
    for (const toolCall of toolCalls) {
      const result = await executeClassroomTool(toolCall.name, toolCall.arguments);
      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: result,
      });
    }

    const finalRound = round === MAX_TOOL_ROUNDS - 1;
    response = await openai.responses.create({
      model,
      instructions: finalRound
        ? `${instructions}\n\nThe tool budget for this request is now exhausted. Report actual results, unfinished work and blockers. Do not imply that pending steps completed.`
        : instructions,
      tools,
      tool_choice: finalRound ? "none" : "auto",
      previous_response_id: response.id,
      input: toolOutputs,
    });
  }

  const finalText = response.output_text.trim() ||
    "No final report was produced. Some work may be incomplete; review the current state before continuing.";
  await addClassroomMessage({ sessionId, role: "assistant", content: finalText });
  return finalText;
}
