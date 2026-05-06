/**
 * MantleSignal Agent
 * ─────────────────
 * Continuously scans Mantle for smart money activity, generates AI signals via Claude,
 * executes trades via Byreal, and records everything on-chain for verifiable alpha.
 *
 * Run: npx ts-node agent/index.ts
 */

import { getMantleProvider, scanWalletActivity, getLatestBlock } from "../src/lib/mantle";
import { analyzeActivity, buildAnalysisUri }                     from "../src/lib/claude";
import { executeSignal, simulateExecution }                      from "../src/lib/byreal";
import { recordSignalOnChain, closeSignalOnChain }               from "../src/lib/contract";
import type { WalletActivity }                                   from "../src/types";

// ─── Configuration ────────────────────────────────────────────────────────────

const SCAN_INTERVAL_MS   = parseInt(process.env.SCAN_INTERVAL_MS   || "60000");  // 1 min
const CONFIDENCE_FLOOR   = parseInt(process.env.CONFIDENCE_FLOOR   || "65");
const DRY_RUN            = process.env.DRY_RUN !== "false";   // safe default
const BLOCKS_PER_SCAN    = 5;

// ─── Smart money wallets to track ─────────────────────────────────────────────
// Seed list — update with real Nansen Smart Money addresses on Mantle

const TRACKED_WALLETS: Array<{ address: string; label: string; history: string }> = [
  {
    address: process.env.WALLET_1 || "0x0000000000000000000000000000000000000001",
    label:   "Mantle Whale #1",
    history: "Consistent early-entry into new Mantle protocols. 73% win rate over 45 trades. Specializes in MNT/ETH pairs. Average hold: 8 hours.",
  },
  {
    address: process.env.WALLET_2 || "0x0000000000000000000000000000000000000002",
    label:   "Smart Money #2",
    history: "High-frequency trader. Focuses on Fusion X LP strategies. 68% win rate. Typically uses large position sizes (>$10k).",
  },
  {
    address: process.env.WALLET_3 || "0x0000000000000000000000000000000000000003",
    label:   "Nansen Label: Smart Money",
    history: "Protocol insider track record — often moves 24h before major announcements. 81% win rate, 12 signals tracked.",
  },
];

// ─── State ────────────────────────────────────────────────────────────────────

const activityBuffer = new Map<string, WalletActivity[]>(); // wallet -> recent activity
let lastScannedBlock = 0;
let signalCount      = 0;

// ─── Main loop ────────────────────────────────────────────────────────────────

async function runAgent() {
  const provider  = getMantleProvider();
  const walletAddresses = TRACKED_WALLETS.map(w => w.address);

  console.log("═".repeat(60));
  console.log("  MantleSignal Agent v1.0");
  console.log(`  Tracking ${walletAddresses.length} wallets`);
  console.log(`  Confidence floor: ${CONFIDENCE_FLOOR}%`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no real trades)" : "LIVE"}`);
  console.log("═".repeat(60));

  // Initialize block pointer
  lastScannedBlock = (await getLatestBlock(provider)) - BLOCKS_PER_SCAN;

  while (true) {
    try {
      await tick(provider, walletAddresses);
    } catch (err) {
      console.error("[Agent] Tick error:", err);
    }
    await sleep(SCAN_INTERVAL_MS);
  }
}

async function tick(
  provider: ReturnType<typeof getMantleProvider>,
  walletAddresses: string[]
) {
  const currentBlock = await getLatestBlock(provider);
  const fromBlock    = lastScannedBlock + 1;
  const toBlock      = Math.min(currentBlock, fromBlock + BLOCKS_PER_SCAN);

  if (fromBlock > toBlock) return; // nothing new

  console.log(`\n[Agent] Scanning blocks ${fromBlock}→${toBlock}`);

  // ── 1. Index wallet activity ───────────────────────────────────────────────
  const newActivity = await scanWalletActivity(walletAddresses, fromBlock, toBlock, provider);
  console.log(`[Agent] Found ${newActivity.length} events from tracked wallets`);

  for (const activity of newActivity) {
    const buf = activityBuffer.get(activity.wallet) || [];
    buf.unshift(activity);
    activityBuffer.set(activity.wallet, buf.slice(0, 50)); // keep last 50 per wallet
  }

  lastScannedBlock = toBlock;

  // ── 2. Analyze each wallet that had recent activity ────────────────────────
  const activeWallets = [...new Set(newActivity.map(a => a.wallet))];

  for (const wallet of activeWallets) {
    const walletConfig = TRACKED_WALLETS.find(w =>
      w.address.toLowerCase() === wallet.toLowerCase()
    );
    if (!walletConfig) continue;

    const recentActivity = activityBuffer.get(wallet) || [];
    if (recentActivity.length === 0) continue;

    console.log(`[Claude] Analyzing ${walletConfig.label} (${recentActivity.length} recent events)`);

    const signal = await analyzeActivity(
      recentActivity,
      walletConfig.label,
      walletConfig.history,
      { MNT: 0.85, USDC: 1, WETH: 3200 },
      CONFIDENCE_FLOOR
    );

    if (!signal) continue;

    signalCount++;
    console.log(`\n🎯 SIGNAL #${signalCount}`);
    console.log(`   Type:       ${signal.type}`);
    console.log(`   Asset:      ${signal.asset}`);
    console.log(`   Confidence: ${signal.confidence}%`);
    console.log(`   Reasoning:  ${signal.reasoning}`);

    // ── 3. Record on-chain ─────────────────────────────────────────────────
    const analysisUri = buildAnalysisUri(signal);
    let   onChainId   = -1;

    if (!DRY_RUN) {
      try {
        onChainId = await recordSignalOnChain(signal, analysisUri);
        console.log(`[Contract] Signal recorded on-chain: ID #${onChainId}`);
      } catch (err) {
        console.error("[Contract] Failed to record on-chain:", err);
      }
    } else {
      console.log("[Contract] DRY RUN — skipping on-chain write");
    }

    // ── 4. Execute via Byreal ──────────────────────────────────────────────
    const execResult = DRY_RUN
      ? simulateExecution(signal, onChainId)
      : await executeSignal(signal, onChainId);

    if (execResult.filled) {
      console.log(`[Byreal] ✅ Filled: ${execResult.fillAmount} @ $${execResult.fillPrice.toFixed(4)}`);
      console.log(`[Byreal] TX: ${execResult.txHash}`);
    } else {
      console.log(`[Byreal] ❌ Fill failed: ${execResult.error}`);
    }

    // Broadcast to dashboard via SSE (write to shared state file)
    emitSignalEvent({ signal, execResult, onChainId });
  }
}

// ─── Event emission (file-based IPC for simplicity) ──────────────────────────

import * as fs from "fs";

function emitSignalEvent(payload: unknown) {
  const file = "/tmp/mantlesignal-events.jsonl";
  const line  = JSON.stringify({ ts: Date.now(), ...payload as object }) + "\n";
  fs.appendFileSync(file, line);
}

// ─── Utils ────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Entry ────────────────────────────────────────────────────────────────────

runAgent().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
