import assert from "node:assert/strict";
import { test } from "node:test";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { createKnowledgeReader } from "./classroomKnowledge.js";
import type { KnowledgeRow } from "./classroomKnowledge.js";
import { createPhoneRuntime } from "./phoneRuntime.js";
import { classroomKnowledgeTool } from "../tools/classroomKnowledgeTool.js";

// Offline integration across the real reader, search adapter and runtime.
// Database delegates and the OpenAI transport are the only substitutes.
const finished = { id: "finished", output_text: "reply", output: [] } as unknown as Response;

test("reader-to-runtime integration excludes internal and unapproved records in automatic and tool context", async () => {
  const lessonRows = [
    { status: "approved", customerFacingText: "Public lesson", content: "PRIVATE content" },
    { status: "approved", customerFacingText: null, content: "PRIVATE developer workflow" },
  ];
  const insightRows = [
    { status: "approved", customerFacingText: "Public scoped insight", evidence: "PRIVATE evidence" },
    ...["proposed", "rejected", "pending"].map((status) => ({ status, customerFacingText: "FORBIDDEN insight" })),
  ];
  const load = createKnowledgeReader({
    classroomLesson: { findMany: async () => lessonRows },
    classroomInsight: { findMany: async () => insightRows },
  });
  const requests: ResponseCreateParamsNonStreaming[] = [];
  const runtime = createPhoneRuntime({
    model: "offline", personality: "base", tools: [], executeTool: async () => "legacy",
    loadKnowledge: load,
    createResponse: async (params) => {
      requests.push(params);
      return requests.length === 1 ? {
        id: "search", output_text: "", output: [{ type: "function_call", call_id: "search-1",
          name: classroomKnowledgeTool.name, arguments: '{"query":"Public","limit":5}' }],
      } as Response : finished;
    },
  });
  assert.equal(await runtime.callMushMush("Customer history stays intact"), "reply");
  assert.equal(requests.length, 2);
  const serialized = JSON.stringify(requests);
  assert.doesNotMatch(serialized, /PRIVATE|FORBIDDEN/);
  assert.match(requests[0]!.instructions!, /Public lesson/);
  assert.match(requests[0]!.instructions!, /Public scoped insight/);
  const outputs = requests[1]!.input as Array<{ output: string }>;
  assert.deepEqual(JSON.parse(outputs[0]!.output).items, [
    { kind: "lesson", text: "Public lesson" },
    { kind: "insight", text: "Public scoped insight" },
  ]);
});

test("next phone turn reloads approval rather than reusing old automatic knowledge", async () => {
  const insight: KnowledgeRow = { status: "approved", customerFacingText: "Revocable public insight" };
  const load = createKnowledgeReader({
    classroomLesson: { findMany: async () => [] }, classroomInsight: { findMany: async () => [insight] },
  });
  const instructions: string[] = [];
  const runtime = createPhoneRuntime({
    model: "offline", personality: "base", tools: [], executeTool: async () => "legacy", loadKnowledge: load,
    createResponse: async (params) => { instructions.push(params.instructions!); return finished; },
  });
  await runtime.callMushMush("first");
  insight.status = "rejected";
  await runtime.callMushMush("second");
  assert.match(instructions[0]!, /Revocable public insight/);
  assert.doesNotMatch(instructions[1]!, /Revocable public insight/);
});

test("failed read-only search exposes no exception details and does not call legacy tools", async () => {
  const requests: ResponseCreateParamsNonStreaming[] = [];
  let reads = 0;
  let delegated = false;
  const runtime = createPhoneRuntime({
    model: "offline", personality: "base", tools: [],
    executeTool: async () => { delegated = true; return "legacy"; },
    loadKnowledge: async () => {
      if (++reads > 1) throw new Error("PRIVATE database details");
      return { available: true, items: [] };
    },
    createResponse: async (params) => {
      requests.push(params);
      return requests.length === 1 ? {
        id: "search", output_text: "", output: [{ type: "function_call", call_id: "search-1",
          name: classroomKnowledgeTool.name, arguments: '{"query":"lace","limit":null}' }],
      } as Response : finished;
    },
  });
  await runtime.callMushMush("hello");
  const outputs = requests[1]!.input as Array<{ output: string }>;
  assert.deepEqual(JSON.parse(outputs[0]!.output), { available: false, items: [] });
  assert.equal(delegated, false);
  assert.doesNotMatch(JSON.stringify(requests), /PRIVATE/);
});
