import { NextResponse } from "next/server";
import { fetchRecentSignals, fetchStats } from "@/lib/contract";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "20");

  try {
    const [signals, stats] = await Promise.all([
      fetchRecentSignals(limit),
      fetchStats(),
    ]);

    return NextResponse.json({
      signals,
      stats: {
        total:       stats.total,
        executed:    stats.executed,
        winRateBps:  stats.winRateBps,
        cumPnlBps:   stats.cumPnlBps,
      },
    });
  } catch (err: any) {
    console.error("[API /signals]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
