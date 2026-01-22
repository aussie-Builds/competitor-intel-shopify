import Anthropic from '@anthropic-ai/sdk';
import { config } from '../utils/config.js';
import { formatDiffForAnalysis } from './differ.js';

let anthropic = null;

function getClient() {
  if (!anthropic && config.anthropicApiKey) {
    anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropic;
}

export async function analyzeChanges(competitorName, competitorUrl, diff) {
  const client = getClient();

  if (!client) {
    console.log('[Analyzer] AI analysis unavailable - API key not configured');
    return {
      analysis: 'AI analysis unavailable - API key not configured',
      significance: 'unknown'
    };
  }

  const diffText = formatDiffForAnalysis(diff);

  const prompt = `You are a competitive intelligence analyst. Analyze the following changes detected on a competitor's website and provide strategic insights.

COMPETITOR: ${competitorName}
URL: ${competitorUrl}

CHANGES DETECTED:
${diffText}

CHANGE STATISTICS:
- Lines added: ${diff.addedCount}
- Lines removed: ${diff.removedCount}
- Change ratio: ${(diff.changeRatio * 100).toFixed(1)}%

Provide a concise analysis covering:
1. WHAT CHANGED: Brief summary of the actual changes
2. WHAT IT MEANS: Strategic implications (new products, pricing changes, messaging shifts, etc.)
3. SIGNIFICANCE: Rate as HIGH, MEDIUM, or LOW with brief justification
4. RECOMMENDED ACTION: What should we do in response, if anything?

Keep your response focused and actionable. Avoid speculation beyond what the evidence supports.`;

  console.log(`[Analyzer] Sending changes to Claude for analysis...`);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const analysis = response.content[0].text;
    console.log(`[Analyzer] Claude analysis received (${analysis.length} chars)`);

    let significance = 'medium';
    const lowerAnalysis = analysis.toLowerCase();
    if (lowerAnalysis.includes('significance: high') || lowerAnalysis.includes('significance:** high')) {
      significance = 'high';
    } else if (lowerAnalysis.includes('significance: low') || lowerAnalysis.includes('significance:** low')) {
      significance = 'low';
    }

    console.log(`[Analyzer] Determined significance: ${significance}`);
    return { analysis, significance };
  } catch (error) {
    console.error('[Analyzer] Claude API error:', error.message);
    return {
      analysis: `AI analysis failed: ${error.message}`,
      significance: 'unknown'
    };
  }
}
