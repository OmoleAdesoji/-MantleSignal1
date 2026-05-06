"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SignalType = "BUY" | "SELL" | "HOLD";

interface Signal {
  id:           number;
  wallet:       string;
  walletLabel:  string;
  type:         SignalType;
  confidence:   number;
  asset:        string;
  entryPrice:   number;
  targetPrice?: number;
  reasoning:    string;
  timestamp:    number;
  executed:     boolean;
  txHash?:      string;
  pnlBps:       number;
  catalysts:    string[];
}

interface WalletRow {
  address:    string;
  label:      string;
  pnl:        number;
  winRate:    number;
  trades:     number;
  lastAction: string;
  lastAsset:  string;
  lastValue:  number;
  active:     boolean;
}

interface Stats {
  totalPnlUsd:  number;
  winRatePct:   number;
  activeSignals:number;
  walletsTracked:number;
  signalsToday: number;
  avgConfidence:number;
}

// ─── Mock data generator ──────────────────────────────────────────────────────

const ASSETS  = ["MNT/USDC", "mETH/USDC", "WETH/USDT", "MNT/WETH"];
const WALLETS = [
  { address: "0x3Fa4...d72C", label: "Mantle Whale #1"   },
  { address: "0x8Bc2...a19E", label: "Smart Money #2"   },
  { address: "0x1Da9...f33A", label: "Protocol Insider" },
  { address: "0x6Fe0...228B", label: "Nansen Alpha"     },
];
const REASONINGS = [
  "Wallet accumulated 2.4M MNT in 3 transactions over 18 minutes — largest position in 30 days. Correlated with 2 other tracked wallets making similar moves.",
  "Removed $840K from Fusion X LP and immediately routed into mETH. Historical pattern matches 4 previous pre-pump moves. 78% hit rate on this wallet.",
  "Rapid swap sequence suggests insider knowledge of upcoming protocol upgrade. Volume 6.2σ above 30-day average for this wallet.",
  "Smart money entering MNT/WETH at key support zone. On-chain options flow also showing unusual call buying. Timeframe: 4–8 hours.",
];

function makeSignal(id: number): Signal {
  const w    = WALLETS[id % WALLETS.length];
  const type = (["BUY","BUY","BUY","SELL"] as SignalType[])[Math.floor(Math.random()*4)];
  return {
    id,
    wallet:      w.address,
    walletLabel: w.label,
    type,
    confidence:  65 + Math.floor(Math.random() * 30),
    asset:       ASSETS[Math.floor(Math.random()*ASSETS.length)],
    entryPrice:  0.82 + Math.random() * 0.08,
    targetPrice: 0.94 + Math.random() * 0.12,
    reasoning:   REASONINGS[Math.floor(Math.random()*REASONINGS.length)],
    timestamp:   Date.now() - Math.floor(Math.random() * 3600000),
    executed:    id < 4,
    txHash:      id < 4 ? "0x" + Math.random().toString(16).slice(2).padEnd(64,"a") : undefined,
    pnlBps:      id < 4 ? Math.floor((Math.random()-0.25) * 800) : 0,
    catalysts:   ["Smart money accumulation","Cross-wallet correlation","Volume anomaly"],
  };
}

function makeWallets(): WalletRow[] {
  return WALLETS.map((w, i) => ({
    address:    w.address,
    label:      w.label,
    pnl:        (Math.random()-0.2) * 40000,
    winRate:    58 + Math.random()*25,
    trades:     20 + Math.floor(Math.random()*80),
    lastAction: ["Swap","Add LP","Remove LP","Transfer"][Math.floor(Math.random()*4)],
    lastAsset:  ASSETS[i % ASSETS.length],
    lastValue:  5000 + Math.random()*100000,
    active:     Math.random()>0.4,
  }));
}

