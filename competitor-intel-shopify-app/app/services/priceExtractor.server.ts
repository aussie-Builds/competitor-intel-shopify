import * as cheerio from "cheerio";

/**
 * Price Extraction Confidence Levels
 *
 * HIGH: Price extracted from structured data sources
 *   - JSON-LD Product/Offer schema (most reliable)
 *   - OpenGraph meta tags (og:price:amount, product:price:amount)
 *   - Explicit data attributes (data-price, itemprop="price")
 *   Use: Normal alert thresholds apply
 *
 * MEDIUM: Price extracted from common UI patterns
 *   - CSS selectors like .price, .product-price, .current-price
 *   - Element text content matching price patterns
 *   Use: Normal alert thresholds apply
 *
 * LOW: Price extracted via regex from page text
 *   - Pattern matching ($XX.XX, XX EUR, etc.)
 *   - May match non-price numbers or promotional text
 *   Use: Stricter thresholds required (>=5% or >=$2)
 *
 * NONE: No price could be extracted
 *   - Page may not contain pricing
 *   - Price format not recognized
 *   Use: No price alerts generated
 */
export type PriceConfidence = "high" | "medium" | "low" | "none";

export interface ExtractedPrice {
  priceValue: number | null;
  priceRaw: string | null;
  currency: string | null;
  confidence: PriceConfidence;
  source: string;
}

export interface PriceExtractionConfig {
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Get adjusted thresholds based on price extraction confidence.
 * Low confidence extractions require stronger price movements to trigger alerts.
 */
export function getConfidenceAdjustedThresholds(
  confidence: PriceConfidence,
  baseThresholds: PriceThresholds
): PriceThresholds & { shouldAlert: boolean } {
  switch (confidence) {
    case "high":
    case "medium":
      // Use normal thresholds for reliable extractions
      return { ...baseThresholds, shouldAlert: true };

    case "low":
      // Require stronger signals for low-confidence extractions
      // Use at least 5% or $2, whichever is higher than base
      return {
        minPercentChange: Math.max(baseThresholds.minPercentChange ?? 1, 5),
        minAmountChange: Math.max(baseThresholds.minAmountChange ?? 0.5, 2),
        shouldAlert: true,
      };

    case "none":
      // No price extracted - cannot generate price alerts
      return { ...baseThresholds, shouldAlert: false };
  }
}

const DEFAULT_CONFIG: PriceExtractionConfig = {
  minPrice: 0.01,
  maxPrice: 1000000,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "£": "GBP",
  "€": "EUR",
  "¥": "JPY",
  "₹": "INR",
  "C$": "CAD",
  "A$": "AUD",
  kr: "SEK",
  "₽": "RUB",
  "R$": "BRL",
  "₩": "KRW",
  "฿": "THB",
  "₫": "VND",
  "₱": "PHP",
  "₴": "UAH",
  "₦": "NGN",
  "zł": "PLN",
  "Kč": "CZK",
  "Ft": "HUF",
  "lei": "RON",
  "₪": "ILS",
};

const CURRENCY_CODES = [
  "USD",
  "GBP",
  "EUR",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "INR",
  "SEK",
  "NOK",
  "DKK",
  "NZD",
  "SGD",
  "HKD",
  "KRW",
  "MXN",
  "BRL",
  "RUB",
  "ZAR",
  "TRY",
  "PLN",
  "THB",
  "IDR",
  "MYR",
  "PHP",
  "CZK",
  "ILS",
  "AED",
  "CLP",
  "COP",
  "PEN",
  "VND",
];

function parsePrice(priceString: string): { value: number; currency: string | null } | null {
  if (!priceString || typeof priceString !== "string") {
    return null;
  }

  const cleaned = priceString.trim();

  // Try to find currency
  let currency: string | null = null;

  // Check for currency codes
  for (const code of CURRENCY_CODES) {
    if (cleaned.toUpperCase().includes(code)) {
      currency = code;
      break;
    }
  }

  // Check for currency symbols
  if (!currency) {
    for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
      if (cleaned.includes(symbol)) {
        currency = code;
        break;
      }
    }
  }

