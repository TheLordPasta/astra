import { randomUUID } from "node:crypto";
import { atStage, failureReport, parseRuntimeJson, RuntimeFailure, safeToolCall, validateModelResponse } from "./runtimeSafety.js";

type ToolOutput = { type: "function_call_output"; call_id: string; output: string };
export interface PreservationRequest { paths: string[]; signal: AbortSignal }
export interface RuntimeDependencies {
  model(previousId: string | undefined, toolOutputs: ToolOutput[], finalRound: boolean, signal?: AbortSignal): Promise<unknown>;
  execute(name: string, raw: string): Promise<string>;
  allowedNames: ReadonlySet<string>;
  save(text: string): Promise<unknown>;
  preserve?(request: PreservationRequest): Promise<string>;
  diagnostic?(record: object): void;
}
export interface RuntimeLimits {
  maxRounds: number; maxToolCalls: number; maxDurationMs: number;
  modelTimeoutMs: number; toolTimeoutMs: number; preserveTimeoutMs: number; saveTimeoutMs: number;
}
export const DEFAULT_RUNTIME_LIMITS: RuntimeLimits = {
  maxRounds: 8, maxToolCalls: 24, maxDurationMs: 120_000,
  modelTimeoutMs: 30_000, toolTimeoutMs: 60_000, preserveTimeoutMs: 60_000, saveTimeoutMs: 5_000,
};
// This process owns one checkout. A timed-out operation retains the lease until it
// settles: do not race another turn against an in-flight write or replay it.
let activeRun: symbol | undefined;
export async function runClassroomRuntime(deps: RuntimeDependencies, options: number | Partial<RuntimeLimits> = {}): Promise<string> {
  if (activeRun) return "Another Classroom phase is still running or settling after a timeout. No new tools were started. Wait for it to finish before continuing; do not resend a potentially completed operation.";
  const lease = Symbol("classroom-run");
  activeRun = lease;
  const pending = new Set<Promise<unknown>>();
  const runId = randomUUID();
  const started = Date.now();
  const limits = { ...DEFAULT_RUNTIME_LIMITS };
  const requested = typeof options === "number" ? { maxRounds: options } : options;
  // Callers may tighten, but never disable production bounds with NaN/Infinity.
  for (const key of Object.keys(limits) as Array<keyof RuntimeLimits>) {
    const value = requested[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 1) limits[key] = Math.min(limits[key], Math.floor(value));
  }
  const log = deps.diagnostic ?? (record => console.info(JSON.stringify(record)));
  let rounds = 0, toolCalls = 0;
  const paths = new Set<string>();
  const seenCalls = new Set<string>();
  const notices: string[] = [];
  const emit = (stage: string, state: string) => {
    // Only internally generated stages, counts and timing. Never args/results/errors.
    try { log({ event: "classroom_runtime_stage", runId, stage, state, rounds, toolCalls, elapsedMs: Date.now() - started }); } catch { /* Logging must not break a turn. */ }
  };
  const bounded = async <T>(stage: string, timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    emit(stage, "start");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = Promise.resolve().then(() => operation(controller.signal));
    pending.add(work);
    void work.then(() => pending.delete(work), () => pending.delete(work));
    try {
      const result = await Promise.race([work, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new RuntimeFailure(stage, "aborted")); }, Math.max(1, timeoutMs));
      })]);
      emit(stage, "success");
      return result;
    } catch (error) { emit(stage, "failure"); throw error; }
    finally { if (timer) clearTimeout(timer); }
  };
  const remaining = () => limits.maxDurationMs - (Date.now() - started);
  const preserve = async (): Promise<string> => {
    if (!paths.size) return "No source writes from this phase require an automatic checkpoint. Existing branch work was not altered by preservation.";
    if (pending.size) return "An operation may still be running. Automatic checkpoint was withheld to avoid racing a write; remote preservation is NOT confirmed.";
    if (!deps.preserve) return "Automatic checkpoint is unavailable; remote preservation is NOT confirmed.";
    try {
      return await bounded("runtime.checkpoint", limits.preserveTimeoutMs, signal => deps.preserve!({ paths: [...paths], signal }));
    } catch (error) {
      return `${failureReport(error, "runtime.checkpoint").message} Remote preservation is NOT confirmed.`;
    }
  };
  let text = "";
  try {
    const request = async (previousId: string | undefined, outputs: ToolOutput[], final: boolean, stage: string) =>
      validateModelResponse(await atStage(stage, () => bounded(stage, Math.min(limits.modelTimeoutMs, remaining()), signal => deps.model(previousId, outputs, final, signal))), stage);
    let response = await request(undefined, [], false, "model.initial");
    let stopped = false;
    while (true) {
      const calls = response.output.filter(item => item.type === "function_call");
      if (!calls.length) {
        text = response.output_text.trim();
        if (!text) throw new RuntimeFailure("model.final", "empty_body");
        break;
      }
      if (rounds >= limits.maxRounds || toolCalls >= limits.maxToolCalls || remaining() <= 0) { stopped = true; break; }
      rounds++;
      const outputs: ToolOutput[] = [];
      for (const call of calls) {
        if (toolCalls >= limits.maxToolCalls || remaining() <= 0) { stopped = true; break; }
        if (seenCalls.has(call.call_id!)) throw new RuntimeFailure("model.tool_calls", "invalid_shape");
        seenCalls.add(call.call_id!);
        toolCalls++;
        const name = deps.allowedNames.has(call.name!) ? call.name! : "unknown";
        // Record an attempted write before executing: failed/aborted output does not
        // prove no side effect occurred. Checkpoint later independently validates it.
        if (name === "write_project_file" || name === "delete_project_file") {
          try {
            const args = parseRuntimeJson(call.arguments, "runtime.write_tracking") as { filePath?: unknown };
            if (typeof args?.filePath === "string") paths.add(args.filePath);
          } catch { /* safeToolCall returns a structured argument failure. */ }
        }
        const output = await safeToolCall(call.name!, call.arguments!, (tool, raw) => bounded(`tool.${name}.execute`, Math.min(limits.toolTimeoutMs, remaining()), () => deps.execute(tool, raw)), deps.allowedNames);
        outputs.push({ type: "function_call_output", call_id: call.call_id!, output });
        const result = parseRuntimeJson(output, "runtime.tool_envelope") as Record<string, unknown>;
        if (result.code === "CLASSROOM_RUNTIME_FAILURE") {
          notices.push(String(result.message));
          // Never proceed while the operation that timed out might still mutate.
          if (pending.size) { stopped = true; break; }
        }
      }
      if (stopped || rounds >= limits.maxRounds || toolCalls >= limits.maxToolCalls || remaining() <= 0) { stopped = true; break; }
      response = await request(response.id, outputs, rounds === limits.maxRounds - 1 || toolCalls === limits.maxToolCalls - 1, `model.followup.${rounds}`);
    }
    if (stopped) {
      emit("runtime.limit", "phase_ended");
      const preservation = await preserve();
      text = `This Classroom phase ended at its safe execution boundary after ${rounds} tool rounds and ${toolCalls} tool calls. Unexecuted calls were not run. ${preservation}\nContinue on the next turn after checking the current branch and working tree; the overall task is not necessarily complete.`;
    } else if (paths.size) {
      // Normal final answers also preserve validated milestones, not just limits.
      text += `\n\n${await preserve()}`;
    }
  } catch (error) {
    text = failureReport(error, "runtime").message;
    if (paths.size) text += `\n\n${await preserve()}`;
  }
  if (notices.length) text += `\n\nRuntime notices:\n${[...new Set(notices)].join("\n")}`;
  try { await atStage("database.assistant_save", () => bounded("database.assistant_save", limits.saveTimeoutMs, () => deps.save(text))); }
  catch (error) { text += `\n\n${failureReport(error, "database.assistant_save").message} This reply could not be saved to conversation history.`; }
  emit("runtime.final", "returned");
  // Do not clear a newer lease; drain potentially late tool side effects first.
  if (!pending.size) { if (activeRun === lease) activeRun = undefined; }
  else void Promise.allSettled([...pending]).then(() => { if (activeRun === lease) activeRun = undefined; });
  return text;
}
