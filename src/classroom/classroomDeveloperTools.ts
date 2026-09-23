import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod/v4";

import { prisma } from "../db/client.js";

const PROJECT_ROOT = path.resolve(
  process.env.ASTRA_PROJECT_ROOT ?? process.cwd(),
);

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".next",
]);

const BLOCKED_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
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
  const normalized = relativePath.trim() || ".";
  const absolutePath = path.resolve(PROJECT_ROOT, normalized);
  const relative = path.relative(PROJECT_ROOT, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the Astra project.");
  }

  return absolutePath;
}

function isBlockedFile(filePath: string): boolean {
  const basename = path.basename(filePath);

  if (BLOCKED_FILE_NAMES.has(basename)) {
    return true;
  }

  if (
    basename.endsWith(".pem") ||
    basename.endsWith(".key") ||
    basename.endsWith(".crt")
  ) {
    return true;
  }

  return false;
}

function isAllowedFile(filePath: string): boolean {
  if (isBlockedFile(filePath)) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();

  return ALLOWED_EXTENSIONS.has(extension);
}

export const listProjectFilesSchema = z.object({
  directory: z.string().nullable(),
  maxDepth: z.number().int().min(1).max(8).nullable(),
});

export const readProjectFileSchema = z.object({
  filePath: z.string().min(1).max(500),
  maxBytes: z.number().int().min(1000).max(100_000).nullable(),
});

export const saveCodeProposalSchema = z.object({
  sessionId: z.number().int().positive().nullable(),
  title: z.string().min(1).max(200),
  filePath: z.string().min(1).max(500),
  rationale: z.string().min(1),
  proposedCode: z.string().nullable(),
  diff: z.string().nullable(),
});

export const approveCodeProposalSchema = z.object({
  proposalId: z.number().int().positive(),
});

export const listProjectFilesTool = {
  type: "function" as const,
  name: "list_project_files",
  description:
    "List source files inside the Astra project for DEVELOPER mode. " +
    "Use this to understand the repository structure before proposing changes. " +
    "Secrets and environment files are excluded.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      directory: {
        type: ["string", "null"],
        description:
          "Relative project directory, for example 'src' or 'src/tools'.",
      },
      maxDepth: {
        type: ["integer", "null"],
        minimum: 1,
        maximum: 8,
        description: "Maximum recursive depth.",
      },
    },
    required: ["directory", "maxDepth"],
    additionalProperties: false,
  },
};

export const readProjectFileTool = {
  type: "function" as const,
  name: "read_project_file",
  description:
    "Read a source file from the Astra project in DEVELOPER mode. " +
    "Use this to inspect actual code before proposing changes. " +
    "Environment files, certificates, keys, and other secret files are blocked.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description:
          "Relative path inside the Astra project, for example 'src/ai/mushMush.ts'.",
      },
      maxBytes: {
        type: ["integer", "null"],
        minimum: 1000,
        maximum: 100000,
        description: "Maximum number of bytes to read.",
      },
    },
    required: ["filePath", "maxBytes"],
    additionalProperties: false,
  },
};

export const saveCodeProposalTool = {
  type: "function" as const,
  name: "save_code_proposal",
  description:
    "Save a proposed code change for human review. " +
    "This does NOT modify files. Use it when the human asks you to propose " +
    "or save a concrete implementation change.",
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
        description: "Short title for the proposed change.",
      },
      filePath: {
        type: "string",
        description: "Project file the proposal targets.",
      },
      rationale: {
        type: "string",
        description: "Why the proposed change should be made.",
      },
      proposedCode: {
        type: ["string", "null"],
        description: "Complete proposed file/code content when appropriate.",
      },
      diff: {
        type: ["string", "null"],
        description: "Optional unified diff.",
      },
    },
    required: [
      "sessionId",
      "title",
      "filePath",
      "rationale",
      "proposedCode",
      "diff",
    ],
    additionalProperties: false,
  },
};

export const approveCodeProposalTool = {
  type: "function" as const,
  name: "approve_code_proposal",
  description:
    "Mark a specific code proposal as approved after the authorized human " +
    "explicitly approves it. This still does NOT modify production files.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      proposalId: {
        type: "integer",
        minimum: 1,
      },
    },
    required: ["proposalId"],
    additionalProperties: false,
  },
};

