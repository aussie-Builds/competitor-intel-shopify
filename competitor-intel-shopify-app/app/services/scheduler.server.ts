/**
 * In-process scheduler for competitor page checks.
 * Imported from entry.server.tsx to start with the Remix server.
 *
 * Uses a global singleton guard to ensure only one scheduler runs.
 */
import cron from "node-cron";
import prisma from "~/db.server";
import { Scraper } from "./scraper.server";
import {
  compareSnapshots,
  generateChangeSummary,
  determineSignificance,
} from "./differ.server";
import { analyzeChanges } from "./analyzer.server";
import { sendChangeAlert, type ChangeNotification } from "./notifier.server";

declare global {
  var __cronStarted: boolean | undefined;
}

async function checkPageWorker(
  pageId: string,
  scraper: Scraper
): Promise<{ hasChange: boolean; significance?: string }> {
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

  if (!page || !page.active) {
    return { hasChange: false };
  }

  console.log(`  Checking ${page.competitor.name} - ${page.label}...`);

  try {
    const scrapeResult = await scraper.scrape(page.url);

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
      },
    });

    await prisma.page.update({
      where: { id: pageId },
      data: { lastChecked: new Date() },
    });

    if (!previousSnapshot) {
      console.log(`    First snapshot captured`);
      return { hasChange: false };
    }

    if (previousSnapshot.contentHash === newSnapshot.contentHash) {
      console.log(`    No changes`);
      return { hasChange: false };
    }

    console.log(`    Changes detected, analyzing...`);

    const diff = compareSnapshots(
      previousSnapshot.textContent || "",
      newSnapshot.textContent || ""
    );

    const changeSummary = generateChangeSummary(diff);
    let significance = determineSignificance(diff);

    const aiResult = await analyzeChanges(
      `${page.competitor.name} - ${page.label}`,
      page.url,
      diff
    );

    if (aiResult.significance !== "unknown") {
      significance = aiResult.significance;
    }

    const change = await prisma.change.create({
      data: {
        pageId,
        oldContentHash: previousSnapshot.contentHash,
        newContentHash: newSnapshot.contentHash,
        changeSummary,
        aiAnalysis: aiResult.analysis,
        significance,
      },
    });

    // Send notification
    if (page.competitor.shop.alertEmail) {
      const notification: ChangeNotification = {
        id: change.id,
        competitorName: page.competitor.name,
        pageLabel: page.label,
        pageUrl: page.url,
        significance,
        aiAnalysis: aiResult.analysis,
        changeSummary,
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

    // Cleanup old snapshots
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

    console.log(`    Change recorded: ${significance} significance`);
    return { hasChange: true, significance };
  } catch (error) {
    console.error(
      `    Error:`,
      error instanceof Error ? error.message : error
    );
    return { hasChange: false };
  }
}

async function runShopCheck(
  shopId: string,
  scraper: Scraper
): Promise<{ pages: number; changes: number }> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
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

  if (!shop) {
    return { pages: 0, changes: 0 };
  }

  let totalPages = 0;
  let totalChanges = 0;

  for (const competitor of shop.competitors) {
    if (competitor.pages.length === 0) continue;

    for (const page of competitor.pages) {
      totalPages++;
      const result = await checkPageWorker(page.id, scraper);
      if (result.hasChange) totalChanges++;
    }
  }

  // Update lastAutoCheckAt even if no changes detected
  await prisma.shop.update({
    where: { id: shopId },
    data: { lastAutoCheckAt: new Date() },
  });

  return { pages: totalPages, changes: totalChanges };
}

function isShopDueForCheck(
  lastAutoCheckAt: Date | null,
  checkIntervalMinutes: number,
  maxFrequencyAllowedMinutes: number
): boolean {
  // First check is always due
  if (!lastAutoCheckAt) {
    return true;
  }

  // Effective interval = max of user setting and plan limit
  const effectiveIntervalMinutes = Math.max(
    checkIntervalMinutes,
    maxFrequencyAllowedMinutes
  );
  const effectiveIntervalMs = effectiveIntervalMinutes * 60 * 1000;

  const timeSinceLastCheck = Date.now() - lastAutoCheckAt.getTime();
  return timeSinceLastCheck >= effectiveIntervalMs;
}

export async function runScheduledChecks(): Promise<void> {
  console.log(`[CRON] tick`);

  // Fetch all shops that have active competitors with active pages
  const shops = await prisma.shop.findMany({
    where: {
      competitors: {
        some: {
          active: true,
          pages: {
            some: { active: true },
          },
        },
      },
    },
    select: {
      id: true,
      shopDomain: true,
      checkIntervalMinutes: true,
      maxFrequencyAllowedMinutes: true,
      lastAutoCheckAt: true,
    },
  });

  if (shops.length === 0) {
    console.log(`[CRON] No shops with active pages to check`);
    return;
  }

  // Log each shop's due status
  for (const shop of shops) {
    const effectiveInterval = Math.max(
      shop.checkIntervalMinutes,
      shop.maxFrequencyAllowedMinutes
    );
    const isDue = isShopDueForCheck(
      shop.lastAutoCheckAt,
      shop.checkIntervalMinutes,
      shop.maxFrequencyAllowedMinutes
    );

    if (isDue) {
      console.log(
        `[CRON] Shop ${shop.id} due=true interval=${effectiveInterval} lastRun=${shop.lastAutoCheckAt?.toISOString() || "null"}`
      );
    } else {
      console.log(`[CRON] Shop ${shop.id} due=false`);
    }
  }

  // Filter to shops that are due for a check
  const dueShops = shops.filter((shop) =>
    isShopDueForCheck(
      shop.lastAutoCheckAt,
      shop.checkIntervalMinutes,
      shop.maxFrequencyAllowedMinutes
    )
  );

  if (dueShops.length === 0) {
    return;
  }

  console.log(`[CRON] ${dueShops.length} shop(s) due for check`);

  const scraper = new Scraper();
  await scraper.init();

  let totalPages = 0;
  let totalChanges = 0;

  try {
    for (const shop of dueShops) {
      const effectiveInterval = Math.max(
        shop.checkIntervalMinutes,
        shop.maxFrequencyAllowedMinutes
      );
      console.log(
        `[CRON] Shop: ${shop.shopDomain} (interval: ${effectiveInterval}min)`
      );

      const result = await runShopCheck(shop.id, scraper);
      totalPages += result.pages;
      totalChanges += result.changes;

      console.log(`[CRON] Shop ${shop.id} completed, updated lastAutoCheckAt`);
    }
  } finally {
    await scraper.close();
  }

  console.log(
    `[CRON] Scheduled check complete: ${dueShops.length} shop(s), ${totalPages} pages, ${totalChanges} changes`
  );
}

function startCron(): void {
  console.log("[CRON] scheduler initialized");

  // Schedule checks every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    runScheduledChecks().catch((error) => {
      console.error("[CRON] Error running scheduled checks:", error);
    });
  });

  console.log("[CRON] Scheduled interval checks (every 5 minutes)");
}

/**
 * Initialize the scheduler with a singleton guard.
 * Call this from entry.server.tsx to start the cron on server boot.
 */
export function initScheduler(): void {
  if (!globalThis.__cronStarted) {
    startCron();
    globalThis.__cronStarted = true;
  }
}
