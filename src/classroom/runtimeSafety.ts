import { randomUUID } from "node:crypto";

export type FailureKind = "empty_body" | "invalid_json" | "invalid_shape" | "http_error" | "aborted" | "operation_failed" | "tool_failed" | "incomplete_model";
export class RuntimeFailure extends Error {
  constructor(readonly stage: string, readonly kind: FailureKind, readonly status?: number, readonly bodyLength?: number) {
    super(`Classroom stage ${stage} failed (${kind}).`);
  }
}
export function parseRuntimeJson(raw: unknown, stage: string): unknown {
  if (typeof raw !== "string") throw new RuntimeFailure(stage, "invalid_shape");
  if (!raw.trim()) throw new RuntimeFailure(stage, "empty_body", undefined, raw.length);
  try { return JSON.parse(raw); }
  catch { throw new RuntimeFailure(stage, "invalid_json", undefined, raw.length); }
}
export function normalizeFailure(error: unknown, stage: string): RuntimeFailure {
  if (error instanceof RuntimeFailure) return error;
  const obj = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof obj.status === "number" && Number.isInteger(obj.status) && obj.status >= 100 && obj.status <= 599 ? obj.status : undefined;
  const kind: FailureKind = status && status >= 400 ? "http_error" :
    ["AbortError", "TimeoutError", "APIUserAbortError", "APIConnectionTimeoutError"].includes(String(obj.name)) ? "aborted" :
    error instanceof SyntaxError ? "invalid_json" : "operation_failed";
  return new RuntimeFailure(stage, kind, status);
}
export async function atStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { throw normalizeFailure(error, stage); }
}
export async function readRuntimeJson(response: Response, stage: string): Promise<unknown> {
  // Classify HTTP failures before attempting to consume an empty/broken error stream.
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new RuntimeFailure(stage, "http_error", response.status);
  }
  const text = await atStage(`${stage}.body`, () => response.text());
  return parseRuntimeJson(text, stage);
}
export function failureReport(error: unknown, stage: string, log: (record: object) => void = record => console.error(JSON.stringify(record))) {
  const failure = normalizeFailure(error, stage);
  const reference = randomUUID();
  log({ event: "classroom_runtime_failure", reference, stage: failure.stage, kind: failure.kind,
    ...(failure.status === undefined ? {} : { status: failure.status }),
    ...(failure.bodyLength === undefined ? {} : { bodyLength: failure.bodyLength }) });
  const reasons: Record<FailureKind, string> = {
    empty_body: "received an empty response", invalid_json: "received unreadable or incomplete JSON",
    invalid_shape: "received an unexpected response format", http_error: "received an unsuccessful HTTP response",
    aborted: "was interrupted or timed out", operation_failed: "could not finish the operation",
    tool_failed: "received a failed tool result", incomplete_model: "received an incomplete model response",
  };
  return { code: "CLASSROOM_RUNTIME_FAILURE" as const, reference, stage: failure.stage, kind: failure.kind,
    message: `I encountered a problem at ${failure.stage}: ${reasons[failure.kind]}.${failure.status ? ` HTTP ${failure.status}.` : ""} Work may already have been saved or performed. Check the conversation and current state before resending; I have not automatically retried the operation. Reference: ${reference}.` };
}
export interface ModelResponse {
  id: string;
  status?: string;
  output: Array<{ type: string; name?: string; arguments?: string; call_id?: string }>;
  output_text: string;
}
export function validateModelResponse(value: unknown, stage: string): ModelResponse {
  if (typeof value === "string") value = parseRuntimeJson(value, `${stage}.json`);
  if (!value || typeof value !== "object") throw new RuntimeFailure(stage, "empty_body");
  const response = value as ModelResponse;
  if (response.status && response.status !== "completed") throw new RuntimeFailure(stage, "incomplete_model");
  if (typeof response.id !== "string" || !response.id || !Array.isArray(response.output) || typeof response.output_text !== "string") throw new RuntimeFailure(stage, "invalid_shape");
  const ids = new Set<string>();
  for (const item of response.output) {
    if (!item || typeof item.type !== "string") throw new RuntimeFailure(stage, "invalid_shape");
    if (item.type === "function_call") {
      if (typeof item.name !== "string" || !item.name || typeof item.arguments !== "string" || typeof item.call_id !== "string" || !item.call_id || ids.has(item.call_id)) throw new RuntimeFailure(stage, "invalid_shape");
      ids.add(item.call_id);
    }
  }
  return response;
}
export function toolResultEnvelope(result: unknown, stage: string): string {
  const parsed = parseRuntimeJson(result, `${stage}.result`);
  if (parsed === null) throw new RuntimeFailure(`${stage}.result`, "empty_body");
  if (typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (record.error || record.success === false || record.status === "failed" || record.status === "aborted") {
      throw new RuntimeFailure(`${stage}.result`, "tool_failed");
    }
    // Preserve the exact silent-success contract (including output: "").
    if (record.success === true) return result as string;
    return JSON.stringify({ ...record, success: true });
  }
  if (Array.isArray(parsed)) return JSON.stringify({ success: true, output: parsed });
  throw new RuntimeFailure(`${stage}.result`, "invalid_shape");
}
export async function safeToolCall(name: string, raw: string, execute: (name: string, raw: string) => Promise<string>, allowedNames: ReadonlySet<string>): Promise<string> {
  const stage = `tool.${allowedNames.has(name) ? name : "unknown"}`;
  try {
    if (!allowedNames.has(name)) throw new RuntimeFailure(stage, "invalid_shape");
    const args = parseRuntimeJson(raw, `${stage}.arguments`);
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new RuntimeFailure(`${stage}.arguments`, "invalid_shape");
    const result = await atStage(`${stage}.execute`, () => execute(name, raw));
    return toolResultEnvelope(result, stage);
  } catch (error) {
    const report = failureReport(error, stage);
    return JSON.stringify({ error: report.message, ...report, success: false });
  }
}
