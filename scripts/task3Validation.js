// Fixed offline validation; never retry a stage automatically.
// npm test runs focused/full tests and compilation where resources permit.
// Constrained hosts explicitly leave compilation unverified (nonzero aggregate exit).
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const suites = [
  "scripts/task3Validation.test.js",
  "src/ai/classroomKnowledge.test.ts", "src/ai/classroomKnowledge.integration.test.ts",
  "src/ai/instagramVisualResearch.test.ts", "src/ai/instagramVisualResearch.integration.test.ts",
  "src/ai/instagramVisualResearch.storage.test.ts", "src/classroom/runtimeSafety.test.ts",
  "src/classroom/responseTransport.test.ts", "src/classroom/ui/apiClient.test.js",
  "src/ai/publicVideo.test.ts", "src/ai/videoAnalysis.test.ts",
  "src/ai/designDirections.test.ts", "src/ai/researchVisualMemory.test.ts", "src/ai/fashionMemory.test.ts",
  "src/ai/fashionResearchPlanning.integration.test.ts",
];
const commands = {
  targeted: { args: ["--import", "tsx", "--test", "--test-concurrency=1", "src/ai/fashionMemory.test.ts", "src/ai/designDirections.test.ts", "src/ai/fashionResearchPlanning.integration.test.ts"], timeout: 15000 },
  typecheck: { args: ["node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false"], timeout: 120000 },
  full: { args: ["--import", "tsx", "--test", "--test-concurrency=1", ...suites], timeout: 45000 },
};
export function resourcePolicy(memoryMax, cpuMax) {
  const memory = Number(String(memoryMax ?? "").trim());
  const [quota, period] = String(cpuMax ?? "").trim().split(/\s+/).map(Number);
  const memoryBytes = Number.isFinite(memory) && memory > 0 ? memory : null;
  const cpuCores = Number.isFinite(quota) && quota > 0 && period > 0 ? quota / period : null;
  return { memoryBytes, cpuCores,
    constrained: (memoryBytes !== null && memoryBytes <= 512 * 1024 * 1024) || (cpuCores !== null && cpuCores <= 0.5) };
}
export function safeOutput(value) {
  return String(value ?? "")
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s'"<>]+/gi, "[REDACTED_URL]")
    .replace(/\b(Bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/\b(access_token|api_key|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(-24000);
}
export function stagesFor(mode) {
  if (mode === "all") return ["targeted", "typecheck", "full"];
  if (mode === "local") return ["targeted", "full"];
  if (Object.hasOwn(commands, mode ?? "")) return [mode];
  throw new Error("Expected all, local, targeted, typecheck, or full");
}
export function skippedCompiler(resources) {
  return { stage: "validation.typecheck", command: ["node", ...commands.typecheck.args],
    status: "unverified_resource_limit", success: false, skipped: true, attempt: 0,
    exitCode: null, signal: null, elapsedMs: 0, stdout: "", stderr: "",
    resources, reason: "Official full tsc previously timed out without diagnostics on this resource class. No retry here. Run npm run typecheck in larger CI; tests do not establish type safety." };
}
export async function main(mode) {
  const stages = stagesFor(mode);
  // Fixed public cgroup metadata only; no environment/secret enumeration.
  const metadata = await Promise.all(["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/cpu.max"].map(async path => {
    try { return await readFile(path, "utf8"); } catch { return null; }
  }));
  const resources = resourcePolicy(...metadata);
  const results = [];
  const diagnosticPath = new URL("../docs/TASK3_COMPILER_DIAGNOSTICS.md", import.meta.url);
  async function persist(state) {
    await mkdir(new URL("../docs/", import.meta.url), { recursive: true });
    await writeFile(diagnosticPath, "# Task 3 validation diagnostics\n\nGenerated offline validation, one attempt per stage; no live provider/database validation. Test success is not typecheck success.\n\n```json\n" + JSON.stringify({ state, mode, resources, results }, null, 2) + "\n```\n");
  }
  await persist("running");
  for (const stage of stages) {
    if (stage === "typecheck" && resources.constrained) {
      const skipped = skippedCompiler(resources);
      results.push(skipped);
      await persist("running");
      console.log(JSON.stringify(skipped));
      continue;
    }
    const { args, timeout } = commands[stage];
    const started = Date.now();
    const result = await new Promise(resolveResult => {
      execFile(process.execPath, args, { cwd: root, timeout, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        resolveResult({ stage: `validation.${stage}`, command: ["node", ...args], attempt: 1, timeoutMs: timeout,
          success: !error, exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
          signal: error?.signal ?? null, killed: error?.killed ?? false,
          failureCode: typeof error?.code === "string" ? error.code : null,
          elapsedMs: Date.now() - started, stdout: safeOutput(stdout), stderr: safeOutput(stderr),
          stdoutBytes: Buffer.byteLength(stdout ?? ""), stderrBytes: Buffer.byteLength(stderr ?? ""),
          outputPolicy: "URLs/credential patterns redacted; last 24000 characters per stream; 1 MiB capture limit" });
      });
    });
    results.push(result);
    await persist("running");
    // Detailed bounded output is retained in the file; keep tool responses small.
    console.log(JSON.stringify({ ...result, stdout: result.stdout.slice(-2000), stderr: result.stderr.slice(-2000) }));
  }
  const success = results.every(result => result.success);
  await persist(success ? "requested_stages_passed" : "failed_or_unverified");
  return success ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv[2]);
}
