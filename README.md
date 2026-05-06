# MantleSignal 🔍

**AI-powered smart money intelligence and autonomous trading agent on Mantle Network.**

MantleSignal tracks whale wallets on Mantle in real time, runs their activity through Claude AI to generate high-confidence trading signals, executes trades autonomously via Byreal Perps, and writes every signal + result on-chain — creating a fully verifiable, trustless alpha track record.

> Built for The Turing Test Hackathon 2026 · Mantle Network · Mirana Ventures Alpha Data Track

---

## Architecture

```
Mantle RPC                Claude API              Byreal Perps CLI
    │                         │                         │
    ▼                         ▼                         ▼
Wallet Indexer  ──────►  AI Analyzer  ──────►  Trade Executor
(ethers.js)        activity    signal            order fill
                   events      JSON
                                │
                                ▼
                    MantleSignalRegistry.sol
                    (on-chain verifiable record)
                                │
                                ▼
                      Next.js Dashboard
                    (real-time signal feed)
```

### Core components

| Component | File | Role |
|---|---|---|
| Smart Contract | `contracts/MantleSignalRegistry.sol` | Immutable on-chain signal registry |
| Wallet Indexer | `src/lib/mantle.ts` | Scans Mantle blocks for smart money activity |
| AI Analyzer | `src/lib/claude.ts` | Claude claude-sonnet-4-20250514 signal generation |
| Trade Executor | `src/lib/byreal.ts` | Byreal Perps CLI integration |
| Contract Layer | `src/lib/contract.ts` | Read/write signals on-chain |
| Agent Loop | `agent/index.ts` | Orchestrates the full pipeline |
| Dashboard | `src/app/page.tsx` | Real-time signal feed + execution log |

---

## Hackathon Track Alignment

### Alpha Data Track (Mirana Ventures)
- **Path B: AI-Driven Trading Strategy**
- Data source: Mantle on-chain activity (transfers, swaps, LP events)
- AI role: Claude analyzes wallet patterns and generates structured signals with confidence scores
- Verifiable alpha: Every signal and its outcome is written to `MantleSignalRegistry.sol` — readable by anyone on-chain

### Agentic Economy Track (Byreal)
- **Path A: DeFi Deep Dive**
- Uses Byreal Perps CLI for autonomous perpetuals execution
- Agent runs fully autonomously: scan → analyze → signal → execute → record

### Grand Champion criteria
| Dimension | MantleSignal approach |
|---|---|
| Technical Depth (30%) | Full AI×on-chain integration: Claude API + ethers.js + Solidity + Byreal CLI |
| Innovation (25%) | End-to-end autonomous signal→execution→verification loop is novel |
| Mantle Ecosystem (25%) | Deep Mantle data usage, mainnet deployed contract, Byreal on Mantle |
| Product Completeness (20%) | Live dashboard, runnable demo, documented API |

---

## Setup

### Prerequisites
- Node.js 18+
- npm / pnpm
- Mantle wallet with MNT for gas
- Byreal CLI installed (`npm install -g byreal-perps-cli`)

### 1. Install
```bash
git clone https://github.com/your-username/mantlesignal
cd mantlesignal
npm install
```

### 2. Configure
```bash
cp .env.example .env.local
# Edit .env.local with your keys
```

Required env vars:
```
ANTHROPIC_API_KEY=sk-ant-...
MANTLE_RPC_URL=https://rpc.mantle.xyz
DEPLOYER_PRIVATE_KEY=0x...
AGENT_PRIVATE_KEY=0x...
```

### 3. Deploy the contract
```bash
# Testnet first (recommended)
npm run deploy:testnet

# Copy the deployed address to .env.local:
# CONTRACT_ADDRESS=0x...
# NEXT_PUBLIC_CONTRACT_ADDRESS=0x...

# Mainnet when ready
npm run deploy:mainnet
```

The deploy script automatically:
- Deploys `MantleSignalRegistry.sol` to Mantle
- Verifies the contract on Mantle Explorer
- Saves the address to `deployments/{network}.json`

### 4. Set tracked wallets
Add Nansen Smart Money wallet addresses to `.env.local`:
```
WALLET_1=0x...  # e.g. from https://nansen.ai/query
WALLET_2=0x...
WALLET_3=0x...
```

### 5. Run the agent
```bash
# Dry run (no real trades, safe for testing)
npm run agent:dry

# Live mode (real Byreal execution)
DRY_RUN=false npm run agent
```

### 6. Run the dashboard
```bash
npm run dev
# Open http://localhost:3000
```

---

## Smart Contract

**`MantleSignalRegistry.sol`** — deployed on Mantle Network

```solidity
// Key functions:
function recordSignal(address wallet, string type, uint8 confidence, 
                      string asset, uint256 entryPrice, string analysisUri)
    external returns (uint256 signalId);

function closeSignal(uint256 id, int256 pnlBps) external;

function getRecentSignals(uint256 n) external view returns (Signal[] memory);

function getStats() external view returns (
    uint256 total, uint256 executed, int256 cumPnlBps, uint256 winRate
);
```

Every signal includes an `analysisUri` (IPFS or data URI) containing the full Claude reasoning — the complete AI decision is permanently anchored on-chain.

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/signals` | GET | Read signals from contract |
| `/api/agent` | POST | Trigger one analysis cycle |

---

## Signal Flow

```
1. Indexer polls Mantle RPC every 60s
2. Finds transfer/swap events from tracked wallets
3. Claude analyzes activity vs. wallet history
4. If confidence ≥ 65%:
   a. Signal JSON generated
   b. recordSignal() called on Mantle contract → signalId returned
   c. Byreal Perps CLI executes the trade
   d. Fill confirmed → closeSignal() called with realised PnL
5. Dashboard reflects new signal in real time
```

---

## Verifiable Alpha

The core innovation: **every signal outcome is immutably recorded on-chain**.

Anyone can call `getStats()` on `MantleSignalRegistry.sol` to verify:
- Total signals generated
- Win rate (basis points)
- Cumulative P&L (basis points)
- Full signal history with entry prices and outcomes

This makes MantleSignal's track record trustless and auditable — unlike any off-chain trading journal.

---

## Deployment

| Network | Contract Address | Explorer |
|---|---|---|
| Mantle Testnet | `TBD after deploy` | [Sepolia Explorer](https://explorer.sepolia.mantle.xyz) |
| Mantle Mainnet | `TBD` | [Mantle Explorer](https://explorer.mantle.xyz) |

---

## License
MIT
