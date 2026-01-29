import prisma from "~/db.server";
import { Prisma } from "@prisma/client";
import { Scraper, type ScrapeResult } from "./scraper.server";
import {
  compareSnapshots,
  generateChangeSummary,
  determineSignificance,
  type DiffResult,
} from "./differ.server";
import { analyzeChanges, analyzePriceChange } from "./analyzer.server";
import {
  sendChangeAlert,
  type ChangeNotification,
} from "./notifier.server";
import { PLAN_LIMITS } from "./billing.server";
import {
  computePriceDelta,
  formatPriceChange,
  getConfidenceAdjustedThresholds,
  type PriceDelta,
  type PriceThresholds,
  type PriceConfidence,
} from "./priceExtractor.server";

// Helper to convert Prisma Decimal to number (or null)
function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value.toNumber();
}

// Configurable thresholds for price change detection
// Override via env vars: PRICE_MIN_PERCENT, PRICE_MIN_AMOUNT
const DEFAULT_MIN_PERCENT = 1;
const DEFAULT_MIN_AMOUNT = 0.50;

export const PRICE_CHANGE_THRESHOLDS: PriceThresholds = {
  minPercentChange: process.env.PRICE_MIN_PERCENT
    ? parseFloat(process.env.PRICE_MIN_PERCENT)
    : DEFAULT_MIN_PERCENT,
  minAmountChange: process.env.PRICE_MIN_AMOUNT
    ? parseFloat(process.env.PRICE_MIN_AMOUNT)
    : DEFAULT_MIN_AMOUNT,
};

export const CHANGE_TYPES = {
  CONTENT: "CONTENT",
  PRICE_CHANGE: "PRICE_CHANGE",
} as const;

// DEV_MODE price simulation
// When enabled, allows overriding the extracted price for testing
// Set DEV_MODE=true in .env to enable
// Then use DEV_PRICE_OVERRIDE env var or pass simulatedPrice to checkPage
export function isDevMode(): boolean {
  return process.env.DEV_MODE === "true" || process.env.NODE_ENV === "development";
}

export interface CheckPageOptions {
  simulatedPrice?: number | null; // Override extracted price (DEV_MODE only)
}

async function cleanupOldSnapshots(pageId: string): Promise<void> {
  const oldSnapshots = await prisma.snapshot.findMany({
    where: { pageId },
    orderBy: { capturedAt: "desc" },
    skip: 10,
    select: { id: true },
  });

  if (oldSnapshots.length > 0) {
    await prisma.snapshot.deleteMany({
      where: { id: { in: oldSnapshots.map((s) => s.id) } },
    });
  }
}

interface PageWithCompetitor {
  id: string;
  url: string;
  label: string;
  competitorId: string;
  competitor: {
    id: string;
    name: string;
    websiteUrl: string;
    shopId: string;
    shop: {
      id: string;
      shopDomain: string;
      plan: string;
      alertEmail: string | null;
    };
  };
}

interface CheckResult {
  page: PageWithCompetitor;
  snapshot?: {
    id: string;
    contentHash: string;
    priceValue?: number | null;
  };
  isFirstSnapshot: boolean;
  change?: {
    id: string;
    significance: string;
    changeType?: string | null;
    diff?: DiffResult;
  } | null;
  priceChange?: {
    id: string;
    priceDelta: PriceDelta;
  } | null;
  error?: string;
}

