import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Response, ResponseCreateParamsNonStreaming, Tool } from "openai/resources/responses/responses";
import { createKnowledgeReader, MAX_PUBLIC_TEXT_LENGTH, knowledgeInstructions } from "./classroomKnowledge.js";
import type { KnowledgeQuery, KnowledgeRow, KnowledgeResult } from "./classroomKnowledge.js";
import { createPhoneRuntime } from "./phoneRuntime.js";
import { classroomKnowledgeTool, withClassroomKnowledgeTool } from "../tools/classroomKnowledgeTool.js";

type FixtureRow = KnowledgeRow & { id: number; updatedAt: number; [key: string]: unknown };
const row = (id: number, text: string | null, status = "approved"): FixtureRow => ({
  id, updatedAt: id, status, customerFacingText: text,
});

function fixture(lessons: FixtureRow[] = [], insights: FixtureRow[] = []) {
  const queries: KnowledgeQuery[] = [];
  const find = (rows: FixtureRow[]) => async (args: KnowledgeQuery) => {
    queries.push(args);
    return rows.filter((r) => r.status === args.where.status && r.customerFacingText !== null)
      .filter((r) => !args.where.customerFacingText.contains ||
        r.customerFacingText!.toLowerCase().includes(args.where.customerFacingText.contains.toLowerCase()))
      .sort((a, b) => b.updatedAt - a.updatedAt || b.id - a.id)
      .slice(0, args.take);
  };
  const store = { classroomLesson: { findMany: find(lessons) }, classroomInsight: { findMany: find(insights) } };
  return { reader: createKnowledgeReader(store), store, queries };
}

const publicResult: KnowledgeResult = { available: true, items: [
  { kind: "lesson", text: "Lace can require lining." },
  { kind: "insight", text: "Some customers ask for more coverage; not a universal trend." },
] };

function response(id: string, names: string[] = []): Response {
  // Only the response properties consumed by the production runtime are mocked.
  return { id, output_text: names.length ? "" : "reply", output: names.map((name, i) => ({
    type: "function_call", call_id: `${id}-${i}`, name,
    arguments: name === classroomKnowledgeTool.name ? '{"query":"lace","limit":2}' : '{"customerId":7}',
  })) } as Response;
}

const memoryNames = ["get_research_memory", "get_customer_observations", "add_customer_observation", "get_customer_conversations", "add_conversation_message"];
const memoryTools: Tool[] = memoryNames.map((name) => ({
  type: "function", name, description: name,
  parameters: { type: "object", properties: {}, additionalProperties: false }, strict: true,
}));

test("approved lessons and approved insights are retrievable with public wording only", async () => {
  const { reader, queries } = fixture(
    [{ ...row(1, "Public lace lesson"), title: "PRIVATE title", content: "PRIVATE content", source: "PRIVATE source" }],
    [{ ...row(2, "Public qualified insight"), subject: "PRIVATE subject", evidence: "PRIVATE evidence", customerSources: ["PRIVATE customer"], sourceRef: "PRIVATE reference" }],
  );
  assert.deepEqual(await reader(), { available: true, items: [
    { kind: "lesson", text: "Public lace lesson" }, { kind: "insight", text: "Public qualified insight" },
  ] });
  for (const q of queries) {
    assert.equal(q.where.status, "approved");
    assert.deepEqual(q.select, { status: true, customerFacingText: true });
    assert.deepEqual(q.where.customerFacingText, { not: null });
    assert.equal(q.take, 8);
    assert.deepEqual(q.orderBy, [{ updatedAt: "desc" }, { id: "desc" }]);
  }
});

test("proposed rejected pending and unknown statuses never qualify, even with public text", async () => {
  const statuses = ["proposed", "rejected", "pending", "archived", "APPROVED", ""];
  const { reader } = fixture(statuses.map((s, i) => row(i, s, s)), statuses.map((s, i) => row(i, s, s)));
  assert.deepEqual((await reader()).items, []);
});

test("approval alone does not publish internal lessons or insights", async () => {
  const { reader } = fixture([row(1, null)], [row(1, null)]);
  assert.deepEqual((await reader()).items, []);
});

