import { z } from "zod";
import type { KnowledgeLoader } from "../ai/classroomKnowledge.js";
import { MAX_PER_KIND } from "../ai/classroomKnowledge.js";

export const classroomKnowledgeTool = {
  type: "function" as const,
  name: "search_approved_classroom_knowledge",
  description: "Search approved Classroom knowledge explicitly reviewed for customer use. " +
    "Read-only; returns public wording only, never private lessons, evidence or proposed insights. " +
    "Search fabric names, aliases or business topics when recent context is insufficient.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, maxLength: 200 },
      limit: { type: ["integer", "null"], minimum: 1, maximum: MAX_PER_KIND },
    },
    required: ["query", "limit"],
    additionalProperties: false,
  },
};

const schema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(MAX_PER_KIND).nullable(),
}).strict();

export function withClassroomKnowledgeTool(
  existing: (name: string, args: string) => Promise<string>,
  load: KnowledgeLoader,
) {
  return async (name: string, raw: string): Promise<string> => {
    if (name !== classroomKnowledgeTool.name) return existing(name, raw);
    let args: z.infer<typeof schema>;
    try {
      args = schema.parse(JSON.parse(raw));
    } catch {
      return JSON.stringify({ error: "Invalid knowledge search arguments" });
    }
    try {
      return JSON.stringify(await load(args.query, args.limit ?? 5));
    } catch {
      return JSON.stringify({ available: false, items: [] });
    }
  };
}
