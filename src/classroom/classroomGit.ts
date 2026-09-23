import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import { z } from "zod/v4";

import { prisma } from "../db/client.js";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.resolve(
  process.env.ASTRA_PROJECT_ROOT ?? process.cwd(),
);

const BLOCKED_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
]);

const BLOCKED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".prisma",
  ".sql",
  ".md",
  ".html",
  ".css",
  ".yml",
  ".yaml",
]);

function resolveProjectPath(relativePath: string): string {
  const absolute = path.resolve(PROJECT_ROOT, relativePath);
  const relative = path.relative(PROJECT_ROOT, absolute);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the Astra project.");
  }

  return absolute;
}

function isBlockedPath(filePath: string): boolean {
  const relative = path.relative(PROJECT_ROOT, filePath);
  const parts = relative.split(path.sep);

  if (parts.some((part) => BLOCKED_DIRECTORIES.has(part))) {
    return true;
  }

  const basename = path.basename(filePath);

  if (BLOCKED_FILE_NAMES.has(basename)) {
    return true;
  }

  if (
    basename.endsWith(".pem") ||
    basename.endsWith(".key") ||
    basename.endsWith(".crt") ||
    basename.endsWith(".p12") ||
    basename.endsWith(".pfx")
  ) {
    return true;
  }

  return false;
}

function isAllowedSourceFile(filePath: string): boolean {
  if (isBlockedPath(filePath)) {
    return false;
  }

  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function assertDeveloperBranch(branchName?: string): void {
  const branch = branchName ?? "";

  if (!branch.startsWith("mushmush/")) {
    throw new Error(
      "Developer changes are only allowed on a mushmush/* branch.",
    );
  }

  if (
    branch === "mushmush/" ||
    branch.includes("..") ||
    branch.includes("\\")
  ) {
    throw new Error("Invalid developer branch name.");
  }
}

async function runGit(args: string[]): Promise<{
  stdout: string;
  stderr: string;
}> {
  const result = await execFileAsync("git", args, {
    cwd: PROJECT_ROOT,
    maxBuffer: 2 * 1024 * 1024,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function getCurrentBranch(): Promise<string> {
  const result = await runGit(["branch", "--show-current"]);

  return result.stdout.trim();
}

async function requireDeveloperBranch(): Promise<string> {
  const branch = await getCurrentBranch();

  assertDeveloperBranch(branch);

  return branch;
}

export const createDeveloperBranchSchema = z.object({
  name: z.string().min(3).max(80),
});

export const writeProjectFileSchema = z.object({
  filePath: z.string().min(1).max(500),
  content: z.string().max(300_000),
});

export const deleteProjectFileSchema = z.object({
  filePath: z.string().min(1).max(500),
});

export const commitDeveloperChangesSchema = z.object({
  sessionId: z.number().int().positive().nullable(),
  paths: z.array(z.string().min(1).max(500)).min(1).max(50),
  message: z.string().min(5).max(200),
});

export const pushDeveloperBranchSchema = z.object({
  sessionId: z.number().int().positive().nullable(),
});

export const createPullRequestSchema = z.object({
  sessionId: z.number().int().positive().nullable(),
  title: z.string().min(5).max(200),
  body: z.string().min(1).max(10_000),
  base: z.string().min(1).max(100).nullable(),
});

export const runDeveloperCheckSchema = z.object({
  check: z.enum([
    "typecheck",
    "prisma_validate",
    "prisma_generate",
    "test",
    "git_status",
    "git_diff",
  ]),
});

export const developerGitStateSchema = z.object({});

export const createDeveloperBranchTool = {
  type: "function" as const,
  name: "create_developer_branch",
  description:
    "Create a dedicated mushmush/* Git branch for developer work. " +
    "Refuses to create a branch when the working tree contains uncommitted changes. " +
    "Never modify main or master directly.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Short branch name such as 'classroom-redesign' or 'research-memory-improvement'.",
      },
    },
    required: ["name"],
    additionalProperties: false,
  },
};

export const writeProjectFileTool = {
  type: "function" as const,
  name: "write_project_file",
  description:
    "Create or replace a source file inside Astra during DEVELOPER mode. " +
    "Only works on a mushmush/* branch. Secrets, environment files, Git internals, " +
    "and unsupported file types are blocked. An existing file is backed up before writing.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description:
          "Relative project path, for example 'src/classroom/classroomView.ts'.",
      },
      content: {
        type: "string",
        description: "Complete new file content.",
      },
    },
    required: ["filePath", "content"],
    additionalProperties: false,
  },
};

