import { prisma } from "./client.js";

export async function countResearchJobsSince(since: Date): Promise<number> {
  return prisma.researchJob.count({
    where: {
      createdAt: {
        gte: since,
      },
    },
  });
}

export async function createResearchJob(data: {
  topic: string;
  scope?: string | null;
  market?: string | null;
  segment?: string | null;
  category?: string | null;
  geography?: string | null;
  timeRange?: string | null;
  summary?: string | null;
  asOf?: Date | null;
}) {
  return prisma.researchJob.create({
    data: {
      topic: data.topic,
      scope: data.scope ?? null,
      market: data.market ?? null,
      segment: data.segment ?? null,
      category: data.category ?? null,
      geography: data.geography ?? null,
      timeRange: data.timeRange ?? null,
      summary: data.summary ?? null,
      asOf: data.asOf ?? null,
      status: "running",
    },
  });
}

export async function addResearchSource(data: {
  researchJobId: number;
  title?: string | null;
  url: string;
  sourceType: string;
  publisher?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  notes?: string | null;
}) {
  return prisma.researchSource.upsert({
    where: {
      researchJobId_url: {
        researchJobId: data.researchJobId,
        url: data.url,
      },
    },
    update: {
      title: data.title ?? null,
      sourceType: data.sourceType,
      publisher: data.publisher ?? null,
      author: data.author ?? null,
      publishedAt: data.publishedAt ?? null,
      notes: data.notes ?? null,
    },
    create: {
      researchJobId: data.researchJobId,
      title: data.title ?? null,
      url: data.url,
      sourceType: data.sourceType,
      publisher: data.publisher ?? null,
      author: data.author ?? null,
      publishedAt: data.publishedAt ?? null,
      notes: data.notes ?? null,
    },
  });
}

export async function addResearchObservation(data: {
  researchJobId: number;
  type: string;
  subject: string;
  statement: string;
  evidence?: string | null;
  market?: string | null;
  segment?: string | null;
  category?: string | null;
  sourceQuality?: number | null;
  directness?: number | null;
  recencyScore?: number | null;
  independenceScore?: number | null;
  confidence?: number | null;
  signalStrength?: number | null;
  sourceIds?: number[];
}) {
  const observation = await prisma.researchObservation.create({
    data: {
      researchJobId: data.researchJobId,
      type: data.type,
      subject: data.subject,
      statement: data.statement,
      evidence: data.evidence ?? null,
      market: data.market ?? null,
      segment: data.segment ?? null,
      category: data.category ?? null,
      sourceQuality: data.sourceQuality ?? null,
      directness: data.directness ?? null,
      recencyScore: data.recencyScore ?? null,
      independenceScore: data.independenceScore ?? null,
      confidence: data.confidence ?? null,
      signalStrength: data.signalStrength ?? null,
    },
  });

  for (const sourceId of data.sourceIds ?? []) {
    await prisma.researchObservationSource.create({
      data: {
        researchObservationId: observation.id,
        researchSourceId: sourceId,
      },
    });
  }

  return observation;
}

export async function completeResearchJob(id: number) {
  return prisma.researchJob.update({
    where: { id },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });
}

export async function failResearchJob(id: number) {
  return prisma.researchJob.update({
    where: { id },
    data: {
      status: "failed",
      completedAt: new Date(),
    },
  });
}

export async function getResearchJobById(id: number) {
  return prisma.researchJob.findUnique({
    where: { id },
    include: {
      sources: {
        orderBy: {
          observedAt: "asc",
        },
      },
      observations: {
        orderBy: {
          observedAt: "desc",
        },
        include: {
          sources: {
            include: {
              source: true,
            },
          },
        },
      },
    },
  });
}

export async function getRecentResearchJobs() {
  return prisma.researchJob.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    include: {
      sources: true,
      observations: true,
    },
  });
}

export async function searchResearchMemory(filters: {
  market?: string;
  segment?: string;
  category?: string;
  geography?: string;
  type?: string;
  subject?: string;
  minConfidence?: number;
  limit?: number;
}) {
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);

  return prisma.researchObservation.findMany({
    where: {
      ...(filters.market
        ? {
            market: {
              contains: filters.market,
              mode: "insensitive",
            },
          }
        : {}),

      ...(filters.segment
        ? {
            segment: {
              contains: filters.segment,
              mode: "insensitive",
            },
          }
        : {}),

      ...(filters.category
        ? {
            category: {
              contains: filters.category,
              mode: "insensitive",
            },
          }
        : {}),

      ...(filters.geography
        ? {
            researchJob: {
              geography: {
                contains: filters.geography,
                mode: "insensitive",
              },
            },
          }
        : {}),

      ...(filters.type
        ? {
            type: {
              equals: filters.type,
              mode: "insensitive",
            },
          }
        : {}),

      ...(filters.subject
        ? {
            subject: {
              contains: filters.subject,
              mode: "insensitive",
            },
          }
        : {}),

      ...(filters.minConfidence !== undefined
        ? {
            confidence: {
              gte: filters.minConfidence,
            },
          }
        : {}),
    },

    orderBy: [
      {
        confidence: "desc",
      },
      {
        observedAt: "desc",
      },
    ],

    take: limit,

    include: {
      researchJob: {
        select: {
          id: true,
          topic: true,
          scope: true,
          market: true,
          segment: true,
          category: true,
          geography: true,
          timeRange: true,
          asOf: true,
          createdAt: true,
        },
      },

      sources: {
        include: {
          source: {
            select: {
              id: true,
              title: true,
              url: true,
              sourceType: true,
              publishedAt: true,
              observedAt: true,
            },
          },
        },
      },
    },
  });
}
