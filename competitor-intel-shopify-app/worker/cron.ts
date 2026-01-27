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

async function runPlanCheck(plan: string): Promise<void> {
  console.log(`\n[Cron] Starting ${plan} plan check at ${new Date().toISOString()}`);

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

  if (shops.length === 0) {
    console.log(`[Cron] No shops on ${plan} plan`);
    return;
  }

  console.log(`[Cron] Checking ${shops.length} shop(s) on ${plan} plan`);

  const scraper = new Scraper();
  await scraper.init();

  let totalPages = 0;
  let totalChanges = 0;

  try {
    for (const shop of shops) {
      console.log(`\n[Cron] Shop: ${shop.shopDomain}`);

      for (const competitor of shop.competitors) {
        if (competitor.pages.length === 0) continue;

        for (const page of competitor.pages) {
          totalPages++;
          const result = await checkPageWorker(page.id, scraper);
          if (result.hasChange) totalChanges++;
        }
      }
    }
  } finally {
    await scraper.close();
  }

  console.log(
    `\n[Cron] ${plan} plan check complete: ${totalPages} pages, ${totalChanges} changes`
  );
}

// Schedule cron jobs for each plan
console.log("[Cron] Starting Competitor Intel background worker...");

// Business plan: Every 15 minutes
cron.schedule("*/15 * * * *", () => {
  runPlanCheck("business").catch(console.error);
});
console.log("[Cron] Scheduled Business plan checks (every 15 minutes)");

// Pro plan: Every hour at minute 0
cron.schedule("0 * * * *", () => {
  runPlanCheck("pro").catch(console.error);
});
console.log("[Cron] Scheduled Pro plan checks (hourly)");

// Starter plan: Daily at 9am UTC
cron.schedule("0 9 * * *", () => {
  runPlanCheck("starter").catch(console.error);
});
console.log("[Cron] Scheduled Starter plan checks (daily at 9am UTC)");

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
