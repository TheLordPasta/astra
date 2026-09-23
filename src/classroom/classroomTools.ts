import { z } from "zod/v4";

import { createBaselineCommitTool } from "./classroomGit.js";

import {
  createDeveloperBranchTool,
  writeProjectFileTool,
  deleteProjectFileTool,
  commitDeveloperChangesTool,
  pushDeveloperBranchTool,
  createPullRequestTool,
  runDeveloperCheckTool,
  developerGitStateTool,
  executeDeveloperGitTool,
} from "./classroomGit.js";

import {
  approveCodeProposalTool,
  executeDeveloperTool,
  listProjectFilesTool,
  readProjectFileTool,
  saveCodeProposalTool,
} from "./classroomDeveloperTools.js";

import {
  executeResearchMemoryTool,
  researchMemoryTool,
} from "../tools/researchMemoryTool.js";

import { learnFromCustomerConversations } from "./customerConversationLearning.js";

import {
  executeMarketResearchTool,
  marketResearchTool,
} from "../tools/marketResearchTool.js";

import {
  approveClassroomInsight,
  createClassroomInsight,
  createClassroomLesson,
} from "./classroomDb.js";

import {
  searchCustomerLearning,
  searchCustomerLearningSchema,
} from "./classroomCustomerLearning.js";

import type { ClassroomMode } from "./classroomTypes.js";

const saveLessonSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().nullable(),
  content: z.string().min(1),
  source: z.string().nullable(),
});

const proposeInsightSchema = z.object({
  type: z.string().min(1).max(100),
  subject: z.string().min(1).max(200),
  statement: z.string().min(1),
  evidence: z.string().nullable(),
  sourceType: z.string().min(1).max(50),
  sourceRef: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

const approveInsightSchema = z.object({
  insightId: z.number().int().positive(),
});

const searchCustomerLearningTool = {
  type: "function" as const,
  name: "search_customer_learning",
  description:
    "Search evidence-based observations collected from Classic Textile customers. " +
    "Use this in Classroom LEARN mode to find repeated patterns across different customers. " +
    "Customer observations are evidence, not automatic truth. Do not treat one customer's statement as a general market fact.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      query: {
        type: ["string", "null"],
        description:
          "Optional natural-language search, for example 'lace', 'non-transparent', or 'bridal'.",
      },
      type: {
        type: ["string", "null"],
        description: "Optional observation type.",
      },
      customerId: {
        type: ["integer", "null"],
        minimum: 1,
        description:
          "Optional customer ID. Leave null when looking for cross-customer patterns.",
      },
      limit: {
        type: ["integer", "null"],
        minimum: 1,
        description: "Maximum number of observations to return.",
      },
    },
    required: ["query", "type", "customerId", "limit"],
    additionalProperties: false,
  },
};

const saveClassroomLessonTool = {
  type: "function" as const,
  name: "save_classroom_lesson",
  description:
    "Save an explicit lesson taught by the authorized human into Mush Mush's permanent Classroom knowledge. " +
    "Use this only when the human is clearly teaching something or explicitly asks you to remember/save it.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short lesson title.",
      },
      category: {
        type: ["string", "null"],
        description: "Optional lesson category.",
      },
      content: {
        type: "string",
        description: "The lesson that should be remembered.",
      },
      source: {
        type: ["string", "null"],
        description: "Optional source or context.",
      },
    },
    required: ["title", "category", "content", "source"],
    additionalProperties: false,
  },
};

const proposeClassroomInsightTool = {
  type: "function" as const,
  name: "propose_classroom_insight",
  description:
    "Create a proposed Classroom insight based on evidence. " +
    "Use this when multiple customer observations or research evidence support a potentially useful generalization. " +
    "Never mark the insight approved yourself.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description:
          "Insight type, for example customer_pattern, market_pattern, product_pattern, or opportunity.",
      },
      subject: {
        type: "string",
        description: "The subject of the insight.",
      },
      statement: {
        type: "string",
        description: "The proposed general insight.",
      },
      evidence: {
        type: ["string", "null"],
        description: "Evidence supporting the insight.",
      },
      sourceType: {
        type: "string",
        description:
          "Evidence source, for example customer_observations or market_research.",
      },
      sourceRef: {
        type: ["string", "null"],
        description:
          "Optional reference to the supporting source or observation IDs.",
      },
      confidence: {
        type: ["number", "null"],
        minimum: 0,
        maximum: 1,
        description:
          "Evidence-quality confidence, not importance or business value.",
      },
    },
    required: [
      "type",
      "subject",
      "statement",
      "evidence",
      "sourceType",
      "sourceRef",
      "confidence",
    ],
    additionalProperties: false,
  },
};

const approveClassroomInsightTool = {
  type: "function" as const,
  name: "approve_classroom_insight",
  description:
    "Approve a proposed Classroom insight. ONLY use this when the authorized human explicitly asks you to approve that specific insight.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      insightId: {
        type: "integer",
        minimum: 1,
      },
    },
    required: ["insightId"],
    additionalProperties: false,
  },
};

