import Anthropic from "@anthropic-ai/sdk";
import type { WalletActivity, AISignal, SignalType } from "../types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are MantleSignal, an expert on-chain intelligence agent specializing in Mantle Network DeFi.

Your job: analyze wallet activity from known smart money addresses and generate high-confidence trading signals.

You have access to:
- Real-time Mantle on-chain data (swaps, LP additions, transfers)
- Historical pattern recognition for the tracked wallets
- Market context (price trends, protocol TVL changes, news)

When analyzing wallet activity, consider:
1. Position size relative to wallet's historical trades (is this unusually large?)
2. Timing (accumulation pattern vs. single large trade)
3. Asset choice (established assets vs. micro-caps)
4. Wallet's historical win rate and specialization
5. Correlated activity across multiple tracked wallets (conviction signal)

Signal confidence guidelines:
- 90-100: Multiple wallets acting in concert, large sizes, clear narrative
- 75-89: Single high-conviction wallet, pattern matches historical winners  
- 60-74: Interesting signal but uncertain — may set smaller position
- Below 60: Log for monitoring, do not execute

Output ONLY valid JSON. No markdown, no explanation outside the JSON.`;

// ─── Main analyzer ────────────────────────────────────────────────────────────

/**
 * Feed wallet activity to Claude and get back a structured trading signal.
 * Returns null if confidence is below threshold or no actionable signal found.
 */
export async function analyzeActivity(
  activities:       WalletActivity[],
  walletLabel:      string,
  walletHistory:    string,      // brief text summary of wallet's track record
  currentPrices:    Record<string, number>,
  confidenceFloor:  number = 65
): Promise<AISignal | null> {

  const userPrompt = `
WALLET: ${walletLabel} (${activities[0]?.wallet})
HISTORICAL TRACK RECORD: ${walletHistory}

RECENT ACTIVITY (last 30 min):
${activities.map(a => `
  [${new Date(a.timestamp * 1000).toISOString()}] ${a.action.toUpperCase()}
  Token In:  ${a.tokenIn.amount} ${a.tokenIn.symbol}
  Token Out: ${a.tokenOut.amount} ${a.tokenOut.symbol}
  Est. Value: $${a.valueUsd.toLocaleString()}
  TX: ${a.txHash}
`).join("\n")}

CURRENT PRICES (USD):
${Object.entries(currentPrices).map(([k, v]) => `  ${k}: $${v}`).join("\n")}

Analyze this activity. If confidence >= ${confidenceFloor}, output a signal. Otherwise output {"skip": true, "reason": "..."}.

Required JSON schema for signals:
{
  "wallet": "0x...",
  "type": "BUY" | "SELL" | "HOLD",
  "confidence": 0-100,
  "asset": "MNT/USDC",
  "reasoning": "Detailed explanation (2-4 sentences)",
  "entryPrice": 0.00,
  "targetPrice": 0.00,
  "stopLoss": 0.00,
  "timeframe": "4h",
  "catalysts": ["catalyst 1", "catalyst 2"]
}`.trim();

  try {
    const response = await client.messages.create({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    const parsed = JSON.parse(text.trim());

    if (parsed.skip) {
      console.log(`[Claude] Skipped signal: ${parsed.reason}`);
      return null;
    }

    if (parsed.confidence < confidenceFloor) {
      console.log(`[Claude] Low confidence (${parsed.confidence}), skipping`);
      return null;
    }

    return parsed as AISignal;

  } catch (err) {
    console.error("[Claude] Analysis failed:", err);
    return null;
  }
}

// ─── Batch summarizer (for dashboard context) ─────────────────────────────────

/**
 * Summarize recent market activity across all tracked wallets into a 
 * human-readable market intelligence brief.
 */
export async function generateMarketBrief(
  recentActivities: WalletActivity[],
  recentSignals:    AISignal[]
): Promise<string> {
  const prompt = `
Based on the following smart money activity on Mantle Network in the last hour,
write a 3-sentence market intelligence brief for traders. Be specific, cite assets and wallets.

ACTIVITY SUMMARY:
${recentActivities.slice(0, 10).map(a =>
  `- ${a.label || a.wallet.slice(0, 8)} moved $${a.valueUsd.toLocaleString()} in ${a.tokenIn.symbol}`
).join("\n")}

SIGNALS GENERATED:
${recentSignals.slice(0, 5).map(s =>
  `- ${s.type} ${s.asset} @ ${s.confidence}% confidence: ${s.reasoning.slice(0, 80)}...`
).join("\n")}

Output: plain text only, no JSON, no markdown.`.trim();

  try {
    const response = await client.messages.create({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages:   [{ role: "user", content: prompt }],
    });

    return response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
  } catch {
    return "Market intelligence temporarily unavailable.";
  }
}

// ─── Analysis URI builder ─────────────────────────────────────────────────────

/**
 * Creates a data URI that stores the full signal reasoning on-chain (or IPFS).
 * For demo purposes we use a base64 data URI. In production, upload to IPFS.
 */
export function buildAnalysisUri(signal: AISignal): string {
  const payload = {
    generated: new Date().toISOString(),
    model:     "claude-sonnet-4-20250514",
    ...signal,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `data:application/json;base64,${b64}`;
}
