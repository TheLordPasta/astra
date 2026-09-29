import {
  atStage,
  failureReport,
  RuntimeFailure,
  safeToolCall,
  validateModelResponse,
} from "./runtimeSafety.js";

type ToolOutput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

export interface RuntimeDependencies {
  model(
    previousId: string | undefined,
    toolOutputs: ToolOutput[],
    finalRound: boolean,
  ): Promise<unknown>;

  execute(name: string, raw: string): Promise<string>;

  allowedNames: ReadonlySet<string>;

  save(text: string): Promise<unknown>;
}

const DEFAULT_MAX_ROUNDS = 6;
const DEFAULT_MAX_TOOL_CALLS = 16;

export async function runClassroomRuntime(
  deps: RuntimeDependencies,
  maxRounds = DEFAULT_MAX_ROUNDS,
  maxToolCalls = DEFAULT_MAX_TOOL_CALLS,
): Promise<string> {
  let text: string;
  let toolCallsUsed = 0;

  try {
    let response = validateModelResponse(
      await atStage("model.initial", () => deps.model(undefined, [], false)),
      "model.initial",
    );

    for (let round = 0; round < maxRounds; round++) {
      const calls = response.output.filter(
        (item) => item.type === "function_call",
      );

      if (!calls.length) {
        break;
      }

      if (toolCallsUsed + calls.length > maxToolCalls) {
        text =
          "I reached the safe development limit for this turn. " +
          "The work completed so far should be checked and preserved before continuing. " +
          "Send 'continue' and I will resume from the current state.";

        await saveSafely(deps, text);
        return text;
      }

      const outputs: ToolOutput[] = [];

      for (const call of calls) {
        toolCallsUsed++;

        outputs.push({
          type: "function_call_output",
          call_id: call.call_id!,
          output: await safeToolCall(
            call.name!,
            call.arguments!,
            deps.execute,
            deps.allowedNames,
          ),
        });
      }

      const previousId = response.id;
      const finalRound = round === maxRounds - 1;
      const stage = `model.followup.${round + 1}`;

      response = validateModelResponse(
        await atStage(stage, () => deps.model(previousId, outputs, finalRound)),
        stage,
      );
    }

    if (response.output.some((item) => item.type === "function_call")) {
      throw new RuntimeFailure("model.final", "incomplete_model");
    }

    text = response.output_text.trim();

    if (!text) {
      throw new RuntimeFailure("model.final", "empty_body");
    }
  } catch (error) {
    text = failureReport(error, "runtime").message;
  }

  text = await saveSafely(deps, text);

  return text;
}

async function saveSafely(
  deps: RuntimeDependencies,
  text: string,
): Promise<string> {
  try {
    await atStage("database.assistant_save", () => deps.save(text));

    return text;
  } catch (error) {
    const report = failureReport(error, "database.assistant_save");

    return (
      text +
      `\n\n${report.message} ` +
      "This reply could not be saved to conversation history."
    );
  }
}