  // Extract numeric value
  // Remove currency symbols and text, keep numbers, dots, and commas
  const numericPart = cleaned
    .replace(/[^\d.,\-\s]/g, "")
    .trim();

  if (!numericPart) {
    return null;
  }

  // Handle different number formats
  // Common formats: 1,234.56 (US), 1.234,56 (EU), 1 234,56 (FR)
  let normalizedNumber: string;

  // If has both comma and dot, determine which is decimal separator
  if (numericPart.includes(",") && numericPart.includes(".")) {
    const lastComma = numericPart.lastIndexOf(",");
    const lastDot = numericPart.lastIndexOf(".");

    if (lastComma > lastDot) {
      // EU format: 1.234,56
      normalizedNumber = numericPart.replace(/\./g, "").replace(",", ".");
    } else {
      // US format: 1,234.56
      normalizedNumber = numericPart.replace(/,/g, "");
    }
  } else if (numericPart.includes(",")) {
    // Check if comma is thousands separator or decimal
    const parts = numericPart.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Likely decimal: 1234,56
      normalizedNumber = numericPart.replace(",", ".");
    } else {
      // Likely thousands: 1,234
      normalizedNumber = numericPart.replace(/,/g, "");
    }
  } else {
    normalizedNumber = numericPart.replace(/\s/g, "");
  }

  const value = parseFloat(normalizedNumber);

  if (isNaN(value)) {
    return null;
  }

  return { value, currency };
}

function isValidPrice(value: number, config: PriceExtractionConfig): boolean {
  const min = config.minPrice ?? DEFAULT_CONFIG.minPrice!;
  const max = config.maxPrice ?? DEFAULT_CONFIG.maxPrice!;
  return value >= min && value <= max;
}

function extractFromJsonLd(html: string, config: PriceExtractionConfig): ExtractedPrice | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');

  for (let i = 0; i < scripts.length; i++) {
    try {
      const content = $(scripts[i]).html();
      if (!content) continue;

      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        // Check for Product schema
        if (item["@type"] === "Product" && item.offers) {
          const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
          for (const offer of offers) {
            if (offer.price !== undefined) {
              const value = typeof offer.price === "string" ? parseFloat(offer.price) : offer.price;
              if (!isNaN(value) && isValidPrice(value, config)) {
                return {
                  priceValue: value,
                  priceRaw: String(offer.price),
                  currency: offer.priceCurrency || null,
                  confidence: "high",
                  source: "json-ld",
                };
              }
            }
          }
        }

        // Check for Offer schema directly
        if (item["@type"] === "Offer" && item.price !== undefined) {
          const value = typeof item.price === "string" ? parseFloat(item.price) : item.price;
          if (!isNaN(value) && isValidPrice(value, config)) {
            return {
              priceValue: value,
              priceRaw: String(item.price),
              currency: item.priceCurrency || null,
              confidence: "high",
              source: "json-ld",
            };
          }
        }
      }
    } catch {
      // Invalid JSON, continue
    }
  }

  return null;
}

function extractFromMetaTags(html: string, config: PriceExtractionConfig): ExtractedPrice | null {
  const $ = cheerio.load(html);

  // OpenGraph price tags
  const ogPriceSelectors = [
    'meta[property="og:price:amount"]',
    'meta[property="product:price:amount"]',
    'meta[name="product:price:amount"]',
    'meta[property="og:price"]',
    'meta[name="twitter:data1"]',
  ];

  const currencySelectors = [
    'meta[property="og:price:currency"]',
    'meta[property="product:price:currency"]',
    'meta[name="product:price:currency"]',
  ];

  for (const selector of ogPriceSelectors) {
    const priceEl = $(selector);
    if (priceEl.length > 0) {
      const priceContent = priceEl.attr("content");
      if (priceContent) {
        const parsed = parsePrice(priceContent);
        if (parsed && isValidPrice(parsed.value, config)) {
          // Try to find currency
          let currency = parsed.currency;
          if (!currency) {
            for (const currSelector of currencySelectors) {
              const currEl = $(currSelector);
              if (currEl.length > 0) {
                currency = currEl.attr("content") || null;
                break;
              }
            }
          }

          return {
            priceValue: parsed.value,
            priceRaw: priceContent,
            currency,
            confidence: "high",
            source: "meta-tag",
          };
        }
      }
    }
  }

  return null;
}

