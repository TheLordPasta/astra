import type { Response, ResponseCreateParamsNonStreaming, Tool } from "openai/resources/responses/responses";
import { knowledgeInstructions } from "./classroomKnowledge.js";
import type { KnowledgeLoader, KnowledgeResult } from "./classroomKnowledge.js";
import { classroomKnowledgeTool, withClassroomKnowledgeTool } from "../tools/classroomKnowledgeTool.js";

export interface PhoneRuntimeDependencies {
  createResponse: (params: ResponseCreateParamsNonStreaming) => Promise<Response>;
  model: string;
  personality: string;
  tools: Tool[];
  executeTool: (name: string, raw: string) => Promise<string>;
  loadKnowledge: KnowledgeLoader;
}

// Shared by text and image callers; Instagram continues to call the phone facade.
// Dependency injection permits offline behavior tests without OpenAI or a database.
export function createPhoneRuntime(deps: PhoneRuntimeDependencies) {
  const tools = [...deps.tools, classroomKnowledgeTool];
  const execute = withClassroomKnowledgeTool(deps.executeTool, deps.loadKnowledge);

  async function run(input: NonNullable<ResponseCreateParamsNonStreaming["input"]>, image: boolean): Promise<string> {
    let knowledge: KnowledgeResult;
    try {
      knowledge = await deps.loadKnowledge();
    } catch {
      knowledge = { available: false, items: [] };
    }
    const instructions = knowledgeInstructions(deps.personality, knowledge);
    let response = await deps.createResponse({ model: deps.model, instructions, tools, input });

    for (let round = 0; round < 5; round++) {
      const toolCalls = response.output.filter((item) => item.type === "function_call");
      if (toolCalls.length === 0) return response.output_text;
      const toolOutputs = [];
      for (const toolCall of toolCalls) {
        toolOutputs.push({
          type: "function_call_output" as const,
          call_id: toolCall.call_id,
          output: await execute(toolCall.name, toolCall.arguments),
        });
      }
      response = await deps.createResponse({
        model: deps.model, instructions, tools,
        previous_response_id: response.id, input: toolOutputs,
      });
    }
    throw new Error(image ? "Mush Mush exceeded the image tool-call limit." : "Mush Mush exceeded the tool-call limit.");
  }

  return {
    callMushMush: (input: string) => run(input, false),
    callMushMushWithImage: (text: string, imageUrl: string) => run([
      { role: "user", content: [
        { type: "input_text", text },
        { type: "input_image", image_url: imageUrl, detail: "high" },
      ] },
    ], true),
  };
}
