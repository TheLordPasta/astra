import { prisma } from "./client.js";
import { createKnowledgeReader } from "../ai/classroomKnowledge.js";

// Same Prisma instance as Classroom, research memory and customer observations.
// No approval/publication writes are available from the customer runtime.
export const loadApprovedClassroomKnowledge = createKnowledgeReader(
  prisma,
  () => console.warn("Classroom customer knowledge unavailable; continuing without it."),
);
