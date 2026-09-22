-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "city" VARCHAR(100),
    "instagramUsername" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Designer" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "brandName" VARCHAR(150),
    "instagramUsername" VARCHAR(100),
    "country" VARCHAR(100),
    "specialization" VARCHAR(150),
    "customerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Designer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fabric" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "fabricType" VARCHAR(100),
    "composition" VARCHAR(255),
    "color" VARCHAR(100),
    "weightGrams" INTEGER,
    "stretch" BOOLEAN NOT NULL DEFAULT false,
    "transparency" VARCHAR(50),
    "pricePerMeter" DECIMAL(10,2),
    "stockMeters" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fabric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER,
    "platform" VARCHAR(50),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(50) NOT NULL DEFAULT 'open',

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "website" VARCHAR(255),
    "instagramUsername" VARCHAR(100),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trend" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(100),
    "status" VARCHAR(50),
    "evidence" TEXT,
    "source" VARCHAR(255),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "type" VARCHAR(100),
    "description" TEXT,
    "priority" INTEGER,
    "status" VARCHAR(50) NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_instagramUsername_idx" ON "Customer"("instagramUsername");

-- CreateIndex
CREATE INDEX "Designer_instagramUsername_idx" ON "Designer"("instagramUsername");

-- CreateIndex
CREATE INDEX "Fabric_fabricType_idx" ON "Fabric"("fabricType");

-- CreateIndex
CREATE INDEX "Fabric_color_idx" ON "Fabric"("color");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");

-- CreateIndex
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");

-- CreateIndex
CREATE INDEX "Competitor_instagramUsername_idx" ON "Competitor"("instagramUsername");

-- CreateIndex
CREATE INDEX "Trend_status_idx" ON "Trend"("status");

-- CreateIndex
CREATE INDEX "Trend_detectedAt_idx" ON "Trend"("detectedAt");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE INDEX "Opportunity_priority_idx" ON "Opportunity"("priority");

-- AddForeignKey
ALTER TABLE "Designer" ADD CONSTRAINT "Designer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