export async function checkPage(
  pageId: string,
  options: CheckPageOptions = {}
): Promise<CheckResult> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      competitor: {
        include: {
          shop: true,
        },
      },
    },
  });

  if (!page) {
    throw new Error(`Page not found: ${pageId}`);
  }

  console.log(
    `Checking ${page.competitor.name} - ${page.label} (${page.url})...`
  );

  const scraper = new Scraper();
  try {
    await scraper.init();
    const scrapeResult = await scraper.scrape(page.url);

    // DEV_MODE: Apply simulated price override for testing
    let effectivePriceValue = scrapeResult.priceValue;
    if (isDevMode()) {
      const envOverride = process.env.DEV_PRICE_OVERRIDE;
      if (options.simulatedPrice !== undefined) {
        effectivePriceValue = options.simulatedPrice;
        console.log(`[DEV_MODE] Using simulated price: ${effectivePriceValue}`);
      } else if (envOverride !== undefined) {
        effectivePriceValue = envOverride === "null" ? null : parseFloat(envOverride);
        console.log(`[DEV_MODE] Using DEV_PRICE_OVERRIDE: ${effectivePriceValue}`);
      }
    }

    const previousSnapshot = await prisma.snapshot.findFirst({
      where: { pageId },
      orderBy: { capturedAt: "desc" },
    });

    const newSnapshot = await prisma.snapshot.create({
      data: {
        pageId,
        contentHash: scrapeResult.contentHash,
        htmlContent: scrapeResult.htmlContent,
        textContent: scrapeResult.textContent,
        priceValue: effectivePriceValue,
        priceRaw: scrapeResult.priceRaw,
        currency: scrapeResult.currency,
      },
    });

    // Update page lastChecked
    await prisma.page.update({
      where: { id: pageId },
      data: { lastChecked: new Date() },
    });

    if (!previousSnapshot) {
      console.log(`First snapshot captured for ${page.label}`);
      if (effectivePriceValue !== null) {
        console.log(`  Initial price detected: ${scrapeResult.priceRaw}`);
      }
      return {
        page: page as PageWithCompetitor,
        snapshot: { ...newSnapshot, priceValue: decimalToNumber(newSnapshot.priceValue) },
        isFirstSnapshot: true,
        change: null,
        priceChange: null,
      };
    }

    // Convert previous snapshot price from Decimal to number for comparison
    const previousPriceValue = decimalToNumber(previousSnapshot.priceValue);

    // Get confidence-adjusted thresholds
    // Low confidence extractions require stronger price movements to trigger alerts
    const adjustedThresholds = getConfidenceAdjustedThresholds(
      scrapeResult.priceConfidence,
      PRICE_CHANGE_THRESHOLDS
    );

    // Compute price delta with adjusted thresholds
    const priceDelta = computePriceDelta(
      previousPriceValue,
      effectivePriceValue,
      adjustedThresholds
    );

    // Only trigger price change alert if confidence allows it
    const hasPriceChange = adjustedThresholds.shouldAlert && priceDelta.isMeaningful;

    if (priceDelta.isMeaningful && !adjustedThresholds.shouldAlert) {
      console.log(`Price change detected but skipped (confidence: ${scrapeResult.priceConfidence})`);
    } else if (priceDelta.isMeaningful && scrapeResult.priceConfidence === "low") {
      console.log(`Price change detected with low confidence - using stricter thresholds`);
    }

    const hasContentChange = previousSnapshot.contentHash !== newSnapshot.contentHash;

    // No content change AND no price change - nothing to report
    if (!hasContentChange && !hasPriceChange) {
      console.log(`No changes detected for ${page.label}`);
      return {
        page: page as PageWithCompetitor,
        snapshot: { ...newSnapshot, priceValue: decimalToNumber(newSnapshot.priceValue) },
        isFirstSnapshot: false,
        change: null,
        priceChange: null,
      };
    }

    // If only price changed (no content change), create a PRICE_CHANGE alert
    if (!hasContentChange && hasPriceChange) {
      console.log(`Price change detected for ${page.label}: ${formatPriceChange(priceDelta, scrapeResult.currency)}`);

      const priceAnalysis = await analyzePriceChange(
        `${page.competitor.name} - ${page.label}`,
        page.url,
        priceDelta,
        scrapeResult.currency
      );

      const priceChangeRecord = await prisma.change.create({
        data: {
          pageId,
          oldContentHash: previousSnapshot.contentHash,
          newContentHash: newSnapshot.contentHash,
          changeSummary: formatPriceChange(priceDelta, scrapeResult.currency),
          aiAnalysis: priceAnalysis.analysis,
          significance: priceAnalysis.significance !== "unknown" ? priceAnalysis.significance : "medium",
          changeType: CHANGE_TYPES.PRICE_CHANGE,
          oldPrice: priceDelta.oldPrice,
          newPrice: priceDelta.newPrice,
          priceDelta: priceDelta.deltaAmount,
          priceDeltaPct: priceDelta.deltaPercent,
        },
      });

      console.log(`Price change recorded for ${page.label}: ${priceChangeRecord.significance} significance`);

      // Send notification for price change
      if (page.competitor.shop.alertEmail) {
        const notification: ChangeNotification = {
          id: priceChangeRecord.id,
          competitorName: page.competitor.name,
          pageLabel: page.label,
          pageUrl: page.url,
          significance: priceChangeRecord.significance,
          aiAnalysis: priceAnalysis.analysis,
          changeSummary: priceChangeRecord.changeSummary || "",
          detectedAt: priceChangeRecord.detectedAt,
        };

        const notifyResult = await sendChangeAlert(
          [notification],
          page.competitor.shop.alertEmail
        );

        if (notifyResult.sent) {
          await prisma.change.update({
            where: { id: priceChangeRecord.id },
            data: { notified: true },
          });
        }
      }

      // Cleanup old snapshots
      await cleanupOldSnapshots(pageId);

      return {
        page: page as PageWithCompetitor,
        snapshot: { ...newSnapshot, priceValue: decimalToNumber(newSnapshot.priceValue) },
        isFirstSnapshot: false,
        change: null,
        priceChange: {
          id: priceChangeRecord.id,
          priceDelta,
        },
      };
    }

    // Content changed (may also include price change)
    console.log(`Changes detected for ${page.label}, analyzing...`);
    if (hasPriceChange) {
      console.log(`  Also includes price change: ${formatPriceChange(priceDelta, scrapeResult.currency)}`);
    }

    const diff = compareSnapshots(
      previousSnapshot.textContent || "",
      newSnapshot.textContent || ""
    );

    const changeSummary = generateChangeSummary(diff);
    let significance = determineSignificance(diff);

    // If there's a meaningful price change, elevate significance
    if (hasPriceChange && significance === "low") {
      significance = "medium";
    }

    const aiResult = await analyzeChanges(
      `${page.competitor.name} - ${page.label}`,
      page.url,
      diff,
      hasPriceChange ? priceDelta : undefined,
      hasPriceChange ? scrapeResult.currency : undefined
    );
    if (aiResult.significance !== "unknown") {
      significance = aiResult.significance;
    }

    // Determine change type - if price changed significantly, tag it
    const changeType = hasPriceChange ? CHANGE_TYPES.PRICE_CHANGE : CHANGE_TYPES.CONTENT;

    const change = await prisma.change.create({
      data: {
        pageId,
        oldContentHash: previousSnapshot.contentHash,
        newContentHash: newSnapshot.contentHash,
        changeSummary: hasPriceChange
          ? `${changeSummary} | ${formatPriceChange(priceDelta, scrapeResult.currency)}`
          : changeSummary,
        aiAnalysis: aiResult.analysis,
        significance,
        changeType,
        oldPrice: hasPriceChange ? priceDelta.oldPrice : null,
        newPrice: hasPriceChange ? priceDelta.newPrice : null,
        priceDelta: hasPriceChange ? priceDelta.deltaAmount : null,
        priceDeltaPct: hasPriceChange ? priceDelta.deltaPercent : null,
      },
    });

    console.log(`Change recorded for ${page.label}: ${significance} significance (${changeType})`);

    // Send email notification if configured
    if (page.competitor.shop.alertEmail) {
      const notification: ChangeNotification = {
        id: change.id,
        competitorName: page.competitor.name,
        pageLabel: page.label,
        pageUrl: page.url,
        significance,
        aiAnalysis: aiResult.analysis,
        changeSummary: change.changeSummary || "",
        detectedAt: change.detectedAt,
      };

      const notifyResult = await sendChangeAlert(
        [notification],
        page.competitor.shop.alertEmail
      );

      if (notifyResult.sent) {
        await prisma.change.update({
          where: { id: change.id },
          data: { notified: true },
        });
      }
    }

    // Clean up old snapshots
    await cleanupOldSnapshots(pageId);

    return {
      page: page as PageWithCompetitor,
      snapshot: { ...newSnapshot, priceValue: decimalToNumber(newSnapshot.priceValue) },
      isFirstSnapshot: false,
      change: { ...change, changeType, diff },
      priceChange: hasPriceChange ? { id: change.id, priceDelta } : null,
    };
  } finally {
    await scraper.close();
  }
}

