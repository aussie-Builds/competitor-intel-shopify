import prisma from "~/db.server";
import { Scraper, type ScrapeResult } from "./scraper.server";
import {
  compareSnapshots,
  generateChangeSummary,
  determineSignificance,
  type DiffResult,
} from "./differ.server";
import { analyzeChanges } from "./analyzer.server";
import {
  sendChangeAlert,
  type ChangeNotification,
} from "./notifier.server";
import { PLAN_LIMITS } from "./billing.server";

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
  };
  isFirstSnapshot: boolean;
  change?: {
    id: string;
    significance: string;
    diff?: DiffResult;
  } | null;
  error?: string;
}

export async function checkPage(pageId: string): Promise<CheckResult> {
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

    // Update page lastChecked
    await prisma.page.update({
      where: { id: pageId },
      data: { lastChecked: new Date() },
    });

    if (!previousSnapshot) {
      console.log(`First snapshot captured for ${page.label}`);
      return {
        page: page as PageWithCompetitor,
        snapshot: newSnapshot,
        isFirstSnapshot: true,
        change: null,
      };
    }

    if (previousSnapshot.contentHash === newSnapshot.contentHash) {
      console.log(`No changes detected for ${page.label}`);
      return {
        page: page as PageWithCompetitor,
        snapshot: newSnapshot,
        isFirstSnapshot: false,
        change: null,
      };
    }

    console.log(`Changes detected for ${page.label}, analyzing...`);

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

    console.log(`Change recorded for ${page.label}: ${significance} significance`);

    // Send email notification if configured
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

    // Clean up old snapshots (keep last 10)
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

    return {
      page: page as PageWithCompetitor,
      snapshot: newSnapshot,
      isFirstSnapshot: false,
      change: { ...change, diff },
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

  const changesCount = results.filter((r) => r.change).length;

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
