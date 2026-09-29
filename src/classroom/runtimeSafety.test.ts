import test from "node:test";
import assert from "node:assert/strict";
import { parseRuntimeJson, readRuntimeJson, failureReport, RuntimeFailure, safeToolCall, validateModelResponse } from "./runtimeSafety.js";
import { runClassroomRuntime } from "./classroomRuntime.js";
import { createClassroomApp } from "./classroomHttp.js";

for (const [raw, kind] of [["", "empty_body"], [" \n", "empty_body"], ['{"a":', "invalid_json"], ["not-json SECRET", "invalid_json"]]) {
  test(`guarded JSON classifies ${JSON.stringify(raw)}`, () => {
    assert.throws(() => parseRuntimeJson(raw, "test.parse"), (error: unknown) => error instanceof RuntimeFailure && error.kind === kind && !error.message.includes("SECRET"));
  });
}
test("valid lessons array remains valid", () => {
  assert.deepEqual(parseRuntimeJson('[{"id":13,"content":"approved"}]', "lessons"), [{ id: 13, content: "approved" }]);
});
for (const body of ["", "<html>proxy failure SECRET</html>", '{"error":']) {
  test(`HTTP status preserved for non-JSON failure ${body.length}`, async () => {
    await assert.rejects(readRuntimeJson(new Response(body, { status: 502 }), "external"), (error: unknown) => error instanceof RuntimeFailure && error.status === 502 && error.kind === "http_error");
  });
}
test("failed body stream handled without raw exception", async () => {
  const stream = new ReadableStream({ start(controller) { controller.error(new DOMException("SECRET", "AbortError")); } });
  await assert.rejects(readRuntimeJson(new Response(stream), "external"), (error: unknown) => error instanceof RuntimeFailure && error.kind === "aborted");
});
test("diagnostics retain only allowlisted metadata", () => {
  const logs: object[] = [];
  const error = Object.assign(new SyntaxError("token=SECRET"), { headers: { Authorization: "SECRET" }, body: "SECRET" });
  const report = failureReport(error, "model.initial", record => logs.push(record));
  assert.equal(report.kind, "invalid_json");
  assert.match(report.reference, /^[a-f0-9-]{36}$/);
  assert.equal(JSON.stringify({ logs, report }).includes("SECRET"), false);
});
const allowed = new Set(["test_tool"]);
for (const raw of ["", '{"a":', "null", "[]"]) {
  test(`bad tool args do not execute ${raw}`, async () => {
    let executions = 0;
    const result = JSON.parse(await safeToolCall("test_tool", raw, async () => { executions++; return "{}"; }, allowed));
    assert.equal(executions, 0);
    assert.equal(result.success, false);
    assert.match(result.stage, /arguments/);
  });
}
for (const raw of ["", '{"a":', "null", '{"error":"SyntaxError token=SECRET"}', '{"success":false}', '{"status":"aborted"}']) {
  test(`bad tool results become conversational failures ${raw}`, async () => {
    const result = JSON.parse(await safeToolCall("test_tool", "{}", async () => raw, allowed));
    assert.equal(result.success, false);
    assert.match(result.stage, /result/);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  });
}
test("aborted tool does not replay", async () => {
  let calls = 0;
  const result = JSON.parse(await safeToolCall("test_tool", "{}", async () => { calls++; throw new DOMException("SECRET", "AbortError"); }, allowed));
  assert.equal(calls, 1);
  assert.equal(result.kind, "aborted");
});
test("silent successful compiler output is not an empty tool response", async () => {
  const result = '{"success":true,"output":""}';
  assert.equal(await safeToolCall("test_tool", "{}", async () => result, allowed), result);
});
test("unexpected model status never executes partial tool calls", () => {
  assert.throws(() => validateModelResponse({ id: "r", status: "incomplete", output: [], output_text: "partial" }, "model.initial"), RuntimeFailure);
});
const done = { id: "r2", status: "completed", output: [], output_text: "Completed report" };
const toolCall = { id: "r1", status: "completed", output: [{ type: "function_call", name: "test_tool", arguments: "{}", call_id: "c1" }], output_text: "" };
test("failure after a successful tool persists a conversational report without replay", async () => {
  let calls = 0, writes = 0;
  const saved: string[] = [];
  const result = await runClassroomRuntime({
    model: async () => { if (calls++ === 0) return toolCall; throw new SyntaxError("Unexpected end SECRET"); },
    execute: async () => { writes++; return '{"success":true}'; }, allowedNames: allowed,
    save: async text => { saved.push(text); },
  });
  assert.equal(writes, 1);
  assert.equal(saved[0], result);
  assert.match(result, /model.followup.1/);
  assert.match(result, /Work may already/);
  assert.doesNotMatch(result, /SyntaxError|SECRET|Unexpected end/);
});
test("tool empty result is delivered to followup model as structured failure", async () => {
  let calls = 0;
  await runClassroomRuntime({ allowedNames: allowed, execute: async () => "", save: async () => {},
    model: async (_id, outputs) => {
      if (calls++ === 0) return toolCall;
      assert.equal(JSON.parse(outputs[0]!.output).kind, "empty_body");
      return done;
    },
  });
});
test("model success remains visible when saving fails", async () => {
  const result = await runClassroomRuntime({ model: async () => done, execute: async () => "{}", allowedNames: allowed,
    save: async () => { throw new Error("postgres://SECRET"); } });
  assert.match(result, /^Completed report/);
  assert.match(result, /could not be saved/);
  assert.doesNotMatch(result, /SECRET/);
});
for (const response of [undefined, null, {}, { ...done, output_text: " " }]) {
  test(`unusable model response is reported ${JSON.stringify(response)}`, async () => {
    const result = await runClassroomRuntime({ model: async () => response, execute: async () => "{}", allowedNames: allowed, save: async () => {} });
    assert.match(result, /I encountered a problem/);
  });
}
function appFor(send: (id: number, message: string) => Promise<string> = async () => "hello") {
  return createClassroomApp({ key: "test-key", sessions: async () => [], create: async title => ({ id: 1, title }),
    session: async () => ({ id: 1, messages: [] }), send,
    lessons: async () => [{ id: 13, content: "valid lesson" }], insights: async () => [] }, false);
}
test("HTTP: valid lessons followed by runtime parse failure return safe JSON", async () => {
  const app = appFor(async () => { throw new SyntaxError("Unexpected end token=SECRET"); });
  try {
    const headers = { "x-classroom-key": "test-key" };
    const lessons = await app.inject({ method: "GET", url: "/api/lessons", headers });
    assert.equal(lessons.statusCode, 200);
    assert.equal(lessons.json()[0].content, "valid lesson");
    const response = await app.inject({ method: "POST", url: "/api/sessions/1/messages", headers, payload: { message: "hello" } });
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().kind, "invalid_json");
    assert.equal(response.json().response, response.json().error);
    assert.doesNotMatch(response.body, /SECRET|SyntaxError|Unexpected end/);
  } finally { await app.close(); }
});
for (const payload of ["", '{"message":', "invalid SECRET"]) {
  test(`HTTP malformed request has safe envelope ${payload.length}`, async () => {
    const app = appFor();
    try {
      const response = await app.inject({ method: "POST", url: "/api/sessions/1/messages", headers: { "x-classroom-key": "test-key", "content-type": "application/json" }, payload });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().code, "CLASSROOM_RUNTIME_FAILURE");
      assert.doesNotMatch(response.body, /SECRET|SyntaxError|Unexpected end/);
    } finally { await app.close(); }
  });
}
test("HTTP authorization and successful message contract preserved; helper asset served", async () => {
  const app = appFor();
  try {
    assert.equal((await app.inject("/api/lessons")).statusCode, 401);
    const response = await app.inject({ method: "POST", url: "/api/sessions/1/messages", headers: { "x-classroom-key": "test-key" }, payload: { message: "hello" } });
    assert.deepEqual(response.json(), { response: "hello" });
    const asset = await app.inject("/apiClient.js");
    assert.equal(asset.statusCode, 200);
    assert.match(asset.headers["content-type"]!, /javascript/);
  } finally { await app.close(); }
});
