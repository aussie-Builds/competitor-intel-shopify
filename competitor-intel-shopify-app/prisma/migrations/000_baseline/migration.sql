-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "planActivatedAt" TIMESTAMP(3),
    "alertEmail" TEXT,
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 360,
    "maxFrequencyAllowedMinutes" INTEGER NOT NULL DEFAULT 360,
    "lastAutoCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Homepage',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastChecked" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "htmlContent" TEXT,
    "textContent" TEXT,
    "priceValue" DECIMAL(10,2),
    "priceRaw" TEXT,
    "currency" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Change" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "oldContentHash" TEXT,
    "newContentHash" TEXT NOT NULL,
    "changeSummary" TEXT,
    "aiAnalysis" TEXT,
    "significance" TEXT NOT NULL DEFAULT 'medium',
    "changeType" TEXT,
    "oldPrice" DECIMAL(10,2),
    "newPrice" DECIMAL(10,2),
    "priceDelta" DECIMAL(10,2),
    "priceDeltaPct" DOUBLE PRECISION,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Competitor_shopId_idx" ON "Competitor"("shopId");

-- CreateIndex
CREATE INDEX "Page_competitorId_idx" ON "Page"("competitorId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_competitorId_url_key" ON "Page"("competitorId", "url");

-- CreateIndex
CREATE INDEX "Snapshot_pageId_idx" ON "Snapshot"("pageId");

-- CreateIndex
CREATE INDEX "Snapshot_capturedAt_idx" ON "Snapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "Change_pageId_idx" ON "Change"("pageId");

-- CreateIndex
CREATE INDEX "Change_detectedAt_idx" ON "Change"("detectedAt");

-- CreateIndex
CREATE INDEX "Change_significance_idx" ON "Change"("significance");

-- CreateIndex
CREATE INDEX "Change_changeType_idx" ON "Change"("changeType");

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