export const deleteProjectFileTool = {
  type: "function" as const,
  name: "delete_project_file",
  description:
    "Delete a source file during DEVELOPER mode. Only works on a mushmush/* branch. " +
    "The deleted file is backed up first. Secrets and unsupported paths are blocked.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Relative project path to delete.",
      },
    },
    required: ["filePath"],
    additionalProperties: false,
  },
};

export const commitDeveloperChangesTool = {
  type: "function" as const,
  name: "commit_developer_changes",
  description:
    "Commit implemented developer changes to the current mushmush/* branch. " +
    "Stage only the explicitly listed files. Never commit secrets. " +
    "Use only after the implementation and validation checks are complete.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: ["integer", "null"],
        minimum: 1,
      },
      paths: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "Exact project-relative files that should be included in the commit.",
      },
      message: {
        type: "string",
        description: "Commit message.",
      },
    },
    required: ["sessionId", "paths", "message"],
    additionalProperties: false,
  },
};

export const pushDeveloperBranchTool = {
  type: "function" as const,
  name: "push_developer_branch",
  description:
    "Push the current mushmush/* branch to the Git remote. " +
    "Never force-push and never push main/master.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: ["integer", "null"],
        minimum: 1,
      },
    },
    required: ["sessionId"],
    additionalProperties: false,
  },
};

export const createPullRequestTool = {
  type: "function" as const,
  name: "create_pull_request",
  description:
    "Create a GitHub pull request from the current mushmush/* branch. " +
    "This never merges the pull request. Human review and merge remain required.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: ["integer", "null"],
        minimum: 1,
      },
      title: {
        type: "string",
        description: "Pull request title.",
      },
      body: {
        type: "string",
        description: "Pull request description.",
      },
      base: {
        type: ["string", "null"],
        description:
          "Base branch, normally 'main'. Null means let GitHub CLI use its default.",
      },
    },
    required: ["sessionId", "title", "body", "base"],
    additionalProperties: false,
  },
};

export const runDeveloperCheckTool = {
  type: "function" as const,
  name: "run_developer_check",
  description:
    "Run a safe predefined development check inside Astra. " +
    "Arbitrary shell commands are not allowed.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      check: {
        type: "string",
        enum: [
          "typecheck",
          "prisma_validate",
          "prisma_generate",
          "test",
          "git_status",
          "git_diff",
        ],
      },
    },
    required: ["check"],
    additionalProperties: false,
  },
};

export const developerGitStateTool = {
  type: "function" as const,
  name: "get_developer_git_state",
  description:
    "Inspect the current Git branch, working tree, latest commit, and remote state.",
  strict: true,
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

export async function createDeveloperBranch(
  args: z.infer<typeof createDeveloperBranchSchema>,
) {
  const status = await runGit(["status", "--porcelain"]);

  if (status.stdout.trim()) {
    throw new Error(
      "Cannot create a developer branch because the working tree contains uncommitted changes. Protect the existing work before branching.",
    );
  }

  const currentBranch = await getCurrentBranch();

  if (
    currentBranch === "main" ||
    currentBranch === "master" ||
    currentBranch === "develop"
  ) {
    // allowed: this is the normal starting point
  }

  const cleanName = args.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!cleanName) {
    throw new Error("Invalid developer branch name.");
  }

  const branchName = `mushmush/${cleanName}`;

  const existing = await runGit(["branch", "--list", branchName]);

  if (existing.stdout.trim()) {
    await runGit(["switch", branchName]);
  } else {
    await runGit(["switch", "-c", branchName]);
  }

  return {
    success: true,
    branchName,
  };
}