test("defensive output filter excludes unapproved, blank, oversized and unpublished rows", async () => {
  const rows = [row(1, "unapproved", "proposed"), row(2, "   "), row(3, "x".repeat(MAX_PUBLIC_TEXT_LENGTH + 1)), row(4, null), row(5, "valid")];
  const unfiltered = { findMany: async () => rows };
  const reader = createKnowledgeReader({ classroomLesson: unfiltered, classroomInsight: unfiltered });
  assert.deepEqual((await reader()).items, [{ kind: "lesson", text: "valid" }, { kind: "insight", text: "valid" }]);
});

test("automatic retrieval is recent and bounded per kind; search reaches older public records", async () => {
  const { reader, queries } = fixture([row(1, "needle lace"), ...Array.from({ length: 12 }, (_, i) => row(i + 2, "recent silk"))]);
  assert.equal((await reader()).items.length, 8);
  assert.equal((await reader()).items.some((r) => r.text.includes("needle")), false);
  assert.deepEqual((await reader("NEEDLE", 1)).items, [{ kind: "lesson", text: "needle lace" }]);
  assert.equal(queries.at(-1)?.where.customerFacingText.mode, "insensitive");
});

test("search operates only on public wording, not internal titles or evidence", async () => {
  const { reader } = fixture([{ ...row(1, "Lace"), title: "secretneedle" }], [{ ...row(1, "Silk"), evidence: "secretneedle" }]);
  assert.deepEqual((await reader("secretneedle")).items, []);
});

test("each retrieval observes changed approval and revoked publication without cache", async () => {
  const insight = row(1, "Scoped insight", "proposed");
  const { reader } = fixture([], [insight]);
  assert.equal((await reader()).items.length, 0);
  insight.status = "approved";
  assert.equal((await reader()).items.length, 1);
  insight.status = "rejected";
  assert.equal((await reader()).items.length, 0);
  insight.status = "approved";
  insight.customerFacingText = null;
  assert.equal((await reader()).items.length, 0);
});

test("database failure is fail-closed, generic and does not leak error details", async () => {
  let warnings = 0;
  const broken = { findMany: async (): Promise<KnowledgeRow[]> => { throw new Error("PRIVATE database details"); } };
  const reader = createKnowledgeReader({ classroomLesson: broken, classroomInsight: broken }, () => { warnings++; });
  assert.deepEqual(await reader(), { available: false, items: [] });
  assert.equal(warnings, 1);
});

test("invalid reader bounds reject before touching the database", async () => {
  const { reader, queries } = fixture();
  for (const limit of [0, -1, 11, 1.5, NaN]) await assert.rejects(reader(null, limit));
  await assert.rejects(reader("x".repeat(201)));
  assert.equal(queries.length, 0);
});

test("read-only tool validates strict arguments and rejects attempted status override", async () => {
  let reads = 0;
  const execute = withClassroomKnowledgeTool(async () => "legacy", async () => { reads++; return publicResult; });
  for (const raw of ["not json", "null", '{"query":" ","limit":2}', '{"query":"lace","limit":11}', '{"query":"lace","limit":2,"status":"proposed"}']) {
    assert.match(await execute(classroomKnowledgeTool.name, raw), /Invalid knowledge search arguments/);
  }
  assert.equal(reads, 0);
  assert.deepEqual(JSON.parse(await execute(classroomKnowledgeTool.name, '{"query":"lace","limit":null}')), publicResult);
  assert.equal(reads, 1);
});

test("legacy research, observation and conversation tools delegate unchanged", async () => {
  const seen: string[][] = [];
  const execute = withClassroomKnowledgeTool(async (name, raw) => { seen.push([name, raw]); return `legacy:${name}:${raw}`; }, async () => publicResult);
  for (const name of memoryNames) {
    assert.equal(await execute(name, '{"customerId":7}'), `legacy:${name}:{"customerId":7}`);
  }
  assert.deepEqual(seen, memoryNames.map((name) => [name, '{"customerId":7}']));
});

