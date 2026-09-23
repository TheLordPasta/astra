-- CreateTable
CREATE TABLE "CustomerObservation" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "observation" TEXT NOT NULL,
    "source" VARCHAR(100),
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerObservation_customerId_idx" ON "CustomerObservation"("customerId");

-- CreateIndex
CREATE INDEX "CustomerObservation_type_idx" ON "CustomerObservation"("type");

-- CreateIndex
CREATE INDEX "CustomerObservation_createdAt_idx" ON "CustomerObservation"("createdAt");

-- AddForeignKey
ALTER TABLE "CustomerObservation" ADD CONSTRAINT "CustomerObservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
