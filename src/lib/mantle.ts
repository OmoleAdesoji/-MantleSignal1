import { ethers } from "ethers";
import type { WalletActivity, TokenInfo } from "../types";

// ─── Provider ─────────────────────────────────────────────────────────────────

export function getMantleProvider(): ethers.JsonRpcProvider {
  const rpc = process.env.MANTLE_RPC_URL || "https://rpc.mantle.xyz";
  return new ethers.JsonRpcProvider(rpc, {
    name:    "mantle",
    chainId: 5000,
  });
}

// ─── ERC-20 helpers ───────────────────────────────────────────────────────────

const ERC20_ABI = [
  "function symbol()   external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function name()     external view returns (string)",
];

const tokenCache = new Map<string, { symbol: string; decimals: number }>();

export async function getTokenInfo(
  address: string,
  provider: ethers.JsonRpcProvider
): Promise<{ symbol: string; decimals: number }> {
  const key = address.toLowerCase();
  if (tokenCache.has(key)) return tokenCache.get(key)!;

  // Known tokens on Mantle — avoid RPC calls for common ones
  const known: Record<string, { symbol: string; decimals: number }> = {
    "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8": { symbol: "MNT",   decimals: 18 },
    "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9": { symbol: "USDC",  decimals: 6  },
    "0x201eba5cc46d216ce6dc03f6a759e8e766e956ae": { symbol: "USDT",  decimals: 6  },
    "0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111": { symbol: "WETH",  decimals: 18 },
    "0xcda86a272531e8640cd7f1a92c01839911b90bb0": { symbol: "mETH",  decimals: 18 },
  };

  if (known[key]) {
    tokenCache.set(key, known[key]);
    return known[key];
  }

  try {
    const contract = new ethers.Contract(address, ERC20_ABI, provider);
    const [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);
    const info = { symbol: symbol as string, decimals: Number(decimals) };
    tokenCache.set(key, info);
    return info;
  } catch {
    return { symbol: address.slice(0, 6), decimals: 18 };
  }
}

// ─── Transfer event parsing ───────────────────────────────────────────────────

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const SWAP_TOPIC     = ethers.id("Swap(address,address,int256,int256,uint160,uint128,int24)");

/**
 * Scan recent blocks for activity from tracked wallets.
 * Returns an array of WalletActivity events (newest first).
 */
export async function scanWalletActivity(
  wallets:   string[],
  fromBlock: number,
  toBlock:   number,
  provider:  ethers.JsonRpcProvider
): Promise<WalletActivity[]> {
  const walletSet = new Set(wallets.map(w => w.toLowerCase()));
  const activities: WalletActivity[] = [];

  // Pull transfer events where `from` is a tracked wallet
  const filter = {
    fromBlock,
    toBlock,
    topics: [TRANSFER_TOPIC],
  };

  const logs = await provider.getLogs(filter);

  for (const log of logs) {
    const from = "0x" + log.topics[1]?.slice(26);
    const to   = "0x" + log.topics[2]?.slice(26);

    if (!walletSet.has(from.toLowerCase())) continue;

    const tokenInfo = await getTokenInfo(log.address, provider);
    const amount    = ethers.formatUnits(log.data, tokenInfo.decimals);

    const activity: WalletActivity = {
      wallet:    from,
      txHash:    log.transactionHash,
      blockNum:  log.blockNumber,
      timestamp: Math.floor(Date.now() / 1000), // refined below
      action:    "transfer",
      tokenIn:   { address: log.address, symbol: tokenInfo.symbol, amount, decimals: tokenInfo.decimals },
      tokenOut:  { address: to, symbol: "?", amount: "0", decimals: 0 },
      valueUsd:  estimateUsd(amount, tokenInfo.symbol),
    };

    activities.push(activity);
  }

  // Enrich timestamps from blocks (batched to avoid rate limits)
  const blockNums = [...new Set(activities.map(a => a.blockNum))];
  const blockMap  = new Map<number, number>();
  await Promise.all(
    blockNums.map(async (n) => {
      const block = await provider.getBlock(n);
      if (block) blockMap.set(n, block.timestamp);
    })
  );
  for (const a of activities) {
    a.timestamp = blockMap.get(a.blockNum) ?? a.timestamp;
  }

  return activities.sort((a, b) => b.timestamp - a.timestamp);
}

// ─── Simple USD estimator ─────────────────────────────────────────────────────

function estimateUsd(amount: string, symbol: string): number {
  const prices: Record<string, number> = {
    MNT: 0.85, USDC: 1, USDT: 1, WETH: 3200, mETH: 3300,
  };
  return parseFloat(amount) * (prices[symbol] ?? 0);
}

// ─── Latest block ─────────────────────────────────────────────────────────────

export async function getLatestBlock(provider: ethers.JsonRpcProvider): Promise<number> {
  return provider.getBlockNumber();
}
