-- CreateTable
CREATE TABLE "ClassroomSession" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "mode" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomMessage" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomLesson" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100),
    "content" TEXT NOT NULL,
    "source" VARCHAR(200),
    "status" VARCHAR(50) NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomInsight" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "statement" TEXT NOT NULL,
    "evidence" TEXT,
    "sourceType" VARCHAR(50) NOT NULL,
    "sourceRef" VARCHAR(255),
    "confidence" DOUBLE PRECISION,
    "status" VARCHAR(50) NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomInsightCustomerObservation" (
    "insightId" INTEGER NOT NULL,
    "customerObservationId" INTEGER NOT NULL,

    CONSTRAINT "ClassroomInsightCustomerObservation_pkey" PRIMARY KEY ("insightId","customerObservationId")
);

-- CreateIndex
CREATE INDEX "ClassroomSession_mode_idx" ON "ClassroomSession"("mode");

-- CreateIndex
CREATE INDEX "ClassroomSession_status_idx" ON "ClassroomSession"("status");

-- CreateIndex
CREATE INDEX "ClassroomSession_createdAt_idx" ON "ClassroomSession"("createdAt");

-- CreateIndex
CREATE INDEX "ClassroomMessage_sessionId_idx" ON "ClassroomMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ClassroomMessage_createdAt_idx" ON "ClassroomMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ClassroomLesson_category_idx" ON "ClassroomLesson"("category");

-- CreateIndex
CREATE INDEX "ClassroomLesson_status_idx" ON "ClassroomLesson"("status");

-- CreateIndex
CREATE INDEX "ClassroomLesson_createdAt_idx" ON "ClassroomLesson"("createdAt");

-- CreateIndex
CREATE INDEX "ClassroomInsight_type_idx" ON "ClassroomInsight"("type");

-- CreateIndex
CREATE INDEX "ClassroomInsight_subject_idx" ON "ClassroomInsight"("subject");

-- CreateIndex
CREATE INDEX "ClassroomInsight_sourceType_idx" ON "ClassroomInsight"("sourceType");

-- CreateIndex
CREATE INDEX "ClassroomInsight_status_idx" ON "ClassroomInsight"("status");

-- CreateIndex
CREATE INDEX "ClassroomInsight_createdAt_idx" ON "ClassroomInsight"("createdAt");

-- CreateIndex
CREATE INDEX "ClassroomInsightCustomerObservation_customerObservationId_idx" ON "ClassroomInsightCustomerObservation"("customerObservationId");

-- AddForeignKey
ALTER TABLE "ClassroomMessage" ADD CONSTRAINT "ClassroomMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomInsightCustomerObservation" ADD CONSTRAINT "ClassroomInsightCustomerObservation_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "ClassroomInsight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomInsightCustomerObservation" ADD CONSTRAINT "ClassroomInsightCustomerObservation_customerObservationId_fkey" FOREIGN KEY ("customerObservationId") REFERENCES "CustomerObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
