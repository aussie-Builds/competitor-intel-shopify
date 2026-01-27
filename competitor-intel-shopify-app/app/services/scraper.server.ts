import * as cheerio from "cheerio";
import { createHash } from "crypto";

export interface ScrapeResult {
  url: string;
  htmlContent: string;
  textContent: string;
  contentHash: string;
  capturedAt: string;
}

export interface ScrapeError {
  success: false;
  url: string;
  error: string;
}

export interface ScrapeSuccess extends ScrapeResult {
  success: true;
}

export type ScrapeMultipleResult = ScrapeSuccess | ScrapeError;

export class Scraper {
  private userAgent: string;

  constructor() {
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  async init(): Promise<this> {
    return this;
  }

  async close(): Promise<void> {
    // No cleanup needed for fetch-based scraper
  }

  async scrape(
    url: string,
    options: { timeout?: number } = {}
  ): Promise<ScrapeResult> {
    const { timeout = 30000 } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const htmlContent = await response.text();
      const $ = cheerio.load(htmlContent);

      // Remove non-content elements
      $(
        "script, style, noscript, iframe, svg, nav, footer, header, aside, .ad, .ads, .advertisement"
      ).remove();

      // Try to find main content area
      const mainSelectors = [
        "main",
        "article",
        '[role="main"]',
        ".content",
        "#content",
        ".main-content",
        "#main",
      ];
      let $content: ReturnType<typeof $> | null = null;

      for (const selector of mainSelectors) {
        const $found = $(selector);
        if ($found.length > 0) {
          $content = $found.first();
          break;
        }
      }

      // Fall back to body if no main content found
      if (!$content) {
        $content = $("body");
      }

      // Extract text content
      const textContent = $content
        .text()
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n");

      // Create content hash
      const contentHash = createHash("sha256")
        .update(textContent)
        .digest("hex")
        .substring(0, 16);

      return {
        url,
        htmlContent,
        textContent,
        contentHash,
        capturedAt: new Date().toISOString(),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async scrapeMultiple(
    urls: string[],
    options: { timeout?: number } = {}
  ): Promise<ScrapeMultipleResult[]> {
    const results: ScrapeMultipleResult[] = [];

    for (const url of urls) {
      try {
        const result = await this.scrape(url, options);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({
          success: false,
          url,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }
}

export async function scrapeUrl(
  url: string,
  options: { timeout?: number } = {}
): Promise<ScrapeResult> {
  const scraper = new Scraper();
  try {
    await scraper.init();
    return await scraper.scrape(url, options);
  } finally {
    await scraper.close();
  }
}
