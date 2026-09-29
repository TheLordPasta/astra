import { atStage, failureReport, RuntimeFailure, safeToolCall, validateModelResponse } from "./runtimeSafety.js";

type ToolOutput = { type: "function_call_output"; call_id: string; output: string };
export interface RuntimeDependencies {
  model(previousId: string | undefined, toolOutputs: ToolOutput[], finalRound: boolean): Promise<unknown>;
  execute(name: string, raw: string): Promise<string>;
  allowedNames: ReadonlySet<string>;
  save(text: string): Promise<unknown>;
}
// No automatic replay of tools or whole turns: an interrupted write may already have completed.
export async function runClassroomRuntime(deps: RuntimeDependencies, maxRounds = 40): Promise<string> {
  let text: string;
  try {
    let response = validateModelResponse(await atStage("model.initial", () => deps.model(undefined, [], false)), "model.initial");
    for (let round = 0; round < maxRounds; round++) {
      const calls = response.output.filter(item => item.type === "function_call");
      if (!calls.length) break;
      const outputs: ToolOutput[] = [];
      for (const call of calls) {
        outputs.push({ type: "function_call_output", call_id: call.call_id!,
          output: await safeToolCall(call.name!, call.arguments!, deps.execute, deps.allowedNames) });
      }
      const previousId = response.id;
      const stage = `model.followup.${round + 1}`;
      response = validateModelResponse(await atStage(stage, () => deps.model(previousId, outputs, round === maxRounds - 1)), stage);
    }
    if (response.output.some(item => item.type === "function_call")) throw new RuntimeFailure("model.final", "incomplete_model");
    text = response.output_text.trim();
    if (!text) throw new RuntimeFailure("model.final", "empty_body");
  } catch (error) {
    text = failureReport(error, "runtime").message;
  }
  try { await atStage("database.assistant_save", () => deps.save(text)); }
  catch (error) {
    const report = failureReport(error, "database.assistant_save");
    text += `\n\n${report.message} This reply could not be saved to conversation history.`;
  }
  return text;
}
