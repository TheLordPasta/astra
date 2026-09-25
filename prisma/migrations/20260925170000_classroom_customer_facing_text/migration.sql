-- Approval is NOT publication. Existing records remain private (NULL).
-- Populate only with explicitly human-reviewed customer-safe wording.
ALTER TABLE "ClassroomLesson" ADD COLUMN "customerFacingText" TEXT;
ALTER TABLE "ClassroomInsight" ADD COLUMN "customerFacingText" TEXT;
