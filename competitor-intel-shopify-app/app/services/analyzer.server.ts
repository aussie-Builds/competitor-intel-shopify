import Anthropic from "@anthropic-ai/sdk";
import { formatDiffForAnalysis, type DiffResult } from "./differ.server";
import { formatPriceChange, type PriceDelta } from "./priceExtractor.server";

let anthropic: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

export interface AnalysisResult {
  analysis: string;
  significance: "high" | "medium" | "low" | "unknown";
}

export async function analyzeChanges(
  competitorName: string,
  competitorUrl: string,
  diff: DiffResult,
  priceDelta?: PriceDelta,
  currency?: string | null
): Promise<AnalysisResult> {
  const client = getClient();

  if (!client) {
    console.log("[Analyzer] AI analysis unavailable - API key not configured");
    return {
      analysis: "AI analysis unavailable - API key not configured",
      significance: "unknown",
    };
  }

  const diffText = formatDiffForAnalysis(diff);

  // Add price change context if available
  const priceContext = priceDelta?.isMeaningful
    ? `\n\nPRICE CHANGE DETECTED:\n${formatPriceChange(priceDelta, currency)}\n- Old price: ${priceDelta.oldPrice !== null ? `$${priceDelta.oldPrice.toFixed(2)}` : "unknown"}\n- New price: ${priceDelta.newPrice !== null ? `$${priceDelta.newPrice.toFixed(2)}` : "unknown"}`
    : "";

  const prompt = `You are a competitive intelligence analyst. Analyze the following changes detected on a competitor's website and provide strategic insights.

COMPETITOR: ${competitorName}
URL: ${competitorUrl}

CHANGES DETECTED:
${diffText}

CHANGE STATISTICS:
- Lines added: ${diff.addedCount}
- Lines removed: ${diff.removedCount}
- Change ratio: ${(diff.changeRatio * 100).toFixed(1)}%${priceContext}

IMPORTANT: Start your response with a QUICK INSIGHT section, then provide detailed analysis.

Format your response exactly like this:

QUICK INSIGHT:
- Verdict: (max 12 words summarizing what happened)
- Significance: LOW/MEDIUM/HIGH
- Next step: (max 16 words suggesting what to consider)

DETAILED ANALYSIS:

1. WHAT CHANGED: Brief summary of the actual changes
2. WHAT IT MEANS: Strategic implications (new products, pricing changes, messaging shifts, etc.)
3. SIGNIFICANCE: Rate as HIGH, MEDIUM, or LOW with brief justification
4. CONSIDERATIONS: Key factors to weigh when deciding how to respond (do NOT tell the user what to do - help them decide)

Keep your response focused and actionable. Avoid speculation beyond what the evidence supports. Frame recommendations as considerations, not directives.`;

  console.log(`[Analyzer] Sending changes to Claude for analysis...`);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    const analysis = content.type === "text" ? content.text : "";
    console.log(`[Analyzer] Claude analysis received (${analysis.length} chars)`);

    let significance: "high" | "medium" | "low" | "unknown" = "medium";
    const lowerAnalysis = analysis.toLowerCase();
    if (
      lowerAnalysis.includes("significance: high") ||
      lowerAnalysis.includes("significance:** high")
    ) {
      significance = "high";
    } else if (
      lowerAnalysis.includes("significance: low") ||
      lowerAnalysis.includes("significance:** low")
    ) {
      significance = "low";
    }

    console.log(`[Analyzer] Determined significance: ${significance}`);
    return { analysis, significance };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Analyzer] Claude API error:", message);
    return {
      analysis: `AI analysis failed: ${message}`,
      significance: "unknown",
    };
  }
}

export async function analyzePriceChange(
  competitorName: string,
  competitorUrl: string,
  priceDelta: PriceDelta,
  currency?: string | null
): Promise<AnalysisResult> {
  const client = getClient();

  if (!client) {
    console.log("[Analyzer] AI analysis unavailable - API key not configured");
    return {
      analysis: "AI analysis unavailable - API key not configured",
      significance: "unknown",
    };
  }

  const directionText = priceDelta.direction === "increase"
    ? "increased"
    : priceDelta.direction === "decrease"
    ? "decreased"
    : "changed";

  const prompt = `You are a competitive intelligence analyst specializing in pricing strategy. Analyze the following price change detected on a competitor's website.

COMPETITOR: ${competitorName}
URL: ${competitorUrl}

PRICE CHANGE DETECTED:
- Direction: Price ${directionText}
- Old price: ${priceDelta.oldPrice !== null ? `$${priceDelta.oldPrice.toFixed(2)}` : "unknown"}
- New price: ${priceDelta.newPrice !== null ? `$${priceDelta.newPrice.toFixed(2)}` : "unknown"}
- Change amount: ${priceDelta.deltaAmount !== null ? `$${Math.abs(priceDelta.deltaAmount).toFixed(2)}` : "unknown"}
- Change percent: ${priceDelta.deltaPercent !== null ? `${Math.abs(priceDelta.deltaPercent).toFixed(1)}%` : "unknown"}
${currency ? `- Currency: ${currency}` : ""}

IMPORTANT: Start your response with a QUICK INSIGHT section, then provide detailed analysis.

Format your response exactly like this:

QUICK INSIGHT:
- Verdict: (max 12 words summarizing the price change)
- Significance: LOW/MEDIUM/HIGH
- Next step: (max 16 words suggesting what to consider)

DETAILED ANALYSIS:

1. WHAT CHANGED: Summarize the price change
2. WHAT IT MIGHT MEAN: Possible reasons for this price change (market conditions, competitive pressure, cost changes, promotions, etc.)
3. SIGNIFICANCE: Rate as HIGH, MEDIUM, or LOW based on the magnitude and likely strategic importance
4. CONSIDERATIONS: Key factors to weigh when deciding how to respond (do NOT tell the user what to do - help them decide)

Keep your response focused. Acknowledge uncertainty where appropriate - you're analyzing a single data point.`;

  console.log(`[Analyzer] Sending price change to Claude for analysis...`);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    const analysis = content.type === "text" ? content.text : "";
    console.log(`[Analyzer] Claude price analysis received (${analysis.length} chars)`);

    // Determine significance based on response and price change magnitude
    let significance: "high" | "medium" | "low" | "unknown" = "medium";
    const lowerAnalysis = analysis.toLowerCase();

    if (
      lowerAnalysis.includes("significance: high") ||
      lowerAnalysis.includes("significance:** high")
    ) {
      significance = "high";
    } else if (
      lowerAnalysis.includes("significance: low") ||
      lowerAnalysis.includes("significance:** low")
    ) {
      significance = "low";
    } else {
      // Use magnitude-based heuristics if AI didn't clearly state
      const pctChange = Math.abs(priceDelta.deltaPercent || 0);
      if (pctChange >= 10) {
        significance = "high";
      } else if (pctChange >= 5) {
        significance = "medium";
      } else {
        significance = "low";
      }
    }

    console.log(`[Analyzer] Determined price change significance: ${significance}`);
    return { analysis, significance };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Analyzer] Claude API error:", message);
    return {
      analysis: `AI analysis failed: ${message}`,
      significance: "unknown",
    };
  }
}
