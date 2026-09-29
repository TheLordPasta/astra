import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { classroomRequest, ClassroomApiError, messageFailureText, uiErrorMessage } from "./apiClient.js";

const path = "/api/sessions/1/messages";
for (const [body, kind] of [["", "empty_body"], ["  ", "empty_body"], ['{"response":', "invalid_json"], ["not JSON SECRET", "invalid_json"], ["null", "invalid_shape"], ["{}", "invalid_shape"]]) {
  test(`UI response guard: ${JSON.stringify(body)}`, async () => {
    await assert.rejects(classroomRequest(path, {}, async () => new Response(body)), error => {
      assert.ok(error instanceof ClassroomApiError);
      assert.equal(error.kind, kind);
      const message = messageFailureText(error, false);
      assert.match(message, /Work may already/);
      assert.doesNotMatch(message, /SyntaxError|JSON.parse|SECRET|unexpected end/i);
      return true;
    });
  });
}
for (const status of [401, 429, 500, 502, 504]) {
  test(`UI HTTP ${status} with empty body preserves status`, async () => {
    await assert.rejects(classroomRequest(path, {}, async () => new Response("", { status })), error => error.status === status && error.kind === "http_error");
  });
}
test("UI non-JSON proxy HTML never reaches user", async () => {
  await assert.rejects(classroomRequest(path, {}, async () => new Response("<html>SECRET</html>", { status: 502 })), error => !error.message.includes("SECRET") && error.status === 502);
});
test("UI doesn't display arbitrary server error strings", async () => {
  await assert.rejects(classroomRequest(path, {}, async () => new Response(JSON.stringify({ error: "JSON.parse SECRET", reference: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }), { status: 500 })), error => {
    assert.match(error.message, /Reference: aaaaaaaa/);
    assert.doesNotMatch(error.message, /SECRET|JSON.parse/);
    return true;
  });
});
for (const name of ["AbortError", "TypeError"]) {
  test(`UI failed fetch ${name} is not retried`, async () => {
    let calls = 0;
    await assert.rejects(classroomRequest(path, {}, async () => { calls++; throw Object.assign(new Error("SECRET"), { name }); }), error => error instanceof ClassroomApiError && !error.message.includes("SECRET"));
    assert.equal(calls, 1);
  });
}
test("UI aborted body stream is handled", async () => {
  await assert.rejects(classroomRequest(path, {}, async () => new Response(new ReadableStream({ start(c) { c.error(new Error("SECRET")); } }))), error => error.kind === "aborted" && !error.message.includes("SECRET"));
});
test("UI valid lessons followed by empty message response reproduces failure stage", async () => {
  assert.deepEqual(await classroomRequest("/api/lessons", {}, async () => new Response('[{"id":13}]')), [{ id: 13 }]);
  await assert.rejects(classroomRequest(path, {}, async () => new Response("")), error => error.stage === "sending your message" && error.kind === "empty_body");
});
test("UI success and completed-answer refresh distinction preserved", async () => {
  assert.deepEqual(await classroomRequest(path, {}, async () => new Response('{"response":"done"}')), { response: "done" });
  const error = new ClassroomApiError("loading the conversation", "empty_body", 200);
  assert.match(messageFailureText(error, true), /response completed, but refreshing failed/);
  assert.doesNotMatch(messageFailureText(new SyntaxError("SECRET"), false), /SECRET|SyntaxError/);
});

// Execute the actual browser event handler against a minimal DOM fixture (no browser/network).
function element() {
  return {
    value: "", children: [], events: {}, textContent: "", hidden: false,
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(name, handler) { this.events[name] = handler; },
    querySelectorAll() { return []; }, setAttribute() {}, focus() {}, close() {}, showModal() {},
    classList: { remove() {}, toggle() { return false; } },
  };
}
async function uiFixture(fetcher) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const source = (await readFile(new URL("./app.js", import.meta.url), "utf8")).replace(/^import[^\n]+\n/, "");
  const context = vm.createContext({
    document: { getElementById: get, createElement: element }, window: { addEventListener() {} },
    Headers, Intl, console,
    classroomRequest: (path, options) => classroomRequest(path, options, fetcher), messageFailureText, uiErrorMessage,
  });
  vm.runInContext(source + '\nstate.key = "fixture-key"; state.currentSession = {id:1,messages:[]};', context);
  get("input").value = "Please work";
  return { get, submit: () => get("messageForm").events.submit({ preventDefault() {} }) };
}
function textTree(node) { return [node.textContent, ...node.children.map(textTree)].join(" "); }
for (const body of ["", '{"response":']) {
  test(`actual UI submit renders conversational failure in chat (${body.length})`, async () => {
    const fixture = await uiFixture(async () => new Response(body));
    await fixture.submit();
    const text = textTree(fixture.get("messages"));
    assert.match(text, /Mush Mush/);
    assert.match(text, /I encountered a problem/);
    assert.match(text, /This local notice/);
    assert.doesNotMatch(text, /SyntaxError|JSON.parse|Unexpected end/);
    assert.equal(fixture.get("send").disabled, false);
    assert.equal(fixture.get("input").value, "Please work");
  });
}
test("actual UI keeps returned reply when persistence failed and does not replace it with stale history", async () => {
  const paths = [];
  const fixture = await uiFixture(async path => {
    paths.push(path);
    return new Response(path.endsWith("/messages") ? JSON.stringify({ response: "Completed. This reply could not be saved to conversation history." }) : "[]");
  });
  await fixture.submit();
  assert.match(textTree(fixture.get("messages")), /Completed. This reply could not be saved/);
  assert.equal(paths.includes("/api/sessions/1"), false);
});