export async function writeProjectFile(
  args: z.infer<typeof writeProjectFileSchema>,
) {
  const branch = await requireDeveloperBranch();

  const filePath = resolveProjectPath(args.filePath);

  if (!isAllowedSourceFile(filePath)) {
    throw new Error(
      "This file type or path is not available for Developer writes.",
    );
  }

  const directory = path.dirname(filePath);

  await fs.mkdir(directory, {
    recursive: true,
  });

  let backupPath: string | null = null;

  try {
    await fs.access(filePath);

    const backupRoot = path.join(
      os.tmpdir(),
      "astra-classroom-backups",
      new Date().toISOString().replace(/[:.]/g, "-"),
    );

    backupPath = path.join(backupRoot, args.filePath);

    await fs.mkdir(path.dirname(backupPath), {
      recursive: true,
    });

    await fs.copyFile(filePath, backupPath);
  } catch {
    // File does not exist; this is a new file.
  }

  await fs.writeFile(filePath, args.content, "utf8");

  const hash = crypto.createHash("sha256").update(args.content).digest("hex");

  return {
    success: true,
    branch,
    filePath: args.filePath,
    createdOrUpdated: true,
    backupPath,
    sha256: hash,
  };
}

export async function deleteProjectFile(
  args: z.infer<typeof deleteProjectFileSchema>,
) {
  const branch = await requireDeveloperBranch();

  const filePath = resolveProjectPath(args.filePath);

  if (!isAllowedSourceFile(filePath)) {
    throw new Error(
      "This file type or path is not available for Developer deletion.",
    );
  }

  await fs.access(filePath);

  const backupRoot = path.join(
    os.tmpdir(),
    "astra-classroom-backups",
    new Date().toISOString().replace(/[:.]/g, "-"),
    "deleted",
  );

  const backupPath = path.join(backupRoot, args.filePath);

  await fs.mkdir(path.dirname(backupPath), {
    recursive: true,
  });

  await fs.copyFile(filePath, backupPath);

  await fs.unlink(filePath);

  return {
    success: true,
    branch,
    filePath: args.filePath,
    deleted: true,
    backupPath,
  };
}

export async function runDeveloperCheck(
  args: z.infer<typeof runDeveloperCheckSchema>,
) {
  const commands: Record<
    z.infer<typeof runDeveloperCheckSchema>["check"],
    { command: string; args: string[] }
  > = {
    typecheck: {
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["tsc", "--noEmit"],
    },
    prisma_validate: {
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["prisma", "validate"],
    },
    prisma_generate: {
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["prisma", "generate"],
    },
    test: {
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["test"],
    },
    git_status: {
      command: "git",
      args: ["status", "--short", "--branch"],
    },
    git_diff: {
      command: "git",
      args: ["diff", "--stat"],
    },
  };

  const selected = commands[args.check];

  const result = await execFileAsync(selected.command, selected.args, {
    cwd: PROJECT_ROOT,
    maxBuffer: 2 * 1024 * 1024,
  });

  return {
    check: args.check,
    success: true,
    output: (result.stdout + (result.stderr ? `\n${result.stderr}` : "")).slice(
      0,
      50_000,
    ),
  };
}

export async function getDeveloperGitState() {
  const branch = await getCurrentBranch();

  const status = await runGit(["status", "--short", "--branch"]);

  const latest = await runGit(["log", "-1", "--oneline"]);

  const remote = await runGit(["remote", "-v"]);

  return {
    branch,
    status: status.stdout.slice(0, 20_000),
    latestCommit: latest.stdout.trim(),
    remotes: remote.stdout.slice(0, 10_000),
  };
}

