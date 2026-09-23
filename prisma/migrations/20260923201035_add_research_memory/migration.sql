-- CreateTable
CREATE TABLE "ResearchJob" (
    "id" SERIAL NOT NULL,
    "topic" VARCHAR(200) NOT NULL,
    "scope" TEXT,
    "market" VARCHAR(100),
    "segment" VARCHAR(100),
    "category" VARCHAR(100),
    "geography" VARCHAR(100),
    "timeRange" VARCHAR(100),
    "summary" TEXT,
    "asOf" TIMESTAMP(3),
    "status" VARCHAR(50) NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" SERIAL NOT NULL,
    "researchJobId" INTEGER NOT NULL,
    "title" TEXT,
    "url" VARCHAR(1000) NOT NULL,
    "sourceType" VARCHAR(50) NOT NULL,
    "publisher" VARCHAR(200),
    "author" VARCHAR(200),
    "publishedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchObservation" (
    "id" SERIAL NOT NULL,
    "researchJobId" INTEGER NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "statement" TEXT NOT NULL,
    "evidence" TEXT,
    "market" VARCHAR(100),
    "segment" VARCHAR(100),
    "category" VARCHAR(100),
    "sourceQuality" DOUBLE PRECISION,
    "directness" DOUBLE PRECISION,
    "recencyScore" DOUBLE PRECISION,
    "independenceScore" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "signalStrength" DOUBLE PRECISION,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchObservationSource" (
    "researchObservationId" INTEGER NOT NULL,
    "researchSourceId" INTEGER NOT NULL,

    CONSTRAINT "ResearchObservationSource_pkey" PRIMARY KEY ("researchObservationId","researchSourceId")
);

-- CreateIndex
CREATE INDEX "ResearchJob_market_idx" ON "ResearchJob"("market");

-- CreateIndex
CREATE INDEX "ResearchJob_segment_idx" ON "ResearchJob"("segment");

-- CreateIndex
CREATE INDEX "ResearchJob_category_idx" ON "ResearchJob"("category");

-- CreateIndex
CREATE INDEX "ResearchJob_geography_idx" ON "ResearchJob"("geography");

-- CreateIndex
CREATE INDEX "ResearchJob_status_idx" ON "ResearchJob"("status");

-- CreateIndex
CREATE INDEX "ResearchJob_createdAt_idx" ON "ResearchJob"("createdAt");

-- CreateIndex
CREATE INDEX "ResearchSource_researchJobId_idx" ON "ResearchSource"("researchJobId");

-- CreateIndex
CREATE INDEX "ResearchSource_sourceType_idx" ON "ResearchSource"("sourceType");

-- CreateIndex
CREATE INDEX "ResearchSource_publishedAt_idx" ON "ResearchSource"("publishedAt");

-- CreateIndex
CREATE INDEX "ResearchSource_observedAt_idx" ON "ResearchSource"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSource_researchJobId_url_key" ON "ResearchSource"("researchJobId", "url");

-- CreateIndex
CREATE INDEX "ResearchObservation_researchJobId_idx" ON "ResearchObservation"("researchJobId");

-- CreateIndex
CREATE INDEX "ResearchObservation_type_idx" ON "ResearchObservation"("type");

-- CreateIndex
CREATE INDEX "ResearchObservation_subject_idx" ON "ResearchObservation"("subject");

-- CreateIndex
CREATE INDEX "ResearchObservation_market_idx" ON "ResearchObservation"("market");

-- CreateIndex
CREATE INDEX "ResearchObservation_segment_idx" ON "ResearchObservation"("segment");

-- CreateIndex
CREATE INDEX "ResearchObservation_category_idx" ON "ResearchObservation"("category");

-- CreateIndex
CREATE INDEX "ResearchObservation_observedAt_idx" ON "ResearchObservation"("observedAt");

-- CreateIndex
CREATE INDEX "ResearchObservationSource_researchSourceId_idx" ON "ResearchObservationSource"("researchSourceId");

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_researchJobId_fkey" FOREIGN KEY ("researchJobId") REFERENCES "ResearchJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchObservation" ADD CONSTRAINT "ResearchObservation_researchJobId_fkey" FOREIGN KEY ("researchJobId") REFERENCES "ResearchJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchObservationSource" ADD CONSTRAINT "ResearchObservationSource_researchObservationId_fkey" FOREIGN KEY ("researchObservationId") REFERENCES "ResearchObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchObservationSource" ADD CONSTRAINT "ResearchObservationSource_researchSourceId_fkey" FOREIGN KEY ("researchSourceId") REFERENCES "ResearchSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
