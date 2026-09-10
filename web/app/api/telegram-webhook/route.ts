import { NextRequest, NextResponse } from "next/server";
import { runAnalysisAndNotify, sendTelegramAlert } from "@/lib/watchlistActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the real analysis (data + regime + sector + vision call) needs headroom

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // Telegram doesn't care about malformed bodies, don't retry-loop it
  }

  const msg = update?.message;
  const chatId: string | undefined = msg?.chat?.id?.toString();
  const text: string = (msg?.text ?? "").trim();
  const allowedChat = process.env.TELEGRAM_CHAT_ID;

  if (!chatId || !allowedChat || chatId !== allowedChat) {
    return NextResponse.json({ ok: true }); // ignore anyone who isn't the owner, ack anyway so Telegram stops retrying
  }

  const addMatch = text.match(/^\/add\s+([A-Za-z.\-^]{1,10})\b/i);
  if (!addMatch) {
    if (text.startsWith("/")) {
      await sendTelegramAlert(chatId, "Commands:\n/add <TICKER> -- run a swing-trade check and save it to your watchlist");
    }
    return NextResponse.json({ ok: true });
  }

  const ticker = addMatch[1].toUpperCase();
  await sendTelegramAlert(chatId, `🔍 Checking ${ticker}...`);

  try {
    await runAnalysisAndNotify(ticker, process.env.MARKETDATA_API_TOKEN || null, "telegram");
  } catch (e) {
    await sendTelegramAlert(chatId, `❌ ${ticker}: check failed -- ${e instanceof Error ? e.message : "unknown error"}`);
  }

  return NextResponse.json({ ok: true });
}
