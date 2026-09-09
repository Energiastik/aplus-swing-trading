import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { analyzeTicker, type Verdict } from "@/lib/analyzeTicker";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the real analysis (data + regime + sector + vision call) needs headroom

declare global {
  // eslint-disable-next-line no-var
  var _watchlistPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global._watchlistPool) {
    global._watchlistPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return global._watchlistPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    verdict TEXT,
    reason TEXT,
    conviction TEXT,
    rr_band TEXT,
    trigger_type TEXT,
    aplus_score INT,
    regime_score INT,
    regime_mode TEXT,
    sector TEXT,
    price REAL,
    entry REAL,
    stop REAL,
    target REAL,
    rr REAL,
    confluence_count INT,
    chart_grade TEXT,
    earnings_trading_days REAL,
    checked_at TIMESTAMPTZ DEFAULT now(),
    raw JSONB
);
CREATE INDEX IF NOT EXISTS idx_watchlist_chat ON watchlist(chat_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_ticker ON watchlist(ticker);
`;

let schemaReady = false;

async function saveVerdict(chatId: string, v: Verdict) {
  const pool = getPool();
  if (!schemaReady) {
    await pool.query(SCHEMA);
    schemaReady = true;
  }
  await pool.query(
    `INSERT INTO watchlist (chat_id, ticker, verdict, reason, conviction, rr_band, trigger_type,
                             aplus_score, regime_score, regime_mode, sector, price, entry, stop,
                             target, rr, confluence_count, chart_grade, earnings_trading_days, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      chatId, v.ticker, v.verdict, v.reason, v.conviction, v.rr_band, v.trigger,
      v.aplus_score, v.regime_score, v.regime_mode, v.sector, v.price, v.entry, v.stop,
      v.target, v.rr, v.confluence_count, v.chart_grade, v.earnings_trading_days,
      JSON.stringify(v),
    ]
  );
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

const VERDICT_EMOJI: Record<string, string> = { BUY: "🟢", WAIT: "🟡", PASS: "🔴" };

function formatVerdict(v: Verdict): string {
  const emoji = VERDICT_EMOJI[v.verdict] ?? "";
  const lines = [`${emoji} *${v.ticker}* — *${v.verdict}*`, v.reason];

  if (v.price != null) lines.push(`\nPrice: $${v.price.toFixed(2)}`);
  if (v.entry != null) lines.push(`Entry: $${v.entry.toFixed(2)}${v.used_fallback_levels ? " (formula fallback, not the model's own plan)" : ""}`);
  if (v.stop != null) lines.push(`Stop: $${v.stop.toFixed(2)}`);
  if (v.target != null) lines.push(`Target: $${v.target.toFixed(2)}`);
  if (v.rr != null) lines.push(`R/R: ${v.rr.toFixed(2)}${v.rr_band ? ` (${v.rr_band})` : ""}`);
  if (v.verdict !== "PASS") {
    lines.push(`A+ score: ${v.aplus_score}/9`);
    if (v.confluence_signals.length) lines.push(`Confluence: ${v.confluence_signals.join(", ")}`);
    if (v.conviction) lines.push(`Conviction: ${v.conviction}`);
  }
  lines.push(`\nRegime: ${v.regime_mode} (${v.regime_score}/4)`);
  if (v.sector) {
    const rrg = v.sector_rrg_quadrant ? `, RRG: ${v.sector_rrg_quadrant}` : "";
    lines.push(`Sector: ${v.sector}${v.sector_beats_spy ? " (beating SPY 4W)" : ""}${rrg}`);
  }
  if (v.theme) {
    const rrg = v.theme_rrg_quadrant ? `, RRG: ${v.theme_rrg_quadrant}` : "";
    const confidence = v.theme_match_confidence === "approximate" ? " (approximate match)" : "";
    lines.push(`Theme: ${v.theme}${confidence}${rrg}`);
  }
  if (v.chart_grade) lines.push(`Chart grade: ${v.chart_grade} (real chart read by the model -- still worth a look yourself before acting)`);
  if (v.earnings_trading_days != null) lines.push(`Earnings: ~${v.earnings_trading_days.toFixed(0)} trading days out`);
  if (v.rs_pctile_is_estimate && v.rs_pctile_estimate != null) lines.push(`RS percentile: ~${v.rs_pctile_estimate} (estimate vs SPY, not a full-market rank)`);

  return lines.join("\n");
}

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
      await sendTelegram(chatId, "Commands:\n/add <TICKER> -- run a swing-trade check and save it to your watchlist");
    }
    return NextResponse.json({ ok: true });
  }

  const ticker = addMatch[1].toUpperCase();
  await sendTelegram(chatId, `🔍 Checking ${ticker}...`);

  try {
    const verdict = await analyzeTicker(ticker, process.env.MARKETDATA_API_TOKEN || null);
    await saveVerdict(chatId, verdict);
    await sendTelegram(chatId, formatVerdict(verdict));
  } catch (e) {
    await sendTelegram(chatId, `❌ ${ticker}: check failed -- ${e instanceof Error ? e.message : "unknown error"}`);
  }

  return NextResponse.json({ ok: true });
}
