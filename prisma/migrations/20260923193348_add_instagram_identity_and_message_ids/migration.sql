/*
  Warnings:

  - A unique constraint covering the columns `[platform,externalId]` on the table `Conversation` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalMessageId]` on the table `ConversationMessage` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[instagramUserId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "externalId" VARCHAR(255);

-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN     "externalMessageId" VARCHAR(255);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "instagramUserId" VARCHAR(100);

-- CreateIndex
CREATE INDEX "Conversation_platform_idx" ON "Conversation"("platform");

-- CreateIndex
CREATE INDEX "Conversation_externalId_idx" ON "Conversation"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_platform_externalId_key" ON "Conversation"("platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_externalMessageId_key" ON "ConversationMessage"("externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_instagramUserId_key" ON "Customer"("instagramUserId");
