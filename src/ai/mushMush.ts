import "dotenv/config";
import OpenAI from "openai";

import { fashionPersonality } from "./prompts/fashionPersonality.js";
import { aiTools } from "../tools/aiTools.js";
import { executeTool } from "../tools/executeTool.js";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { ResponseInputItem } from "openai/resources/responses/responses";

const openai = new OpenAI();

const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

export async function askMushMush(question: string) {
  const input: ResponseInputItem[] = [
    {
      role: "user",
      content: question,
    },
  ];

  for (let round = 0; round < 5; round++) {
    const response = await openai.responses.create({
      model,
      instructions: fashionPersonality,
      tools: aiTools,
      tool_choice: "auto",
      input,
    });

    const toolCalls = response.output.filter(
      (item) => item.type === "function_call",
    );

    if (toolCalls.length === 0) {
      return response.output_text;
    }

    input.push(...toResponseInputItems(response.output));

    for (const toolCall of toolCalls) {
      const result = await executeTool(toolCall.name, toolCall.arguments);

      input.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: result,
      });
    }
  }

  throw new Error("Mush Mush exceeded the maximum number of tool rounds.");
}
