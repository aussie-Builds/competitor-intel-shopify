import { Scraper } from './scraper.js';
import { compareSnapshots, generateChangeSummary, determineSignificance } from './differ.js';
import { analyzeChanges } from './analyzer.js';
import { sendChangeAlert } from './notifier.js';
import { Competitor } from '../models/competitor.js';
import { Page } from '../models/page.js';
import { Snapshot } from '../models/snapshot.js';
import { Change } from '../models/change.js';

export async function checkPage(pageId) {
  const page = Page.getWithLatestSnapshot(pageId);
  if (!page) {
    throw new Error(`Page not found: ${pageId}`);
  }

  console.log(`Checking ${page.competitor_name} - ${page.label} (${page.url})...`);

  const scraper = new Scraper();
  try {
    await scraper.init();
    const scrapeResult = await scraper.scrape(page.url);

    const previousSnapshot = Snapshot.findLatestByPage(pageId);

    const newSnapshot = Snapshot.create(
      page.competitor_id,
      pageId,
      scrapeResult.contentHash,
      scrapeResult.htmlContent,
      scrapeResult.textContent,
      scrapeResult.screenshotPath
    );

    if (!previousSnapshot) {
      console.log(`First snapshot captured for ${page.label}`);
      return {
        page,
        snapshot: newSnapshot,
        isFirstSnapshot: true,
        change: null
      };
    }

    if (previousSnapshot.content_hash === newSnapshot.content_hash) {
      console.log(`No changes detected for ${page.label}`);
      return {
        page,
        snapshot: newSnapshot,
        isFirstSnapshot: false,
        change: null
      };
    }

    console.log(`Changes detected for ${page.label}, analyzing...`);

    const diff = compareSnapshots(
      previousSnapshot.text_content || '',
      newSnapshot.text_content || ''
    );

    const changeSummary = generateChangeSummary(diff);
    let significance = determineSignificance(diff);

    const aiResult = await analyzeChanges(
      `${page.competitor_name} - ${page.label}`,
      page.url,
      diff
    );
    if (aiResult.significance !== 'unknown') {
      significance = aiResult.significance;
    }

    const change = Change.create(
      page.competitor_id,
      pageId,
      previousSnapshot.id,
      newSnapshot.id,
      changeSummary,
      aiResult.analysis,
      significance
    );

    console.log(`Change recorded for ${page.label}: ${significance} significance`);

    // Send email notification for this change
    const changeWithMeta = {
      ...change,
      competitor_name: page.competitor_name,
      page_label: page.label,
      page_url: page.url
    };
    console.log(`Sending notification for change...`);
    const notifyResult = await sendChangeAlert([changeWithMeta]);
    console.log(`Notification result:`, notifyResult);

    if (notifyResult.sent) {
      Change.markNotified(change.id);
    }

    Snapshot.deleteOldByPage(pageId);

    return {
      page,
      snapshot: newSnapshot,
      isFirstSnapshot: false,
      change: { ...change, diff }
    };
  } finally {
    await scraper.close();
  }
}

export async function checkCompetitor(competitorId) {
  const competitor = Competitor.getWithPages(competitorId);
  if (!competitor) {
    throw new Error(`Competitor not found: ${competitorId}`);
  }

  if (!competitor.pages || competitor.pages.length === 0) {
    throw new Error(`Competitor has no pages to check: ${competitor.name}`);
  }

  console.log(`Checking ${competitor.name} (${competitor.pages.length} pages)...`);

  const results = [];
  const scraper = new Scraper();

  try {
    await scraper.init();

    for (const page of competitor.pages) {
      try {
        const result = await checkPageWithScraper(page, competitor.name, scraper);
        results.push(result);
      } catch (error) {
        console.error(`Error checking ${page.label}:`, error.message);
        results.push({ page, error: error.message });
      }
    }
  } finally {
    await scraper.close();
  }

  const changes = results
    .filter(r => r.change)
    .map(r => ({
      ...r.change,
      competitor_name: competitor.name,
      page_label: r.page.label,
      page_url: r.page.url
    }));

  if (changes.length > 0) {
    console.log(`Sending notifications for ${changes.length} change(s)...`);
    const notifyResult = await sendChangeAlert(changes);

    if (notifyResult.sent) {
      Change.markManyNotified(changes.map(c => c.id));
    }
  }

  return {
    competitor,
    checked: competitor.pages.length,
    changes: changes.length,
    results
  };
}