export async function commitDeveloperChanges(
  args: z.infer<typeof commitDeveloperChangesSchema>,
) {
  const branch = await requireDeveloperBranch();

  for (const relativePath of args.paths) {
    const absolutePath = resolveProjectPath(relativePath);

    if (!isAllowedSourceFile(absolutePath)) {
      throw new Error(
        `Cannot commit blocked or unsupported path: ${relativePath}`,
      );
    }
  }

  await runGit(["add", "--", ...args.paths]);

  const staged = await runGit(["diff", "--cached", "--name-only"]);

  const stagedFiles = staged.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  for (const stagedFile of stagedFiles) {
    const absolutePath = resolveProjectPath(stagedFile);

    if (!isAllowedSourceFile(absolutePath)) {
      await runGit(["restore", "--staged", "--", stagedFile]);

      throw new Error(`Blocked file entered the staging area: ${stagedFile}`);
    }
  }

  if (stagedFiles.length === 0) {
    throw new Error("Nothing is staged for commit.");
  }

  try {
    await runGit(["diff", "--cached", "--check"]);
  } catch (error) {
    throw new Error(
      `Git staged-diff check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  await runGit(["commit", "-m", args.message]);

  const sha = (await runGit(["rev-parse", "HEAD"])).stdout.trim();

  const commit = await prisma.classroomGitCommit.create({
    data: {
      sessionId: args.sessionId ?? null,
      branchName: branch,
      commitSha: sha,
      commitMessage: args.message,
      status: "committed",
    },
  });

  return {
    success: true,
    commitId: commit.id,
    branch,
    commitSha: sha,
    commitMessage: args.message,
    files: stagedFiles,
    status: "committed",
  };
}

export async function pushDeveloperBranch(
  args: z.infer<typeof pushDeveloperBranchSchema>,
) {
  const branch = await requireDeveloperBranch();

  await runGit(["push", "--set-upstream", "origin", branch]);

  const commitWhere =
    args.sessionId != null
      ? {
          sessionId: args.sessionId,
          branchName: branch,
        }
      : {
          branchName: branch,
        };

  const commit = await prisma.classroomGitCommit.findFirst({
    where: commitWhere,
    orderBy: {
      createdAt: "desc",
    },
  });

  if (commit) {
    await prisma.classroomGitCommit.update({
      where: {
        id: commit.id,
      },
      data: {
        pushedAt: new Date(),
        status: "pushed",
      },
    });
  }

  return {
    success: true,
    branch,
    status: "pushed",
  };
}

export const createBaselineCommitSchema = z.object({
  sessionId: z.number().int().positive().nullable(),
  message: z.string().min(5).max(200),
  confirmed: z.boolean(),
});

export const createBaselineCommitTool = {
  type: "function" as const,
  name: "create_baseline_commit",
  description:
    "Create a one-time baseline Git commit containing the currently existing " +
    "Astra work so the working tree can be made clean before starting a new " +
    "mushmush/* developer branch. Use ONLY when the authorized human explicitly " +
    "asks you to preserve the current work as a baseline commit. This is a " +
    "bootstrap operation, not normal self-improvement. Secrets and environment " +
    "files are never committed.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: ["integer", "null"],
        minimum: 1,
      },
      message: {
        type: "string",
        description:
          "Baseline commit message, for example 'chore: baseline Astra before Mush Mush development'.",
      },
      confirmed: {
        type: "boolean",
        description:
          "Must be true only when the human explicitly authorized preserving the existing working tree as a baseline commit.",
      },
    },
    required: ["sessionId", "message", "confirmed"],
    additionalProperties: false,
  },
};

export async function createBaselineCommit(
  args: z.infer<typeof createBaselineCommitSchema>,
) {
  if (!args.confirmed) {
    throw new Error("Baseline commit requires explicit human confirmation.");
  }

  const branch = await getCurrentBranch();

  const status = await runGit(["status", "--porcelain"]);

  if (!status.stdout.trim()) {
    return {
      success: true,
      branch,
      status: "already_clean",
      message:
        "The working tree is already clean. No baseline commit was needed.",
    };
  }

  await runGit(["add", "--all"]);

  const staged = await runGit(["diff", "--cached", "--name-only"]);

  const stagedFiles = staged.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (stagedFiles.length === 0) {
    throw new Error("Git reported changes, but nothing could be staged.");
  }

  for (const stagedFile of stagedFiles) {
    const absolutePath = resolveProjectPath(stagedFile);

    if (isBlockedPath(absolutePath)) {
      await runGit(["reset"]);

      throw new Error(
        `Baseline commit refused because a protected file is part of the working tree: ${stagedFile}`,
      );
    }
  }

  try {
    await runGit(["diff", "--cached", "--check"]);
  } catch (error) {
    await runGit(["reset"]);

    throw new Error(
      `Baseline staged-diff check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  await runGit(["commit", "-m", args.message]);

  const sha = (await runGit(["rev-parse", "HEAD"])).stdout.trim();

  const commit = await prisma.classroomGitCommit.create({
    data: {
      sessionId: args.sessionId ?? null,
      branchName: branch,
      commitSha: sha,
      commitMessage: args.message,
      status: "baseline",
    },
  });

  const cleanStatus = await runGit(["status", "--porcelain"]);

  if (cleanStatus.stdout.trim()) {
    throw new Error(
      "Baseline commit completed, but the working tree is still not clean.",
    );
  }

  return {
    success: true,
    commitId: commit.id,
    branch,
    commitSha: sha,
    commitMessage: args.message,
    files: stagedFiles,
    status: "baseline",
    workingTree: "clean",
  };
}

export async function createPullRequest(
  args: z.infer<typeof createPullRequestSchema>,
) {
  const branch = await requireDeveloperBranch();

  const status = await runGit(["status", "--porcelain"]);

  if (status.stdout.trim()) {
    throw new Error("Cannot create a pull request with uncommitted changes.");
  }

  const base = args.base ?? "main";

  const executable = process.platform === "win32" ? "gh.exe" : "gh";

  const result = await execFileAsync(
    executable,
    [
      "pr",
      "create",
      "--base",
      base,
      "--head",
      branch,
      "--title",
      args.title,
      "--body",
      args.body,
    ],
    {
      cwd: PROJECT_ROOT,
      maxBuffer: 200_000,
    },
  );

  const url = result.stdout.trim();

  const commitWhere =
    args.sessionId != null
      ? {
          sessionId: args.sessionId,
          branchName: branch,
        }
      : {
          branchName: branch,
        };

  const commit = await prisma.classroomGitCommit.findFirst({
    where: commitWhere,
    orderBy: {
      createdAt: "desc",
    },
  });

  if (commit) {
    await prisma.classroomGitCommit.update({
      where: {
        id: commit.id,
      },
      data: {
        prUrl: url,
        status: "pull_request_open",
      },
    });
  }

  return {
    success: true,
    branch,
    base,
    pullRequestUrl: url,
    status: "pull_request_open",
    message: "Pull request created. Human review and merge are still required.",
  };
}

export async function executeDeveloperGitTool(
  name: string,
  rawArguments: string,
): Promise<string> {
  try {
    switch (name) {
      case "create_developer_branch": {
        const parsed = createDeveloperBranchSchema.safeParse(
          JSON.parse(rawArguments),
        );

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        return JSON.stringify(
          await createDeveloperBranch(parsed.data),
          null,
          2,
        );
      }

      case "create_baseline_commit": {
        const parsed = createBaselineCommitSchema.safeParse(
          JSON.parse(rawArguments),
        );

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        return JSON.stringify(await createBaselineCommit(parsed.data), null, 2);
      }

      case "write_project_file": {
        const parsed = writeProjectFileSchema.safeParse(
          JSON.parse(rawArguments),
        );

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        return JSON.stringify(await writeProjectFile(parsed.data), null, 2);
      }

      case "delete_project_file": {
        const parsed = deleteProjectFileSchema.safeParse(
          JSON.parse(rawArguments),
        );

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        return JSON.stringify(await deleteProjectFile(parsed.data), null, 2);
      }

      case "run_developer_check": {
        const parsed = runDeveloperCheckSchema.safeParse(
          JSON.parse(rawArguments),
        );

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        return JSON.stringify(await runDeveloperCheck(parsed.data), null, 2);
      }

      case "get_developer_git_state": {
        return JSON.stringify(await getDeveloperGitState(), null, 2);
      }

      case "commit_developer_changes": {
        const parsed = commitDeveloperChangesSchema.safeParse(
          JSON.parse(rawArguments),
        );

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        return JSON.stringify(
          await commitDeveloperChanges(parsed.data),
          null,
          2,
        );
      }

      case "push_developer_branch": {
        const parsed = pushDeveloperBranchSchema.safeParse(
          JSON.parse(rawArguments),
        );

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        return JSON.stringify(await pushDeveloperBranch(parsed.data), null, 2);
      }

      case "create_pull_request": {
        const parsed = createPullRequestSchema.safeParse(
          JSON.parse(rawArguments),
        );

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        return JSON.stringify(await createPullRequest(parsed.data), null, 2);
      }

      default:
        return JSON.stringify({
          error: `Unknown Git developer tool: ${name}`,
        });
    }
  } catch (error) {
    return JSON.stringify({
      error:
        error instanceof Error
          ? error.message
          : "Developer Git operation failed.",
    });
  }
}
