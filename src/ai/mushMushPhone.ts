import OpenAI from "openai";

import { fashionPersonality } from "./prompts/fashionPersonality.js";
import { aiTools } from "../tools/aiTools.js";
import { executeTool } from "../tools/executeTool.js";
import { loadApprovedClassroomKnowledge } from "../db/classroomKnowledge.js";
import { createPhoneRuntime } from "./phoneRuntime.js";

const openai = new OpenAI();
const runtime = createPhoneRuntime({
  createResponse: (params) => openai.responses.create(params),
  model: process.env.OPENAI_MODEL ?? "gpt-6-astra",
  personality: fashionPersonality,
  tools: aiTools,
  executeTool,
  loadKnowledge: loadApprovedClassroomKnowledge,
});

export const callMushMush = runtime.callMushMush;
export const callMushMushWithImage = runtime.callMushMushWithImage;
