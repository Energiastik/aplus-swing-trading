import { NextRequest, NextResponse } from "next/server";
import { getWatchlist } from "@/lib/db";
import { fetchDailyBars } from "@/lib/marketData";
import { runAnalysisAndNotify, sendTelegramAlert } from "@/lib/watchlistActions";

// Vercel Cron job (see vercel.json -- "0 14 * * *" = 19:00 Astana, UTC+5
// year-round, no DST). Vercel calls this with GET and, when CRON_SECRET is
// set on the project, an "Authorization: Bearer <CRON_SECRET>" header --
// the standard Vercel-documented way to keep a cron route from being
// triggerable by anyone who finds the URL.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // may re-analyze several tickers sequentially, each with its own vision call

// How close current price needs to get to the stored entry/pivot level to
// count as "reached the zone" -- same 2% proximity convention already used
// throughout this codebase for confluence checks (lib/technicals.ts).
const ZONE_TOLERANCE_PCT = 2.0;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_CHAT_ID;
  const watchlist = await getWatchlist();
  const checked: string[] = [];
  const triggered: string[] = [];
  const failed: string[] = [];

  for (const row of watchlist) {
    if (row.entry == null) continue;
    let currentPrice: number | null = null;
    try {
      const bars = await fetchDailyBars(row.ticker, "5d");
      currentPrice = bars.length > 0 ? bars[bars.length - 1].close : null;
    } catch {
      continue;
    }
    if (currentPrice == null) continue;
    checked.push(row.ticker);

    const distPct = (Math.abs(currentPrice - row.entry) / row.entry) * 100;
    if (distPct > ZONE_TOLERANCE_PCT) continue;

    // Reached the watch zone -- a quick heads-up, then a full fresh
    // re-analysis (new chart render, new vision call, updated confluence/
    // A+/verdict) via the same shared path /add uses. runAnalysisAndNotify
    // saves the new check and sends the full verdict card itself.
    try {
      if (chatId) {
        await sendTelegramAlert(
          chatId,
          `🎯 *${row.ticker}* достиг зоны ожидания (~$${currentPrice.toFixed(2)}) — перепроверяю...`
        );
      }
      await runAnalysisAndNotify(row.ticker, process.env.MARKETDATA_API_TOKEN || null, "cron");
      triggered.push(row.ticker);
    } catch (e) {
      console.error(`recheck(${row.ticker}) failed: ${e instanceof Error ? e.message : e}`);
      failed.push(row.ticker);
    }
  }

  return NextResponse.json({ ok: true, watchlist_size: watchlist.length, checked, triggered, failed });
}
