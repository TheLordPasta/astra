-- CreateTable
CREATE TABLE "ClassroomGitCommit" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER,
    "branchName" VARCHAR(200) NOT NULL,
    "commitSha" VARCHAR(100) NOT NULL,
    "commitMessage" VARCHAR(200) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'committed',
    "pushedAt" TIMESTAMP(3),
    "prUrl" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomGitCommit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassroomGitCommit_sessionId_idx" ON "ClassroomGitCommit"("sessionId");

-- CreateIndex
CREATE INDEX "ClassroomGitCommit_branchName_idx" ON "ClassroomGitCommit"("branchName");

-- CreateIndex
CREATE INDEX "ClassroomGitCommit_status_idx" ON "ClassroomGitCommit"("status");

-- CreateIndex
CREATE INDEX "ClassroomGitCommit_createdAt_idx" ON "ClassroomGitCommit"("createdAt");

-- AddForeignKey
ALTER TABLE "ClassroomGitCommit" ADD CONSTRAINT "ClassroomGitCommit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