export async function checkCompetitor(competitorId: string): Promise<{
  competitor: { id: string; name: string };
  checked: number;
  changes: number;
  results: CheckResult[];
}> {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: {
      pages: {
        where: { active: true },
      },
      shop: true,
    },
  });

  if (!competitor) {
    throw new Error(`Competitor not found: ${competitorId}`);
  }

  if (!competitor.pages || competitor.pages.length === 0) {
    throw new Error(`Competitor has no pages to check: ${competitor.name}`);
  }

  console.log(
    `Checking ${competitor.name} (${competitor.pages.length} pages)...`
  );

  const results: CheckResult[] = [];
  const scraper = new Scraper();

  try {
    await scraper.init();

    for (const page of competitor.pages) {
      try {
        const result = await checkPage(page.id);
        results.push(result);
      } catch (error) {
        console.error(
          `Error checking ${page.label}:`,
          error instanceof Error ? error.message : error
        );
        results.push({
          page: {
            ...page,
            competitor: {
              id: competitor.id,
              name: competitor.name,
              websiteUrl: competitor.websiteUrl,
              shopId: competitor.shopId,
              shop: competitor.shop,
            },
          } as PageWithCompetitor,
          isFirstSnapshot: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  } finally {
    await scraper.close();
  }

  const changesCount = results.filter((r) => r.change || r.priceChange).length;

  return {
    competitor: { id: competitor.id, name: competitor.name },
    checked: competitor.pages.length,
    changes: changesCount,
    results,
  };
}

export async function checkAllForShop(shopId: string): Promise<{
  competitors: number;
  checked: number;
  changes: number;
}> {
  const competitors = await prisma.competitor.findMany({
    where: {
      shopId,
      active: true,
    },
    include: {
      pages: {
        where: { active: true },
      },
    },
  });

  let totalPages = 0;
  let totalChanges = 0;

  console.log(`Starting check for ${competitors.length} competitor(s)...`);

  for (const competitor of competitors) {
    if (!competitor.pages || competitor.pages.length === 0) {
      console.log(`Skipping ${competitor.name} - no pages configured`);
      continue;
    }

    try {
      const result = await checkCompetitor(competitor.id);
      totalPages += result.checked;
      totalChanges += result.changes;
    } catch (error) {
      console.error(
        `Error checking competitor ${competitor.name}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    competitors: competitors.length,
    checked: totalPages,
    changes: totalChanges,
  };
}

export async function checkAllForPlan(plan: string): Promise<{
  shops: number;
  competitors: number;
  checked: number;
  changes: number;
}> {
  const shops = await prisma.shop.findMany({
    where: {
      plan: plan.toLowerCase(),
    },
    include: {
      competitors: {
        where: { active: true },
        include: {
          pages: {
            where: { active: true },
          },
        },
      },
    },
  });

  let totalCompetitors = 0;
  let totalPages = 0;
  let totalChanges = 0;

  console.log(
    `Starting ${plan} plan check for ${shops.length} shop(s)...`
  );

  for (const shop of shops) {
    for (const competitor of shop.competitors) {
      if (!competitor.pages || competitor.pages.length === 0) {
        continue;
      }

      totalCompetitors++;

      try {
        const result = await checkCompetitor(competitor.id);
        totalPages += result.checked;
        totalChanges += result.changes;
      } catch (error) {
        console.error(
          `Error checking competitor ${competitor.name}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  return {
    shops: shops.length,
    competitors: totalCompetitors,
    checked: totalPages,
    changes: totalChanges,
  };
}

export { PLAN_LIMITS };
