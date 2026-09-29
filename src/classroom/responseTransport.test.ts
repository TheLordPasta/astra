import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { runClassroomRuntime } from "./classroomRuntime.js";
import { atStage, failureReport } from "./runtimeSafety.js";
import { collectDesignerPosts, InstagramReadError } from "../instagram/instagramGraphClient.js";

for (const body of ["", '{"id":', "not JSON"]) {
  test(`original unguarded response.json reproduces SyntaxError (${body.length})`, async () => {
    await assert.rejects(new Response(body).json(), SyntaxError);
  });
}
for (const [body, status] of [["", 200], ['{"id":', 200], ["<html>SECRET</html>", 502]] as const) {
  test(`real OpenAI SDK decoding with fixture transport ${status}/${body.length}`, async () => {
    let requests = 0;
    const client = new OpenAI({ apiKey: "fixture-not-a-real-key", maxRetries: 0,
      fetch: async () => { requests++; return new Response(body, { status, headers: { "content-type": "application/json" } }); },
    });
    const saved: string[] = [];
    const result = await runClassroomRuntime({ allowedNames: new Set(), execute: async () => "{}", save: async text => { saved.push(text); },
      model: () => client.responses.create({ model: "fixture", input: "fixture" }),
    });
    assert.equal(requests, 1);
    assert.equal(saved[0], result);
    assert.match(result, /model.initial/);
    assert.doesNotMatch(result, /SECRET|SyntaxError|Unexpected end|JSON.parse/);
  });
}
test("real SDK structured-output truncated content is safely categorized", async () => {
  const client = new OpenAI({ apiKey: "fixture-not-a-real-key", maxRetries: 0, fetch: async () => new Response(JSON.stringify({
    id: "r1", status: "completed", output: [{ id: "m1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"value":', annotations: [] }] }],
  }), { headers: { "content-type": "application/json" } }) });
  try {
    await atStage("research.model", () => client.responses.parse({
      model: "fixture", input: "fixture",
      text: {
        format: {
          type: "json_schema", name: "test", strict: true,
          schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false },
        },
      },
    }));
    assert.fail("Expected malformed structured content to fail");
  } catch (error) {
    const result = failureReport(error, "research.model", () => {});
    assert.equal(result.kind, "invalid_json");
    assert.match(result.message, /research.model/);
  }
});
for (const [body, status] of [["", 200], ['{"business_discovery":', 200], ["not JSON SECRET", 200], ["", 502], ["<html>SECRET</html>", 503]] as const) {
  test(`Meta transport empty/malformed/HTTP fixture ${status}/${body.length}`, async () => {
    await assert.rejects(collectDesignerPosts("designer", "2026-01-01", "2026-02-01", { accountId: "123", token: "fixture-only" }, async () => new Response(body, { status })), (error: unknown) => {
      assert.ok(error instanceof InstagramReadError);
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /SECRET|SyntaxError|fixture-only/);
      return true;
    });
  });
}
test("Meta aborted response does not replay or expose request URL/token", async () => {
  let calls = 0;
  await assert.rejects(collectDesignerPosts("designer", "2026-01-01", "2026-02-01", { accountId: "123", token: "fixture-only" }, async () => {
    calls++; throw new DOMException("https://example.com/?token=SECRET", "AbortError");
  }), (error: unknown) => error instanceof InstagramReadError && !error.message.includes("SECRET"));
  assert.equal(calls, 1);
});