export async function checkAllCompetitors(userId = null) {
  const competitors = Competitor.getAllWithPages(true, userId);
  const allResults = [];
  let totalPages = 0;
  let totalChanges = 0;

  console.log(`Starting check for ${competitors.length} competitor(s)...`);

  const scraper = new Scraper();
  try {
    await scraper.init();

    for (const competitor of competitors) {
      if (!competitor.pages || competitor.pages.length === 0) {
        console.log(`Skipping ${competitor.name} - no pages configured`);
        continue;
      }

      console.log(`Checking ${competitor.name} (${competitor.pages.length} pages)...`);

      for (const page of competitor.pages) {
        totalPages++;
        try {
          const result = await checkPageWithScraper(page, competitor.name, scraper);
          allResults.push({
            ...result,
            competitor_name: competitor.name
          });
          if (result.change) totalChanges++;
        } catch (error) {
          console.error(`Error checking ${competitor.name} - ${page.label}:`, error.message);
          allResults.push({
            page,
            competitor_name: competitor.name,
            error: error.message
          });
        }
      }
    }
  } finally {
    await scraper.close();
  }

  const changes = allResults
    .filter(r => r.change)
    .map(r => ({
      ...r.change,
      competitor_name: r.competitor_name,
      page_label: r.page.label,
      page_url: r.page.url
    }));

  if (changes.length > 0) {
    console.log(`Sending notifications for ${changes.length} change(s)...`);
    const notifyResult = await sendChangeAlert(changes);

    if (notifyResult.sent) {
      Change.markManyNotified(changes.map(c => c.id));
    }
  }

  return {
    competitors: competitors.length,
    checked: totalPages,
    changes: totalChanges,
    results: allResults
  };
}

export async function checkCompetitorsForPlan(plan) {
  const competitors = Competitor.getAllByPlan(plan);
  const allResults = [];
  let totalPages = 0;
  let totalChanges = 0;

  console.log(`Starting ${plan} plan check for ${competitors.length} competitor(s)...`);

  if (competitors.length === 0) {
    return { competitors: 0, checked: 0, changes: 0, results: [] };
  }

  const scraper = new Scraper();
  try {
    await scraper.init();

    for (const competitor of competitors) {
      const pages = Page.findByCompetitor(competitor.id, true);

      if (!pages || pages.length === 0) {
        console.log(`Skipping ${competitor.name} - no pages configured`);
        continue;
      }

      console.log(`Checking ${competitor.name} (${pages.length} pages)...`);

      for (const page of pages) {
        totalPages++;
        try {
          const result = await checkPageWithScraper(page, competitor.name, scraper);
          allResults.push({
            ...result,
            competitor_name: competitor.name
          });
          if (result.change) totalChanges++;
        } catch (error) {
          console.error(`Error checking ${competitor.name} - ${page.label}:`, error.message);
          allResults.push({
            page,
            competitor_name: competitor.name,
            error: error.message
          });
        }
      }
    }
  } finally {
    await scraper.close();
  }

  const changes = allResults
    .filter(r => r.change)
    .map(r => ({
      ...r.change,
      competitor_name: r.competitor_name,
      page_label: r.page.label,
      page_url: r.page.url
    }));

  if (changes.length > 0) {
    console.log(`Sending notifications for ${changes.length} change(s)...`);
    const notifyResult = await sendChangeAlert(changes);

    if (notifyResult.sent) {
      Change.markManyNotified(changes.map(c => c.id));
    }
  }

  return {
    competitors: competitors.length,
    checked: totalPages,
    changes: totalChanges,
    results: allResults
  };
}

async function checkPageWithScraper(page, competitorName, scraper) {
  console.log(`  Checking ${page.label} (${page.url})...`);

  const scrapeResult = await scraper.scrape(page.url);
  const previousSnapshot = Snapshot.findLatestByPage(page.id);

  const newSnapshot = Snapshot.create(
    page.competitor_id,
    page.id,
    scrapeResult.contentHash,
    scrapeResult.htmlContent,
    scrapeResult.textContent,
    scrapeResult.screenshotPath
  );

  if (!previousSnapshot) {
    console.log(`  First snapshot captured for ${page.label}`);
    return { page, snapshot: newSnapshot, isFirstSnapshot: true, change: null };
  }

  if (previousSnapshot.content_hash === newSnapshot.content_hash) {
    console.log(`  No changes detected for ${page.label}`);
    return { page, snapshot: newSnapshot, isFirstSnapshot: false, change: null };
  }

  console.log(`  Changes detected for ${page.label}, analyzing...`);

  const diff = compareSnapshots(
    previousSnapshot.text_content || '',
    newSnapshot.text_content || ''
  );

  const changeSummary = generateChangeSummary(diff);
  let significance = determineSignificance(diff);

  const aiResult = await analyzeChanges(
    `${competitorName} - ${page.label}`,
    page.url,
    diff
  );
  if (aiResult.significance !== 'unknown') {
    significance = aiResult.significance;
  }

  const change = Change.create(
    page.competitor_id,
    page.id,
    previousSnapshot.id,
    newSnapshot.id,
    changeSummary,
    aiResult.analysis,
    significance
  );

  Snapshot.deleteOldByPage(page.id);

  return { page, snapshot: newSnapshot, isFirstSnapshot: false, change };
}
