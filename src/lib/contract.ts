import { ethers } from "ethers";
import type { OnChainSignal, AISignal } from "../types";

// ─── ABI (minimal) ────────────────────────────────────────────────────────────

const ABI = [
  "function recordSignal(address,string,uint8,string,uint256,string) external returns (uint256)",
  "function closeSignal(uint256,int256) external",
  "function getSignal(uint256) external view returns (tuple(uint256,address,string,uint8,string,uint256,uint256,bool,int256,string))",
  "function getSignalCount() external view returns (uint256)",
  "function getRecentSignals(uint256) external view returns (tuple(uint256,address,string,uint8,string,uint256,uint256,bool,int256,string)[])",
  "function getStats() external view returns (uint256,uint256,int256,uint256)",
  "event SignalRecorded(uint256 indexed,address indexed,string,uint8,string)",
  "event SignalExecuted(uint256 indexed,int256)",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(
    process.env.MANTLE_RPC_URL || "https://rpc.mantle.xyz",
    { name: "mantle", chainId: 5000 }
  );
}

function getSigner(): ethers.Wallet {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) throw new Error("AGENT_PRIVATE_KEY not set");
  return new ethers.Wallet(pk, getProvider());
}

function getContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  const addr = process.env.CONTRACT_ADDRESS;
  if (!addr) throw new Error("CONTRACT_ADDRESS not set");
  return new ethers.Contract(addr, ABI, signerOrProvider);
}

// ─── Row decoder ─────────────────────────────────────────────────────────────

function decodeSignal(row: ethers.Result): OnChainSignal {
  return {
    id:            Number(row[0]),
    trackedWallet: row[1],
    signalType:    row[2] as "BUY" | "SELL" | "HOLD",
    confidence:    Number(row[3]),
    asset:         row[4],
    entryPrice:    row[5],
    timestamp:     Number(row[6]),
    executed:      row[7],
    pnlBps:        Number(row[8]),
    analysisUri:   row[9],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write an AI signal to the Mantle smart contract.
 * Returns the on-chain signal ID.
 */
export async function recordSignalOnChain(
  signal:      AISignal,
  analysisUri: string
): Promise<number> {
  const contract = getContract(getSigner());

  const entryPriceScaled = BigInt(Math.round(signal.entryPrice * 1e8));

  const tx = await contract.recordSignal(
    signal.wallet,
    signal.type,
    signal.confidence,
    signal.asset,
    entryPriceScaled,
    analysisUri,
    { gasLimit: 300_000 }
  );

  console.log(`[Contract] recordSignal tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[Contract] Confirmed in block ${receipt.blockNumber}`);

  // Parse the SignalRecorded event to get the ID
  const iface = new ethers.Interface(ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "SignalRecorded") {
        return Number(parsed.args[0]);
      }
    } catch { /* skip */ }
  }

  // Fallback: count - 1
  const count = await contract.getSignalCount();
  return Number(count) - 1;
}

/**
 * Close a signal on-chain with its realised P&L (in basis points).
 */
export async function closeSignalOnChain(id: number, pnlBps: number): Promise<void> {
  const contract = getContract(getSigner());
  const tx = await contract.closeSignal(id, BigInt(pnlBps), { gasLimit: 150_000 });
  await tx.wait();
  console.log(`[Contract] Signal #${id} closed with ${pnlBps}bps P&L`);
}

/**
 * Read recent signals from the contract (read-only, no private key needed).
 */
export async function fetchRecentSignals(n = 20): Promise<OnChainSignal[]> {
  const contract = getContract(getProvider());
  const rows = await contract.getRecentSignals(n);
  return (rows as ethers.Result[]).map(decodeSignal);
}

/**
 * Read aggregate stats from the contract.
 */
export async function fetchStats(): Promise<{
  total: number;
  executed: number;
  cumPnlBps: number;
  winRateBps: number;
}> {
  const contract = getContract(getProvider());
  const [total, executed, cumPnlBps, winRateBps] = await contract.getStats();
  return {
    total:      Number(total),
    executed:   Number(executed),
    cumPnlBps:  Number(cumPnlBps),
    winRateBps: Number(winRateBps),
  };
}
