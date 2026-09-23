-- CreateTable
CREATE TABLE "ClassroomCodeProposal" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER,
    "title" VARCHAR(200) NOT NULL,
    "filePath" VARCHAR(500) NOT NULL,
    "rationale" TEXT NOT NULL,
    "proposedCode" TEXT,
    "diff" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomCodeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassroomCodeProposal_sessionId_idx" ON "ClassroomCodeProposal"("sessionId");

-- CreateIndex
CREATE INDEX "ClassroomCodeProposal_status_idx" ON "ClassroomCodeProposal"("status");

-- CreateIndex
CREATE INDEX "ClassroomCodeProposal_createdAt_idx" ON "ClassroomCodeProposal"("createdAt");

-- AddForeignKey
ALTER TABLE "ClassroomCodeProposal" ADD CONSTRAINT "ClassroomCodeProposal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