function makeStats(): Stats {
  return {
    totalPnlUsd:   12840,
    winRatePct:    68.4,
    activeSignals: 3,
    walletsTracked:4,
    signalsToday:  9,
    avgConfidence: 77,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Pip({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${
      active ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-zinc-600"
    }`} />
  );
}

function Badge({ type }: { type: SignalType }) {
  const cfg = {
    BUY:  "bg-emerald-950 text-emerald-400 border-emerald-800",
    SELL: "bg-red-950 text-red-400 border-red-800",
    HOLD: "bg-amber-950 text-amber-400 border-amber-800",
  }[type];
  return (
    <span className={`text-[10px] font-mono font-bold tracking-widest px-2 py-0.5 rounded border ${cfg}`}>
      {type}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 85 ? "#34d399" : value >= 70 ? "#f59e0b" : "#f87171";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color, boxShadow: `0 0 8px ${color}40` }}
        />
      </div>
      <span className="text-[11px] font-mono" style={{ color }}>{value}%</span>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-1">
      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">{label}</span>
      <span
        className="text-2xl font-mono font-bold"
        style={{ color: accent || "#e4e4e7" }}
      >{value}</span>
      {sub && <span className="text-[11px] text-zinc-600 font-mono">{sub}</span>}
    </div>
  );
}

function SignalCard({ signal, onExpand }: { signal: Signal; onExpand: () => void }) {
  const age = Math.floor((Date.now() - signal.timestamp) / 60000);
  const pnlColor = signal.pnlBps > 0 ? "#34d399" : signal.pnlBps < 0 ? "#f87171" : "#71717a";

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg p-4 cursor-pointer transition-all duration-200"
      onClick={onExpand}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge type={signal.type} />
          <span className="text-sm font-mono text-zinc-200">{signal.asset}</span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">{age}m ago</span>
      </div>

      <ConfidenceBar value={signal.confidence} />

      <p className="text-[11px] text-zinc-400 mt-3 leading-relaxed line-clamp-2">
        {signal.reasoning}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-zinc-600 font-mono">{signal.walletLabel}</span>
        <div className="flex items-center gap-3">
          {signal.executed && (
            <span className="text-[10px] font-mono font-bold" style={{ color: pnlColor }}>
              {signal.pnlBps > 0 ? "+" : ""}{(signal.pnlBps / 100).toFixed(2)}%
            </span>
          )}
          {signal.executed
            ? <span className="text-[10px] text-emerald-500 font-mono">● EXECUTED</span>
            : <span className="text-[10px] text-amber-500 font-mono">● PENDING</span>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [signals,  setSignals]  = useState<Signal[]>([]);
  const [wallets,  setWallets]  = useState<WalletRow[]>([]);
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [expanded, setExpanded] = useState<Signal | null>(null);
  const [tab,      setTab]      = useState<"signals"|"wallets"|"history">("signals");
  const [ticker,   setTicker]   = useState(0);
  const [newSignal,setNewSignal]= useState(false);
  const [brief,    setBrief]    = useState("Scanning Mantle Network for smart money activity...");

  // Seed initial data
  useEffect(() => {
    const s = Array.from({ length: 7 }, (_, i) => makeSignal(i));
    setSignals(s);
    setWallets(makeWallets());
    setStats(makeStats());
    setTimeout(() => setBrief(
      "Whale #1 accumulated 2.4M MNT in a 3-transaction sequence — largest position in 30 days. " +
      "Protocol Insider removed $840K from Fusion X LP, routing to mETH ahead of suspected upgrade. " +
      "Cross-wallet correlation detected on MNT/USDC with 77% aggregate confidence."
    ), 1500);
  }, []);

  // Simulate live signal arrival
  useEffect(() => {
    const interval = setInterval(() => {
      setTicker(t => t + 1);
      if (Math.random() > 0.7) {
        setSignals(prev => [makeSignal(prev.length), ...prev].slice(0, 20));
        setNewSignal(true);
        setTimeout(() => setNewSignal(false), 2000);
      }
      // Pulse active status on wallets
      setWallets(prev => prev.map(w => ({ ...w, active: Math.random() > 0.5 })));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const pending  = signals.filter(s => !s.executed);
  const history  = signals.filter(s =>  s.executed);
  const winCount = history.filter(s => s.pnlBps > 0).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-mono">
      {/* ── Header ── */}
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-base font-bold tracking-tight text-white">
              MANTLE<span className="text-emerald-400">SIGNAL</span>
            </span>
            <span className="ml-3 text-[10px] text-zinc-600 uppercase tracking-widest">
              AI Smart Money Intelligence
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-[11px] text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Pip active={true} />
            <span>Agent running</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Pip active={true} />
            <span>Mantle RPC</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Pip active={true} />
            <span>Byreal connected</span>
          </div>
          <span className="text-zinc-700">|</span>
          <span>Block #{(19_800_000 + ticker).toLocaleString()}</span>
        </div>
      </header>

      {/* ── Intel Brief ── */}
      <div className="border-b border-zinc-800/50 bg-zinc-900/40 px-6 py-2.5">
        <div className="flex items-start gap-3">
          <span className="text-[10px] text-emerald-500 uppercase tracking-widest mt-0.5 shrink-0">
            AI Brief
          </span>
          <p className="text-[11px] text-zinc-400 leading-relaxed">{brief}</p>
        </div>
      </div>

      {/* ── Stats bar ── */}
      {stats && (
        <div className="grid grid-cols-6 gap-3 p-4 border-b border-zinc-800">
          <StatCard
            label="Total P&L"
            value={`+$${stats.totalPnlUsd.toLocaleString()}`}
            sub="since deployment"
            accent="#34d399"
          />
          <StatCard
            label="Win Rate"
            value={`${stats.winRatePct.toFixed(1)}%`}
            sub={`${winCount}/${history.length} trades`}
            accent="#34d399"
          />
          <StatCard
            label="Active Signals"
            value={`${pending.length}`}
            sub="pending execution"
            accent="#f59e0b"
          />
          <StatCard
            label="Wallets Tracked"
            value={`${wallets.length}`}
            sub="smart money"
          />
          <StatCard
            label="Signals Today"
            value={`${stats.signalsToday}`}
            sub={`+${signals.length - stats.signalsToday} all-time`}
          />
          <StatCard
            label="Avg Confidence"
            value={`${stats.avgConfidence}%`}
            sub="above 65% floor"
            accent="#e4e4e7"
          />
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-12 gap-0 flex-1" style={{ minHeight: "calc(100vh - 240px)" }}>

        {/* ── Left: Wallet tracker ── */}
        <div className="col-span-3 border-r border-zinc-800 overflow-y-auto">
          <div className="px-4 py-3 border-b border-zinc-800">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Smart Money Wallets
            </span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {wallets.map(w => (
              <div key={w.address} className="px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center">
                    <Pip active={w.active} />
                    <span className="text-[11px] text-zinc-200 font-medium">{w.label}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${w.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {w.pnl >= 0 ? "+" : ""}${Math.abs(w.pnl / 1000).toFixed(1)}K
                  </span>
                </div>
                <div className="text-[10px] text-zinc-600 mb-1.5">{w.address}</div>
                <div className="flex gap-3 text-[10px] text-zinc-500">
                  <span>WR: <span className="text-zinc-400">{w.winRate.toFixed(0)}%</span></span>
                  <span>Trades: <span className="text-zinc-400">{w.trades}</span></span>
                </div>
                {w.active && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-500/80">
                    <span className="inline-block w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                    {w.lastAction} {w.lastAsset} · ${(w.lastValue/1000).toFixed(0)}K
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: Signal feed ── */}
        <div className="col-span-6 border-r border-zinc-800 flex flex-col">
          <div className="flex items-center border-b border-zinc-800 px-4">
            {(["signals","wallets","history"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[10px] uppercase tracking-widest py-3 px-4 border-b-2 transition-colors ${
                  tab === t
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {t === "signals" ? `Signals (${pending.length})` : t === "history" ? `History (${history.length})` : "Wallets"}
              </button>
            ))}
            {newSignal && (
              <span className="ml-auto text-[10px] text-emerald-400 animate-pulse">
                ● New signal detected
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {tab === "signals" && (pending.length === 0
              ? <p className="text-zinc-600 text-[12px] text-center pt-8">No active signals. Agent scanning...</p>
              : pending.map(s => (
                  <SignalCard key={s.id} signal={s} onExpand={() => setExpanded(s)} />
                ))
            )}
            {tab === "history" && history.map(s => (
              <SignalCard key={s.id} signal={s} onExpand={() => setExpanded(s)} />
            ))}
            {tab === "wallets" && wallets.map(w => (
              <div key={w.address} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-zinc-200 font-medium">{w.label}</span>
                  <span className={`text-sm font-bold ${w.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {w.pnl >= 0 ? "+" : ""}${Math.abs(w.pnl).toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-600 mb-3">{w.address}</div>
                <ConfidenceBar value={w.winRate} />
                <div className="mt-2 text-[10px] text-zinc-500">{w.trades} tracked trades</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Detail / execution log ── */}
        <div className="col-span-3 flex flex-col">
          <div className="px-4 py-3 border-b border-zinc-800">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              {expanded ? "Signal Detail" : "Execution Log"}
            </span>
          </div>

          {expanded ? (
            <div className="flex-1 overflow-y-auto p-4">
              <button
                className="text-[10px] text-zinc-600 hover:text-zinc-400 mb-4"
                onClick={() => setExpanded(null)}
              >← Back to log</button>

              <Badge type={expanded.type} />
              <div className="mt-3 text-lg text-white font-bold">{expanded.asset}</div>
              <div className="text-[11px] text-zinc-500 mb-4">
                {expanded.walletLabel} · {new Date(expanded.timestamp).toLocaleTimeString()}
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-600">Entry price</span>
                  <span className="text-zinc-300">${expanded.entryPrice.toFixed(4)}</span>
                </div>
                {expanded.targetPrice && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-600">Target</span>
                    <span className="text-emerald-400">${expanded.targetPrice.toFixed(4)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-600">Confidence</span>
                  <span className="text-zinc-300">{expanded.confidence}%</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-600">Status</span>
                  <span className={expanded.executed ? "text-emerald-400" : "text-amber-400"}>
                    {expanded.executed ? "Executed" : "Pending"}
                  </span>
                </div>
              </div>

              <ConfidenceBar value={expanded.confidence} />

              <div className="mt-4 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-600 mb-1.5">AI Reasoning</div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">{expanded.reasoning}</p>
              </div>

              <div className="mt-3">
                <div className="text-[10px] text-zinc-600 mb-2">Catalysts</div>
                {expanded.catalysts.map((c, i) => (
                  <div key={i} className="text-[10px] text-zinc-400 flex items-center gap-2 mb-1">
                    <span className="text-emerald-600">▸</span> {c}
                  </div>
                ))}
              </div>

              {expanded.txHash && (
                <div className="mt-4">
                  <div className="text-[10px] text-zinc-600 mb-1.5">On-chain proof</div>
                  <a
                    href={`https://explorer.mantle.xyz/tx/${expanded.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-emerald-500 hover:text-emerald-400 break-all"
                  >
                    {expanded.txHash.slice(0, 20)}...{expanded.txHash.slice(-8)} ↗
                  </a>
                </div>
              )}

              {expanded.executed && (
                <div className="mt-4 p-3 bg-zinc-900 rounded-lg border border-zinc-800 flex justify-between">
                  <span className="text-[11px] text-zinc-600">Realised P&L</span>
                  <span className={`text-[13px] font-bold ${expanded.pnlBps > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {expanded.pnlBps > 0 ? "+" : ""}{(expanded.pnlBps / 100).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
              {signals.filter(s => s.executed).slice(0, 12).map(s => (
                <div
                  key={s.id}
                  className="px-4 py-3 hover:bg-zinc-900/40 cursor-pointer transition-colors"
                  onClick={() => setExpanded(s)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge type={s.type} />
                      <span className="text-[11px] text-zinc-300">{s.asset}</span>
                    </div>
                    <span className={`text-[10px] font-bold ${s.pnlBps > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {s.pnlBps > 0 ? "+" : ""}{(s.pnlBps / 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-600">
                    <span>{s.walletLabel}</span>
                    <span>{new Date(s.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contract footer */}
          <div className="border-t border-zinc-800 px-4 py-2">
            <div className="text-[9px] text-zinc-700">
              Contract · <span className="text-zinc-600">{process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xDeploy..."}</span>
            </div>
            <div className="text-[9px] text-zinc-700">
              <a href={`https://explorer.mantle.xyz`} target="_blank" rel="noreferrer"
                className="hover:text-zinc-500">Mantle Explorer ↗</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
