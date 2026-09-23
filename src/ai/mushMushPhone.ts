import OpenAI from "openai";

import { fashionPersonality } from "./prompts/fashionPersonality.js";
import { aiTools } from "../tools/aiTools.js";
import { executeTool } from "../tools/executeTool.js";

const openai = new OpenAI();

const model = process.env.OPENAI_MODEL ?? "gpt-6-astra";

export async function callMushMush(input: string): Promise<string> {
  console.log("Calling Mush Mush...");

  let response = await openai.responses.create({
    model,
    instructions: fashionPersonality,
    tools: aiTools,
    input,
  });

  console.log("Mush Mush response received.");

  for (let round = 0; round < 5; round++) {
    const toolCalls = response.output.filter(
      (item) => item.type === "function_call",
    );

    if (toolCalls.length === 0) {
      return response.output_text;
    }

    const toolOutputs = [];

    for (const toolCall of toolCalls) {
      const result = await executeTool(toolCall.name, toolCall.arguments);

      toolOutputs.push({
        type: "function_call_output" as const,
        call_id: toolCall.call_id,
        output: result,
      });
    }

    response = await openai.responses.create({
      model,
      instructions: fashionPersonality,
      tools: aiTools,
      previous_response_id: response.id,
      input: toolOutputs,
    });
  }

  throw new Error("Mush Mush exceeded the tool-call limit.");
}

export async function callMushMushWithImage(
  text: string,
  imageUrl: string,
): Promise<string> {
  console.log("Calling Mush Mush with image...");

  let response = await openai.responses.create({
    model,
    instructions: fashionPersonality,
    tools: aiTools,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text,
          },
          {
            type: "input_image",
            image_url: imageUrl,
            detail: "high",
          },
        ],
      },
    ],
  });

  console.log("Mush Mush image response received.");

  for (let round = 0; round < 5; round++) {
    const toolCalls = response.output.filter(
      (item) => item.type === "function_call",
    );

    if (toolCalls.length === 0) {
      return response.output_text;
    }

    const toolOutputs = [];

    for (const toolCall of toolCalls) {
      const result = await executeTool(toolCall.name, toolCall.arguments);

      toolOutputs.push({
        type: "function_call_output" as const,
        call_id: toolCall.call_id,
        output: result,
      });
    }

    response = await openai.responses.create({
      model,
      instructions: fashionPersonality,
      tools: aiTools,
      previous_response_id: response.id,
      input: toolOutputs,
    });
  }

  throw new Error("Mush Mush exceeded the image tool-call limit.");
}
