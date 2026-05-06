import { execSync } from "child_process";
import type { AISignal, ByrealOrderParams, ByrealPosition, ExecutionResult } from "../types";

// ─── Config ───────────────────────────────────────────────────────────────────

const BYREAL_CLI    = process.env.BYREAL_CLI_PATH    || "byreal-perps";
const MAX_POSITION  = parseFloat(process.env.MAX_POSITION_USD  || "500");   // max per trade
const DEFAULT_LEV   = parseFloat(process.env.DEFAULT_LEVERAGE  || "2");
const DEFAULT_SLIP  = parseFloat(process.env.DEFAULT_SLIPPAGE  || "50");    // bps

// ─── Market mapper ────────────────────────────────────────────────────────────

function signalToMarket(asset: string): string {
  const map: Record<string, string> = {
    "MNT/USDC":  "MNT-PERP",
    "MNT/USDT":  "MNT-PERP",
    "ETH/USDC":  "ETH-PERP",
    "WETH/USDC": "ETH-PERP",
    "mETH/USDC": "METH-PERP",
    "BTC/USDC":  "BTC-PERP",
  };
  return map[asset] || asset.replace("/USDC", "-PERP").replace("/USDT", "-PERP");
}

// ─── Position sizing ─────────────────────────────────────────────────────────

/**
 * Kelly-inspired position sizing based on confidence + max cap.
 * confidence 65 → 30% of max, confidence 90+ → 100% of max.
 */
function sizePosition(confidence: number): number {
  const fraction = Math.min(1, (confidence - 50) / 50);
  return Math.round(MAX_POSITION * fraction);
}

// ─── CLI execution ────────────────────────────────────────────────────────────

function runByreal(args: string): string {
  try {
    return execSync(`${BYREAL_CLI} ${args}`, {
      encoding:  "utf8",
      timeout:   30_000,
      env: {
        ...process.env,
        BYREAL_PRIVATE_KEY: process.env.AGENT_PRIVATE_KEY,
        BYREAL_RPC:         process.env.MANTLE_RPC_URL || "https://rpc.mantle.xyz",
      },
    });
  } catch (err: any) {
    throw new Error(`Byreal CLI error: ${err.stderr || err.message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Execute a trade from an AI signal via Byreal Perps CLI.
 * Returns an ExecutionResult with the fill details.
 */
export async function executeSignal(
  signal:   AISignal,
  signalId: number
): Promise<ExecutionResult> {
  if (signal.type === "HOLD") {
    return { signalId, txHash: "", filled: false, fillPrice: 0, fillAmount: "0" };
  }

  const params: ByrealOrderParams = {
    market:   signalToMarket(signal.asset),
    side:     signal.type === "BUY" ? "long" : "short",
    size:     sizePosition(signal.confidence),
    leverage: DEFAULT_LEV,
    slippage: DEFAULT_SLIP,
  };

  console.log(`[Byreal] Executing ${params.side.toUpperCase()} ${params.market} @ $${params.size} size`);

  try {
    // Byreal Perps CLI command:
    // byreal-perps open --market MNT-PERP --side long --size 300 --leverage 2 --slippage 50 --json
    const raw = runByreal(
      `open ` +
      `--market   ${params.market}   ` +
      `--side     ${params.side}     ` +
      `--size     ${params.size}     ` +
      `--leverage ${params.leverage} ` +
      `--slippage ${params.slippage} ` +
      `--json`
    );

    const result = JSON.parse(raw.trim());

    return {
      signalId,
      txHash:     result.txHash     || result.tx_hash || "",
      filled:     result.filled     ?? true,
      fillPrice:  result.fillPrice  || result.fill_price || signal.entryPrice,
      fillAmount: result.fillAmount || result.fill_amount || `${params.size}`,
    };

  } catch (err: any) {
    console.error("[Byreal] Execution failed:", err.message);
    return {
      signalId,
      txHash:     "",
      filled:     false,
      fillPrice:  0,
      fillAmount: "0",
      error:      err.message,
    };
  }
}

/**
 * Fetch all open Byreal positions.
 */
export async function getOpenPositions(): Promise<ByrealPosition[]> {
  try {
    const raw = runByreal("positions --json");
    return JSON.parse(raw.trim()) as ByrealPosition[];
  } catch {
    return [];
  }
}

/**
 * Close a position by market name.
 * Returns the realised P&L in basis points.
 */
export async function closePosition(market: string): Promise<number> {
  try {
    const raw    = runByreal(`close --market ${market} --json`);
    const result = JSON.parse(raw.trim());
    // result.pnlBps is set by the CLI; fall back to simple calc
    return result.pnlBps || Math.round((result.pnlUsd / result.notional) * 10_000);
  } catch (err: any) {
    console.error("[Byreal] Close failed:", err.message);
    return 0;
  }
}

/**
 * Dry-run mode: simulate execution without sending a transaction.
 * Used in demo/presentation mode.
 */
export function simulateExecution(signal: AISignal, signalId: number): ExecutionResult {
  const fillPrice  = signal.entryPrice * (1 + (Math.random() - 0.5) * 0.002);
  const fillAmount = `${sizePosition(signal.confidence)}`;
  const txHash     = "0x" + Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");

  return { signalId, txHash, filled: true, fillPrice, fillAmount };
}