async function walk(
  directory: string,
  depth: number,
  maxDepth: number,
  results: string[],
): Promise<void> {
  if (depth > maxDepth || results.length >= 300) {
    return;
  }

  const entries = await fs.readdir(directory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (results.length >= 300) {
      break;
    }

    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(absolutePath, depth + 1, maxDepth, results);
      continue;
    }

    if (!isAllowedFile(absolutePath)) {
      continue;
    }

    results.push(
      path.relative(PROJECT_ROOT, absolutePath).replaceAll("\\", "/"),
    );
  }
}

export async function listProjectFiles(
  args: z.infer<typeof listProjectFilesSchema>,
) {
  const directory = resolveProjectPath(args.directory ?? ".");
  const results: string[] = [];

  await walk(directory, 1, args.maxDepth ?? 4, results);

  return results.sort();
}

export async function readProjectFile(
  args: z.infer<typeof readProjectFileSchema>,
) {
  const absolutePath = resolveProjectPath(args.filePath);

  if (!isAllowedFile(absolutePath)) {
    throw new Error(
      "This file type or file name is not available to Classroom.",
    );
  }

  const maxBytes = args.maxBytes ?? 50_000;

  const buffer = await fs.readFile(absolutePath);

  if (buffer.byteLength > maxBytes) {
    throw new Error(
      `File is too large. Maximum allowed size is ${maxBytes} bytes.`,
    );
  }

  return {
    filePath: args.filePath,
    content: buffer.toString("utf8"),
  };
}

export async function saveCodeProposal(
  args: z.infer<typeof saveCodeProposalSchema>,
) {
  const filePath = resolveProjectPath(args.filePath);

  if (!isAllowedFile(filePath)) {
    throw new Error(
      "Code proposals cannot target blocked or unsupported files.",
    );
  }

  const proposal = await prisma.classroomCodeProposal.create({
    data: {
      sessionId: args.sessionId ?? null,
      title: args.title,
      filePath: args.filePath,
      rationale: args.rationale,
      proposedCode: args.proposedCode ?? null,
      diff: args.diff ?? null,
      status: "proposed",
    },
  });

  return {
    success: true,
    proposalId: proposal.id,
    status: proposal.status,
    message: "Code proposal saved for human review. No file was changed.",
  };
}

export async function approveCodeProposal(
  args: z.infer<typeof approveCodeProposalSchema>,
) {
  const proposal = await prisma.classroomCodeProposal.update({
    where: {
      id: args.proposalId,
    },
    data: {
      status: "approved",
    },
  });

  return {
    success: true,
    proposalId: proposal.id,
    status: proposal.status,
    message: "Proposal approved. No production file was modified.",
  };
}

export async function executeDeveloperTool(
  name: string,
  rawArguments: string,
): Promise<string> {
  switch (name) {
    case "list_project_files": {
      const parsed = listProjectFilesSchema.safeParse(JSON.parse(rawArguments));

      if (!parsed.success) {
        return JSON.stringify({
          error: "Invalid arguments",
          details: parsed.error.flatten(),
        });
      }

      return JSON.stringify(await listProjectFiles(parsed.data), null, 2);
    }

    case "read_project_file": {
      const parsed = readProjectFileSchema.safeParse(JSON.parse(rawArguments));

      if (!parsed.success) {
        return JSON.stringify({
          error: "Invalid arguments",
          details: parsed.error.flatten(),
        });
      }

      return JSON.stringify(await readProjectFile(parsed.data), null, 2);
    }

    case "save_code_proposal": {
      const parsed = saveCodeProposalSchema.safeParse(JSON.parse(rawArguments));

      if (!parsed.success) {
        return JSON.stringify({
          error: "Invalid arguments",
          details: parsed.error.flatten(),
        });
      }

      return JSON.stringify(await saveCodeProposal(parsed.data), null, 2);
    }

    case "approve_code_proposal": {
      const parsed = approveCodeProposalSchema.safeParse(
        JSON.parse(rawArguments),
      );

      if (!parsed.success) {
        return JSON.stringify({
          error: "Invalid arguments",
          details: parsed.error.flatten(),
        });
      }

      return JSON.stringify(await approveCodeProposal(parsed.data), null, 2);
    }

    default:
      return JSON.stringify({
        error: `Unknown developer tool: ${name}`,
      });
  }
}
