import { NextRequest, NextResponse } from "next/server";
import { runAnalysisAndNotify } from "@/lib/watchlistActions";

// No PUBLIC_PATHS entry needed -- proxy.ts's default session gate already
// protects this (unlike /api/telegram-webhook, which has to be public
// because Telegram calls it directly with no browser session). Only a
// logged-in dashboard user can reach this route.
export const dynamic = "force-dynamic";
export const maxDuration = 60; // same real analysis as the Telegram path -- data + regime + sector + vision call

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawTicker = typeof body?.ticker === "string" ? body.ticker.trim() : "";
  if (!/^[A-Za-z.\-^]{1,10}$/.test(rawTicker)) {
    return NextResponse.json({ error: "invalid_ticker" }, { status: 400 });
  }
  const ticker = rawTicker.toUpperCase();

  try {
    const verdict = await runAnalysisAndNotify(ticker, process.env.MARKETDATA_API_TOKEN || null, "web");
    return NextResponse.json({ ok: true, verdict });
  } catch (e) {
    return NextResponse.json(
      { error: "analysis_failed", message: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