function extractFromSelectors(html: string, config: PriceExtractionConfig): ExtractedPrice | null {
  const $ = cheerio.load(html);

  // Common price selectors (ordered by specificity/reliability)
  const priceSelectors = [
    '[data-price]',
    '[data-product-price]',
    '[itemprop="price"]',
    '.product-price',
    '.price-value',
    '.current-price',
    '.sale-price',
    '.final-price',
    '#product-price',
    '.product__price',
    '.price--main',
    '.price-item--regular',
    '.price-item--sale',
    '[class*="ProductPrice"]',
    '[class*="product-price"]',
    '[class*="productPrice"]',
    '.price',
  ];

  for (const selector of priceSelectors) {
    const elements = $(selector);

    for (let i = 0; i < Math.min(elements.length, 5); i++) {
      const el = $(elements[i]);

      // Check data attributes first
      const dataPrice = el.attr("data-price") || el.attr("data-product-price") || el.attr("content");
      if (dataPrice) {
        const parsed = parsePrice(dataPrice);
        if (parsed && isValidPrice(parsed.value, config)) {
          return {
            priceValue: parsed.value,
            priceRaw: dataPrice,
            currency: parsed.currency,
            confidence: "medium",
            source: `selector:${selector}`,
          };
        }
      }

      // Check text content
      const text = el.text().trim();
      if (text) {
        const parsed = parsePrice(text);
        if (parsed && isValidPrice(parsed.value, config)) {
          return {
            priceValue: parsed.value,
            priceRaw: text,
            currency: parsed.currency,
            confidence: "medium",
            source: `selector:${selector}`,
          };
        }
      }
    }
  }

  return null;
}

