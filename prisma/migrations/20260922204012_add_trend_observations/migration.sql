/*
  Warnings:

  - You are about to drop the column `detectedAt` on the `Trend` table. All the data in the column will be lost.
  - You are about to drop the column `evidence` on the `Trend` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `Trend` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Trend` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Trend_detectedAt_idx";

-- DropIndex
DROP INDEX "Trend_status_idx";

-- AlterTable
ALTER TABLE "Trend" DROP COLUMN "detectedAt",
DROP COLUMN "evidence",
DROP COLUMN "source",
DROP COLUMN "status",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "TrendObservation" (
    "id" SERIAL NOT NULL,
    "trendId" INTEGER NOT NULL,
    "market" VARCHAR(100),
    "segment" VARCHAR(100),
    "garmentType" VARCHAR(100),
    "signal" VARCHAR(100),
    "evidence" TEXT,
    "source" VARCHAR(500),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "TrendObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrendObservation_trendId_idx" ON "TrendObservation"("trendId");

-- CreateIndex
CREATE INDEX "TrendObservation_market_idx" ON "TrendObservation"("market");

-- CreateIndex
CREATE INDEX "TrendObservation_segment_idx" ON "TrendObservation"("segment");

-- CreateIndex
CREATE INDEX "TrendObservation_observedAt_idx" ON "TrendObservation"("observedAt");

-- AddForeignKey
ALTER TABLE "TrendObservation" ADD CONSTRAINT "TrendObservation_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "Trend"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
