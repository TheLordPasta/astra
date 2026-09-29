import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat } from "node:fs/promises";
import path from "node:path";
import type { PreservationRequest } from "./classroomRuntime.js";
import { failureReport } from "./runtimeSafety.js";

const exec = promisify(execFile);
export interface CheckpointIO {
  command(command: string, args: string[], signal?: AbortSignal): Promise<string>;
  safePath(file: string): Promise<boolean>;
}
const root = path.resolve(process.env.ASTRA_PROJECT_ROOT ?? process.cwd());
const productionIO: CheckpointIO = {
  async command(command, args, signal) {
    const result = await exec(command, args, { cwd: root, timeout: 45_000, maxBuffer: 2 * 1024 * 1024, signal,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    return result.stdout;
  },
  async safePath(file) {
    if (!isCheckpointPath(file)) return false;
    const segments = file.split("/");
    for (let i = 1; i <= segments.length; i++) {
      try { if ((await lstat(path.join(root, ...segments.slice(0, i)))).isSymbolicLink()) return false; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false; }
    }
    return true;
  },
};
export function isCheckpointPath(file: string): boolean {
  if (!file || file.includes("\\") || file.startsWith("/") || file.includes("\0")) return false;
  const parts = file.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || part.startsWith(".") || ["node_modules", "dist", "coverage"].includes(part))) return false;
  if (/(secret|credential|private[-_]?key)/i.test(file)) return false;
  if (!/\.(ts|tsx|js|jsx|json|prisma|sql|md|html|css|yml|yaml)$/.test(file)) return false;
  return true;
}
function zeroList(raw: string): string[] { return raw.split("\0").filter(Boolean); }

// Snapshot before the first agent action; never include pre-existing or unrelated edits.
export async function createRuntimePreserver(io: CheckpointIO = productionIO): Promise<(request: PreservationRequest) => Promise<string>> {
  let baseline = "";
  let clean = false;
  try {
    baseline = (await io.command("git", ["rev-parse", "HEAD"])).trim();
    clean = !(await io.command("git", ["status", "--porcelain"])).trim();
  } catch { /* Read-only/chat turns still work without a Git checkout. */ }
  return async ({ paths, signal }) => {
    if (!clean || !baseline) return "Automatic checkpoint withheld: the phase did not start with a verified clean checkout. Existing work was preserved in place; remote preservation is NOT confirmed.";
    const git = (args: string[]) => io.command("git", args, signal);
    let committed = false;
    try {
      const branch = (await git(["branch", "--show-current"])).trim();
      if (!/^mushmush\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch) || branch.includes("..")) return "Automatic checkpoint withheld: not on a safe mushmush/* branch. No branch was switched.";
      await git(["merge-base", "--is-ancestor", baseline, "HEAD"]);
      if ((await git(["diff", "--cached", "--name-only", "-z"])).length) return "Automatic checkpoint withheld: pre-staged work requires review. No unrelated work was committed.";
      const changed = [...new Set([
        ...zeroList(await git(["diff", "--name-only", "--no-renames", "-z"])),
        ...zeroList(await git(["ls-files", "--others", "--exclude-standard", "-z"])),
      ])];
      const allowed = new Set(paths);
      for (const file of changed) {
        if (!allowed.has(file) || !isCheckpointPath(file) || !await io.safePath(file)) return "Automatic checkpoint withheld: unrelated, protected or unsafe paths require review. No files were discarded or overwritten; remote preservation is NOT confirmed.";
      }
      if (changed.length) {
        // Coherence is measured, not assumed. Compilation/tests must pass before commit.
        await io.command(process.platform === "win32" ? "npx.cmd" : "npx", ["tsc", "--noEmit"], signal);
        await io.command(process.platform === "win32" ? "npm.cmd" : "npm", ["test"], signal);
        // Recheck paths/staging/branch after checks; tests must not add unrelated artifacts.
        if ((await git(["branch", "--show-current"])).trim() !== branch || (await git(["diff", "--cached", "--name-only", "-z"])).length) throw new Error("state changed");
        const now = [...new Set([...zeroList(await git(["diff", "--name-only", "--no-renames", "-z"])), ...zeroList(await git(["ls-files", "--others", "--exclude-standard", "-z"]))])];
        if (now.length !== changed.length || now.some(file => !changed.includes(file))) throw new Error("paths changed");
        for (const file of now) if (!await io.safePath(file)) throw new Error("unsafe path");
        await git(["diff", "--check"]);
        await git(["add", "--", ...changed]);
        const staged = zeroList(await git(["diff", "--cached", "--name-only", "-z"]));
        if (staged.some(file => !changed.includes(file))) throw new Error("unrelated staging");
        await git(["diff", "--cached", "--check"]);
        await git(["commit", "--only", "-m", "chore: preserve validated Classroom phase", "--", ...changed]);
        committed = true;
      }
      // Also preserve an explicit agent commit that has not yet been pushed.
      const sha = (await git(["rev-parse", "HEAD"])).trim();
      await git(["push", "--set-upstream", "origin", branch]);
      if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("invalid SHA");
      return `Phase checkpoint is preserved on origin: ${branch}, commit ${sha}. Nothing was merged or deployed.`;
    } catch (error) {
      const report = failureReport(error, "runtime.checkpoint");
      return `${report.message} ${committed ? "A local checkpoint was committed, but" : "Checkpoint completion is uncertain;"} remote preservation is NOT confirmed. Inspect Git state before retrying. No reset or cleanup was attempted.`;
    }
  };
}
