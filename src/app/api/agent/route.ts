import { NextResponse } from "next/server";
import { analyzeActivity, buildAnalysisUri } from "@/lib/claude";
import { simulateExecution }                 from "@/lib/byreal";
import { recordSignalOnChain }               from "@/lib/contract";

/**
 * POST /api/agent
 * Trigger a single agent analysis cycle.
 * Useful for demo — call this to generate a signal on demand.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const demoActivity = [{
    wallet:    body.wallet    || "0x3Fa4000000000000000000000000000000000d72C",
    txHash:    "0x" + Math.random().toString(16).slice(2).padEnd(64, "0"),
    blockNum:  19_800_000,
    timestamp: Math.floor(Date.now() / 1000),
    action:    "swap" as const,
    tokenIn:   { address: "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9", symbol: "USDC", amount: "50000", decimals: 6 },
    tokenOut:  { address: "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8", symbol: "MNT",  amount: "58823", decimals: 18 },
    valueUsd:  50000,
  }];

  const signal = await analyzeActivity(
    demoActivity,
    body.walletLabel || "Demo Smart Money",
    "73% win rate. Specializes in MNT accumulation.",
    { MNT: 0.85, USDC: 1, WETH: 3200 },
    60
  );

  if (!signal) {
    return NextResponse.json({ message: "No signal generated (low confidence)" });
  }

  const analysisUri = buildAnalysisUri(signal);
  const execResult  = simulateExecution(signal, 0);

  let onChainId = -1;
  if (process.env.AGENT_PRIVATE_KEY && process.env.CONTRACT_ADDRESS) {
    try {
      onChainId = await recordSignalOnChain(signal, analysisUri);
    } catch (err: any) {
      console.warn("[API /agent] On-chain write failed:", err.message);
    }
  }

  return NextResponse.json({ signal, execResult, onChainId, analysisUri });
}