function extractFromRegex(textContent: string, config: PriceExtractionConfig): ExtractedPrice | null {
  // Price patterns to match
  const patterns = [
    // $XX.XX, £XX.XX, €XX.XX etc.
    /(?:[$£€¥₹₽₩])\s*(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/g,
    // XX.XX USD, XX EUR, etc.
    /(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)\s*(?:USD|EUR|GBP|CAD|AUD|JPY)/gi,
    // "Price: $XX.XX" or "Price $XX.XX"
    /price[:\s]+(?:[$£€¥₹₽₩])\s*(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/gi,
  ];

  const prices: { value: number; raw: string; currency: string | null }[] = [];

  for (const pattern of patterns) {
    const matches = textContent.matchAll(pattern);
    for (const match of matches) {
      const parsed = parsePrice(match[0]);
      if (parsed && isValidPrice(parsed.value, config)) {
        prices.push({
          value: parsed.value,
          raw: match[0],
          currency: parsed.currency,
        });
      }
    }
  }

  // Return the most common or first price found
  if (prices.length > 0) {
    // Group by value and return most common
    const valueCounts = new Map<number, number>();
    for (const p of prices) {
      valueCounts.set(p.value, (valueCounts.get(p.value) || 0) + 1);
    }

    let bestPrice = prices[0];
    let bestCount = 1;

    for (const p of prices) {
      const count = valueCounts.get(p.value) || 0;
      if (count > bestCount) {
        bestPrice = p;
        bestCount = count;
      }
    }

    return {
      priceValue: bestPrice.value,
      priceRaw: bestPrice.raw,
      currency: bestPrice.currency,
      confidence: "low",
      source: "regex",
    };
  }

  return null;
}

export function extractPrice(
  html: string,
  textContent?: string,
  config: PriceExtractionConfig = {}
): ExtractedPrice {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Try extraction methods in order of reliability
  const jsonLdResult = extractFromJsonLd(html, mergedConfig);
  if (jsonLdResult) {
    return jsonLdResult;
  }

  const metaResult = extractFromMetaTags(html, mergedConfig);
  if (metaResult) {
    return metaResult;
  }

  const selectorResult = extractFromSelectors(html, mergedConfig);
  if (selectorResult) {
    return selectorResult;
  }

  // Only use regex as last resort with text content
  if (textContent) {
    const regexResult = extractFromRegex(textContent, mergedConfig);
    if (regexResult) {
      return regexResult;
    }
  }

  return {
    priceValue: null,
    priceRaw: null,
    currency: null,
    confidence: "none",
    source: "none",
  };
}

export interface PriceDelta {
  oldPrice: number | null;
  newPrice: number | null;
  deltaAmount: number | null;
  deltaPercent: number | null;
  isMeaningful: boolean;
  direction: "increase" | "decrease" | "unchanged" | "unknown";
}

export interface PriceThresholds {
  minPercentChange?: number;
  minAmountChange?: number;
}

const DEFAULT_THRESHOLDS: PriceThresholds = {
  minPercentChange: 1, // 1% change
  minAmountChange: 0.01, // $0.01 change
};

export function computePriceDelta(
  oldPrice: number | null,
  newPrice: number | null,
  thresholds: PriceThresholds = {}
): PriceDelta {
  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };

  // Both null - no comparison possible
  if (oldPrice === null && newPrice === null) {
    return {
      oldPrice: null,
      newPrice: null,
      deltaAmount: null,
      deltaPercent: null,
      isMeaningful: false,
      direction: "unknown",
    };
  }

  // New price appeared
  if (oldPrice === null && newPrice !== null) {
    return {
      oldPrice: null,
      newPrice,
      deltaAmount: null,
      deltaPercent: null,
      isMeaningful: true,
      direction: "unknown",
    };
  }

  // Price disappeared
  if (oldPrice !== null && newPrice === null) {
    return {
      oldPrice,
      newPrice: null,
      deltaAmount: null,
      deltaPercent: null,
      isMeaningful: true,
      direction: "unknown",
    };
  }

  // Both have values - compute delta
  const deltaAmount = newPrice! - oldPrice!;
  const deltaPercent = oldPrice !== 0 ? (deltaAmount / oldPrice!) * 100 : null;

  const absDeltaAmount = Math.abs(deltaAmount);
  const absDeltaPercent = deltaPercent !== null ? Math.abs(deltaPercent) : 0;

  const isMeaningful =
    absDeltaAmount >= (config.minAmountChange ?? 0) ||
    absDeltaPercent >= (config.minPercentChange ?? 0);

  let direction: PriceDelta["direction"];
  if (deltaAmount > 0) {
    direction = "increase";
  } else if (deltaAmount < 0) {
    direction = "decrease";
  } else {
    direction = "unchanged";
  }

  return {
    oldPrice,
    newPrice,
    deltaAmount,
    deltaPercent,
    isMeaningful,
    direction,
  };
}

export function formatPriceChange(delta: PriceDelta, currency?: string | null): string {
  if (delta.direction === "unknown") {
    if (delta.newPrice !== null && delta.oldPrice === null) {
      return `Price detected: ${formatPrice(delta.newPrice, currency)}`;
    }
    if (delta.oldPrice !== null && delta.newPrice === null) {
      return `Price no longer detected (was ${formatPrice(delta.oldPrice, currency)})`;
    }
    return "Price change unknown";
  }

  if (delta.direction === "unchanged") {
    return "Price unchanged";
  }

  const symbol = delta.direction === "increase" ? "+" : "";
  const amountStr = delta.deltaAmount !== null ? formatPrice(delta.deltaAmount, currency) : "?";
  const pctStr = delta.deltaPercent !== null ? `${delta.deltaPercent.toFixed(1)}%` : "?";

  return `Price ${delta.direction}: ${symbol}${amountStr} (${symbol}${pctStr})`;
}

function formatPrice(value: number, currency?: string | null): string {
  const symbol = currency
    ? Object.entries(CURRENCY_SYMBOLS).find(([, code]) => code === currency)?.[0] || currency + " "
    : "$";
  return `${symbol}${Math.abs(value).toFixed(2)}`;
}
