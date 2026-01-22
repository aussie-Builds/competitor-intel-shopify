import puppeteer from 'puppeteer';
import { createHash } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const SNAPSHOT_DIR = resolve(process.cwd(), 'snapshots');

if (!existsSync(SNAPSHOT_DIR)) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

export class Scraper {
  constructor() {
    this.browser = null;
  }

  async init() {
    if (!this.browser) {
      const launchOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--mute-audio'
        ]
      };

      // Use system Chrome if PUPPETEER_EXECUTABLE_PATH is set (for Render/Docker)
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }

      this.browser = await puppeteer.launch(launchOptions);
    }
    return this;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrape(url, options = {}) {
    const {
      takeScreenshot = true,
      waitForSelector = null,
      timeout = 30000
    } = options;

    if (!this.browser) {
      await this.init();
    }

    const page = await this.browser.newPage();

    try {
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout
      });

      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {});
      }

      await page.evaluate(() => new Promise(r => setTimeout(r, 2000)));

      const htmlContent = await page.content();

      const textContent = await page.evaluate(() => {
        const elementsToRemove = document.querySelectorAll(
          'script, style, noscript, iframe, svg, nav, footer, header'
        );
        elementsToRemove.forEach(el => el.remove());

        const main = document.querySelector('main, article, [role="main"], .content, #content');
        const target = main || document.body;

        return target.innerText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');
      });

      const contentHash = createHash('sha256')
        .update(textContent)
        .digest('hex')
        .substring(0, 16);

      let screenshotPath = null;
      if (takeScreenshot) {
        const timestamp = Date.now();
        const filename = `${contentHash}-${timestamp}.png`;
        screenshotPath = resolve(SNAPSHOT_DIR, filename);

        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        });
        console.log(`[Scraper] Screenshot saved: ${filename}`);
      }

      return {
        url,
        htmlContent,
        textContent,
        contentHash,
        screenshotPath,
        capturedAt: new Date().toISOString()
      };
    } finally {
      await page.close();
    }
  }

  async scrapeMultiple(urls, options = {}) {
    const results = [];

    for (const url of urls) {
      try {
        const result = await this.scrape(url, options);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({
          success: false,
          url,
          error: error.message
        });
      }
    }

    return results;
  }
}

export async function scrapeUrl(url, options = {}) {
  const scraper = new Scraper();
  try {
    await scraper.init();
    return await scraper.scrape(url, options);
  } finally {
    await scraper.close();
  }
}
