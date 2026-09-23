import { prisma } from "../db/client.js";
import type { ClassroomMode } from "./classroomTypes.js";

export async function createClassroomSession(data: {
  title: string;
  mode: ClassroomMode;
}) {
  return prisma.classroomSession.create({
    data: {
      title: data.title,
      mode: data.mode,
      status: "active",
    },
  });
}

export async function getClassroomSession(sessionId: number) {
  return prisma.classroomSession.findUnique({
    where: {
      id: sessionId,
    },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function addClassroomMessage(data: {
  sessionId: number;
  role: "user" | "assistant";
  content: string;
}) {
  return prisma.classroomMessage.create({
    data: {
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
    },
  });
}

export async function createClassroomLesson(data: {
  title: string;
  category?: string | null;
  content: string;
  source?: string | null;
}) {
  return prisma.classroomLesson.create({
    data: {
      title: data.title,
      category: data.category ?? null,
      content: data.content,
      source: data.source ?? null,
      status: "approved",
    },
  });
}

export async function createClassroomInsight(data: {
  type: string;
  subject: string;
  statement: string;
  evidence?: string | null;
  sourceType: string;
  sourceRef?: string | null;
  confidence?: number | null;
}) {
  return prisma.classroomInsight.create({
    data: {
      type: data.type,
      subject: data.subject,
      statement: data.statement,
      evidence: data.evidence ?? null,
      sourceType: data.sourceType,
      sourceRef: data.sourceRef ?? null,
      confidence: data.confidence ?? null,
      status: "proposed",
    },
  });
}

export async function approveClassroomInsight(insightId: number) {
  return prisma.classroomInsight.update({
    where: {
      id: insightId,
    },
    data: {
      status: "approved",
    },
  });
}

export async function getRecentClassroomSessions(limit = 20) {
  return prisma.classroomSession.findMany({
    orderBy: {
      updatedAt: "desc",
    },
    take: Math.max(1, Math.min(limit, 50)),
  });
}

export async function getClassroomLessons(limit = 50) {
  return prisma.classroomLesson.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: Math.max(1, Math.min(limit, 100)),
  });
}

export async function getClassroomInsights(status?: string) {
  const where = status ? { status } : {};

  return prisma.classroomInsight.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });
}
