import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { Scraper } from "../app/services/scraper.server";
import {
  compareSnapshots,
  generateChangeSummary,
  determineSignificance,
} from "../app/services/differ.server";
import { analyzeChanges } from "../app/services/analyzer.server";
import { sendChangeAlert, type ChangeNotification } from "../app/services/notifier.server";

const prisma = new PrismaClient();

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

async function runShopCheck(shopId: string, scraper: Scraper): Promise<{ pages: number; changes: number }> {
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
  const effectiveIntervalMinutes = Math.max(checkIntervalMinutes, maxFrequencyAllowedMinutes);
  const effectiveIntervalMs = effectiveIntervalMinutes * 60 * 1000;

  const timeSinceLastCheck = Date.now() - lastAutoCheckAt.getTime();
  return timeSinceLastCheck >= effectiveIntervalMs;
}

async function runScheduledChecks(): Promise<void> {
  console.log(`\n[Cron] Running scheduled checks at ${new Date().toISOString()}`);

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
    console.log(`[Cron] No shops with active pages to check`);
    return;
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
    console.log(`[Cron] No shops due for check (${shops.length} shop(s) checked, none due)`);
    return;
  }

  console.log(`[Cron] ${dueShops.length} shop(s) due for check`);

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
        `\n[Cron] Shop: ${shop.shopDomain} (interval: ${effectiveInterval}min)`
      );

      const result = await runShopCheck(shop.id, scraper);
      totalPages += result.pages;
      totalChanges += result.changes;
    }
  } finally {
    await scraper.close();
  }

  console.log(
    `\n[Cron] Scheduled check complete: ${dueShops.length} shop(s), ${totalPages} pages, ${totalChanges} changes`
  );
}

// Single cron job that runs every 5 minutes
console.log("[Cron] Starting Competitor Intel background worker...");

cron.schedule("*/5 * * * *", () => {
  runScheduledChecks().catch(console.error);
});
console.log("[Cron] Scheduled interval checks (every 5 minutes)");

console.log("[Cron] Worker ready. Waiting for scheduled jobs...\n");

// Keep process alive
process.on("SIGINT", async () => {
  console.log("\n[Cron] Shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Cron] Shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});
