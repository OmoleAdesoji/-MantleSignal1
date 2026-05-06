// ─── On-chain ─────────────────────────────────────────────────────────────────

export type SignalType = "BUY" | "SELL" | "HOLD";

export interface OnChainSignal {
  id:            number;
  trackedWallet: string;
  signalType:    SignalType;
  confidence:    number;       // 0-100
  asset:         string;
  entryPrice:    bigint;       // scaled 1e8
  timestamp:     number;       // unix
  executed:      boolean;
  pnlBps:        number;       // basis points
  analysisUri:   string;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface WalletActivity {
  wallet:    string;
  label?:    string;           // e.g. "Nansen Smart Money #12"
  txHash:    string;
  blockNum:  number;
  timestamp: number;
  action:    "swap" | "add_liquidity" | "remove_liquidity" | "transfer" | "stake";
  tokenIn:   TokenInfo;
  tokenOut:  TokenInfo;
  valueUsd:  number;
}

export interface TokenInfo {
  address: string;
  symbol:  string;
  amount:  string;
  decimals: number;
}

export interface AISignal {
  wallet:      string;
  type:        SignalType;
  confidence:  number;
  asset:       string;
  reasoning:   string;
  entryPrice:  number;
  targetPrice?: number;
  stopLoss?:   number;
  timeframe:   string;         // e.g. "4h", "1d"
  catalysts:   string[];
}

export interface ExecutionResult {
  signalId:   number;
  txHash:     string;
  filled:     boolean;
  fillPrice:  number;
  fillAmount: string;
  error?:     string;
}

// ─── API responses ─────────────────────────────────────────────────────────────

export interface SignalsResponse {
  signals:  OnChainSignal[];
  stats: {
    total:        number;
    executed:     number;
    winRateBps:   number;
    cumPnlBps:    number;
  };
}

export interface WalletsResponse {
  wallets: TrackedWallet[];
}

export interface TrackedWallet {
  address:     string;
  label:       string;
  totalPnlUsd: number;
  winRate:     number;
  txCount:     number;
  lastActive:  number;
  tags:        string[];
  recentActivity?: WalletActivity[];
}

// ─── Byreal ───────────────────────────────────────────────────────────────────

export interface ByrealOrderParams {
  market:    string;           // e.g. "MNT-PERP"
  side:      "long" | "short";
  size:      number;           // in USD
  leverage:  number;
  slippage:  number;           // bps
}

export interface ByrealPosition {
  market:      string;
  side:        "long" | "short";
  size:        number;
  entryPrice:  number;
  unrealisedPnl: number;
  liquidationPrice: number;
}
