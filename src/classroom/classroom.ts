import "dotenv/config";

import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

import { addClassroomMessage, getClassroomSession } from "./classroomDb.js";

import { executeClassroomTool, getClassroomTools } from "./classroomTools.js";

import { buildClassroomPrompt } from "./classroomPrompt.js";

import type { ClassroomMode } from "./classroomTypes.js";

const openai = new OpenAI();

const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

export async function sendClassroomMessage(
  sessionId: number,
  mode: ClassroomMode,
  message: string,
): Promise<string> {
  const session = await getClassroomSession(sessionId);

  if (!session) {
    throw new Error(`Classroom session ${sessionId} not found.`);
  }

  if (session.mode !== mode) {
    throw new Error(
      `Session mode is ${session.mode}, but request used ${mode}.`,
    );
  }

  await addClassroomMessage({
    sessionId,
    role: "user",
    content: message,
  });

  const refreshedSession = await getClassroomSession(sessionId);

  if (!refreshedSession) {
    throw new Error("Classroom session disappeared.");
  }

  const input: ResponseInputItem[] = refreshedSession.messages
    .filter(
      (
        item,
      ): item is typeof item & {
        role: "user" | "assistant";
      } => item.role === "user" || item.role === "assistant",
    )
    .map((item) => ({
      role: item.role,
      content: item.content,
    }));

  let response = await openai.responses.create({
    model,
    instructions: buildClassroomPrompt(mode),
    tools: getClassroomTools(mode),
    tool_choice: "auto",
    input,
  });

  for (let round = 0; round < 8; round++) {
    const toolCalls = response.output.filter(
      (item) => item.type === "function_call",
    );

    if (toolCalls.length === 0) {
      const finalText =
        response.output_text.trim() || "I didn't produce a response.";

      await addClassroomMessage({
        sessionId,
        role: "assistant",
        content: finalText,
      });

      return finalText;
    }

    const toolOutputs: ResponseInputItem[] = [];

    for (const toolCall of toolCalls) {
      const result = await executeClassroomTool(
        toolCall.name,
        toolCall.arguments,
      );

      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: result,
      });
    }

    response = await openai.responses.create({
      model,
      instructions: buildClassroomPrompt(mode),
      tools: getClassroomTools(mode),
      tool_choice: "auto",
      previous_response_id: response.id,
      input: toolOutputs,
    });
  }

  throw new Error("Classroom exceeded the tool-call round limit.");
}