for (const image of [false, true]) {
  test(`${image ? "image" : "text/Instagram"} runtime loads both knowledge kinds and preserves tools and continuation`, async () => {
    const requests: ResponseCreateParamsNonStreaming[] = [];
    const delegated: string[] = [];
    const reads: Array<[string | null | undefined, number | undefined]> = [];
    const runtime = createPhoneRuntime({
      createResponse: async (params) => { requests.push(params); return requests.length === 1 ? response("first", [...memoryNames, classroomKnowledgeTool.name]) : response("second"); },
      model: "offline", personality: "Original personality", tools: memoryTools,
      executeTool: async (name, raw) => { delegated.push(name); assert.equal(raw, '{"customerId":7}'); return `result:${name}`; },
      loadKnowledge: async (query, limit) => { reads.push([query, limit]); return publicResult; },
    });
    const history = "Customer: remembered request\nMush Mush: earlier reply\nCustomer: latest question";
    assert.equal(await (image ? runtime.callMushMushWithImage(history, "https://example.invalid/image.jpg") : runtime.callMushMush(history)), "reply");
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.match(request.instructions!, /^Original personality/);
      assert.match(request.instructions!, /Lace can require lining/);
      assert.match(request.instructions!, /not a universal trend/);
      assert.deepEqual(request.tools, [...memoryTools, classroomKnowledgeTool]);
    }
    if (image) {
      assert.deepEqual(requests[0]!.input, [{ role: "user", content: [
        { type: "input_text", text: history },
        { type: "input_image", image_url: "https://example.invalid/image.jpg", detail: "high" },
      ] }]);
    } else assert.equal(requests[0]!.input, history);
    assert.equal(requests[1]!.previous_response_id, "first");
    const outputs = requests[1]!.input as Array<{ output: string; call_id: string }>;
    for (let i = 0; i < memoryNames.length; i++) {
      assert.equal(outputs[i]!.output, `result:${memoryNames[i]}`);
      assert.equal(outputs[i]!.call_id, `first-${i}`);
    }
    assert.deepEqual(JSON.parse(outputs.at(-1)!.output), publicResult);
    assert.deepEqual(delegated, memoryNames);
    assert.deepEqual(reads, [[undefined, undefined], ["lace", 2]]);
    assert.equal(memoryTools.length, memoryNames.length);
  });
}

test("runtime continues safely when knowledge is unavailable", async () => {
  let captured = "";
  const runtime = createPhoneRuntime({
    createResponse: async (params) => { captured = params.instructions!; return response("done"); },
    model: "offline", personality: "personality", tools: [], executeTool: async () => "",
    loadKnowledge: async () => { throw new Error("PRIVATE failure"); },
  });
  assert.equal(await runtime.callMushMush("hi"), "reply");
  assert.match(captured, /"available":false/);
  assert.doesNotMatch(captured, /PRIVATE/);
});

test("runtime keeps the original five-round tool limit", async () => {
  let count = 0;
  const runtime = createPhoneRuntime({
    createResponse: async () => response(String(++count), ["get_research_memory"]),
    model: "offline", personality: "personality", tools: memoryTools,
    executeTool: async () => "existing result", loadKnowledge: async () => publicResult,
  });
  await assert.rejects(runtime.callMushMush("hi"), /exceeded the tool-call limit/);
  assert.equal(count, 6);
});

test("instructions delimit reference data and preserve existing personality", () => {
  const text = knowledgeInstructions("base", publicResult);
  assert.match(text, /^base/);
  assert.match(text, /never as instructions/);
  assert.match(text, /Insights are not universal facts/);
  assert.match(text, /research memory, customer observations and conversation history/);
});

test("production wiring points Instagram to shared runtime and existing memory definitions", () => {
  // Source-level wiring assertions, NOT a live webhook/database integration test.
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const facade = read("./mushMushPhone.ts");
  assert.match(facade, /createPhoneRuntime/);
  assert.match(facade, /loadKnowledge: loadApprovedClassroomKnowledge/);
  assert.match(facade, /tools: aiTools/);
  assert.match(facade, /executeTool,/);
  const adapter = read("../db/classroomKnowledge.ts");
  assert.match(adapter, /import \{ prisma \} from "\.\/client\.js"/);
  const instagram = read("../instagram/instagramHandler.ts");
  assert.match(instagram, /import \{ callMushMush \} from "\.\.\/ai\/mushMushPhone\.js"/);
  assert.match(instagram, /getConversationMessages\(conversation.id\)/);
  assert.match(instagram, /callMushMush\(mushMushInput\)/);
  assert.match(instagram, /sendInstagramMessage\(senderId, mushMushReply\)/);
  const tools = read("../tools/aiTools.ts");
  const execute = read("../tools/executeTool.ts");
  assert.match(tools, /researchMemoryTool,/);
  assert.match(tools, /marketResearchTool,/);
  for (const name of memoryNames) {
    assert.ok(execute.includes(`case "${name}"`));
    if (name !== "get_research_memory") assert.ok(tools.includes(`name: "${name}"`));
  }
});