const learnFromCustomerConversationsTool = {
  type: "function" as const,
  name: "learn_from_customer_conversations",
  description:
    "Analyze recent stored customer conversations and save grounded, " +
    "business-relevant customer observations. Use this in LEARN mode " +
    "when the human asks you to learn from customer conversations. " +
    "This does not create market trends or approve insights.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      days: {
        type: ["integer", "null"],
        minimum: 1,
        description:
          "How many recent days of customer conversations to analyze.",
      },
      maxCustomers: {
        type: ["integer", "null"],
        minimum: 1,
        description: "Maximum number of customers to analyze.",
      },
      maxMessages: {
        type: ["integer", "null"],
        minimum: 20,
        description: "Maximum number of customer messages to analyze.",
      },
    },
    required: ["days", "maxCustomers", "maxMessages"],
    additionalProperties: false,
  },
};

export function getClassroomTools(mode: ClassroomMode) {
  const tools = [];

  if (mode === "TEACH") {
    tools.push(researchMemoryTool, saveClassroomLessonTool);
  }

  if (mode === "LEARN") {
    tools.push(
      learnFromCustomerConversationsTool,
      searchCustomerLearningTool,
      proposeClassroomInsightTool,
      approveClassroomInsightTool,
    );
  }

  if (mode === "RESEARCH") {
    tools.push(
      researchMemoryTool,
      marketResearchTool,
      proposeClassroomInsightTool,
      approveClassroomInsightTool,
    );
  }

  if (mode === "DEVELOPER") {
    tools.push(
      listProjectFilesTool,
      readProjectFileTool,

      createBaselineCommitTool,
      createDeveloperBranchTool,
      writeProjectFileTool,
      deleteProjectFileTool,

      runDeveloperCheckTool,
      developerGitStateTool,

      saveCodeProposalTool,
      approveCodeProposalTool,

      commitDeveloperChangesTool,
      pushDeveloperBranchTool,
      createPullRequestTool,

      researchMemoryTool,
    );
  }

  return tools;
}

export async function executeClassroomTool(
  name: string,
  rawArguments: string,
): Promise<string> {
  try {
    const developerGitToolNames = new Set([
      "create_baseline_commit",
      "create_developer_branch",
      "write_project_file",
      "delete_project_file",
      "run_developer_check",
      "get_developer_git_state",
      "commit_developer_changes",
      "push_developer_branch",
      "create_pull_request",
    ]);

    if (developerGitToolNames.has(name)) {
      return await executeDeveloperGitTool(name, rawArguments);
    }

    const developerToolNames = new Set([
      "list_project_files",
      "read_project_file",
      "save_code_proposal",
      "approve_code_proposal",
    ]);

    if (developerToolNames.has(name)) {
      return await executeDeveloperTool(name, rawArguments);
    }
    switch (name) {
      case "get_research_memory":
        return await executeResearchMemoryTool(rawArguments);

      case "run_market_research":
        return await executeMarketResearchTool(rawArguments);

      case "search_customer_learning": {
        const parsed = searchCustomerLearningSchema.safeParse(
          JSON.parse(rawArguments),
        );

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        const observations = await searchCustomerLearning(parsed.data);

        return JSON.stringify(observations, null, 2);
      }

      case "save_classroom_lesson": {
        const parsed = saveLessonSchema.safeParse(JSON.parse(rawArguments));

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        const lesson = await createClassroomLesson(parsed.data);

        return JSON.stringify({
          success: true,
          lessonId: lesson.id,
          title: lesson.title,
        });
      }

      case "propose_classroom_insight": {
        const parsed = proposeInsightSchema.safeParse(JSON.parse(rawArguments));

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        const insight = await createClassroomInsight(parsed.data);

        return JSON.stringify({
          success: true,
          insightId: insight.id,
          status: insight.status,
          statement: insight.statement,
        });
      }

      case "approve_classroom_insight": {
        const parsed = approveInsightSchema.safeParse(JSON.parse(rawArguments));

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        const insight = await approveClassroomInsight(parsed.data.insightId);

        return JSON.stringify({
          success: true,
          insightId: insight.id,
          status: insight.status,
        });
      }

      case "learn_from_customer_conversations": {
        const parsed = z
          .object({
            days: z.number().int().min(1).max(365).nullable(),
            maxCustomers: z.number().int().min(1).max(100).nullable(),
            maxMessages: z.number().int().min(20).max(1000).nullable(),
          })
          .safeParse(JSON.parse(rawArguments));

        if (!parsed.success) {
          return JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.flatten(),
          });
        }

        return await learnFromCustomerConversations({
          ...(parsed.data.days != null ? { days: parsed.data.days } : {}),
          ...(parsed.data.maxCustomers != null
            ? { maxCustomers: parsed.data.maxCustomers }
            : {}),
          ...(parsed.data.maxMessages != null
            ? { maxMessages: parsed.data.maxMessages }
            : {}),
        });
      }

      default:
        return JSON.stringify({
          error: `Unknown Classroom tool: ${name}`,
        });
    }
  } catch (error) {
    return JSON.stringify({
      error:
        error instanceof Error ? error.message : "Unknown Classroom tool error",
    });
  }
}
