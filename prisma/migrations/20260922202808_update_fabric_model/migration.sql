/*
  Warnings:

  - You are about to drop the column `name` on the `Fabric` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Fabric_color_idx";

-- DropIndex
DROP INDEX "Fabric_fabricType_idx";

-- AlterTable
ALTER TABLE "Fabric" DROP COLUMN "name",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "providerName" VARCHAR(150),
ADD COLUMN     "referenceName" VARCHAR(200),
ADD COLUMN     "sourceDesignerId" INTEGER;

-- CreateTable
CREATE TABLE "FabricImage" (
    "id" SERIAL NOT NULL,
    "fabricId" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FabricImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FabricImage_fabricId_idx" ON "FabricImage"("fabricId");

-- CreateIndex
CREATE INDEX "Fabric_providerName_idx" ON "Fabric"("providerName");

-- CreateIndex
CREATE INDEX "Fabric_sourceDesignerId_idx" ON "Fabric"("sourceDesignerId");

-- AddForeignKey
ALTER TABLE "Fabric" ADD CONSTRAINT "Fabric_sourceDesignerId_fkey" FOREIGN KEY ("sourceDesignerId") REFERENCES "Designer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FabricImage" ADD CONSTRAINT "FabricImage_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
