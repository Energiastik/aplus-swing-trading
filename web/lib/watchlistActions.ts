/** Shared "analyze a ticker, save it, tell the owner" logic. Two callers:
 * the Telegram webhook (web/app/api/telegram-webhook/route.ts, `/add
 * TICKER` in chat -- the ONLY way to add a new ticker, by design) and the
 * daily price-trigger recheck (web/app/api/watchlist/recheck/route.ts, a
 * Vercel Cron job). Single code path so "analyze, save, alert" behaves
 * identically regardless of which one triggered it. */
import { getPool } from "./db";
import { analyzeTicker, type Verdict } from "./analyzeTicker";

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

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(SCHEMA);
  schemaReady = true;
}

export async function saveVerdict(chatId: string, v: Verdict): Promise<void> {
  await ensureSchema();
  await getPool().query(
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

export async function sendTelegramAlert(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

const VERDICT_EMOJI: Record<string, string> = { BUY: "🟢", WAIT: "🟡", PASS: "🔴" };

/** Telegram is a fixed, non-interactive channel (no language toggle like
 * the dashboard has) -- defaults to Russian, matching every other
 * fixed-channel output in this project (the daily PDF is Russian-only
 * too). `source: "cron"` tags a message as coming from the daily
 * price-trigger recheck rather than a manual /add. No entry/stop/target/R-R
 * numbers shown by request -- justification_ru carries the actual reasoning
 * instead (still computed internally for gating, just not surfaced here). */
export function formatVerdictMessage(v: Verdict, source: "telegram" | "cron" = "telegram"): string {
  const emoji = VERDICT_EMOJI[v.verdict] ?? "";
  const originTag = source === "cron" ? " (авто-проверка цены)" : "";
  const lines = [`${emoji} *${v.ticker}* — *${v.verdict}*${originTag}`];

  const justification = v.justification_ru || v.reason;
  if (justification) lines.push(`\n${justification}`);

  if (v.verdict !== "PASS") {
    lines.push(`\nA+ score: ${v.aplus_score}/9`);
    if (v.conviction) lines.push(`Убедительность: ${v.conviction}`);
  }
  lines.push(`\nРежим: ${v.regime_mode} (${v.regime_score}/4)`);
  if (v.sector) {
    const rrg = v.sector_rrg_quadrant ? `, RRG: ${v.sector_rrg_quadrant}` : "";
    lines.push(`Сектор: ${v.sector}${v.sector_beats_spy ? " (обгоняет SPY за 4нед)" : ""}${rrg}`);
  }
  if (v.theme) {
    const rrg = v.theme_rrg_quadrant ? `, RRG: ${v.theme_rrg_quadrant}` : "";
    const confidence = v.theme_match_confidence === "approximate" ? " (приблизительное совпадение)" : "";
    lines.push(`Тема: ${v.theme}${confidence}${rrg}`);
  }
  if (v.chart_grade) lines.push(`Оценка графика: ${v.chart_grade} (реальный график, прочитанный моделью — всё равно стоит взглянуть самому)`);
  if (v.earnings_trading_days != null) lines.push(`Отчётность: через ~${v.earnings_trading_days.toFixed(0)} торговых дней`);

  return lines.join("\n");
}

/** The one shared entry point: analyze, persist, alert. `chatId` is always
 * the project owner's single Telegram chat (TELEGRAM_CHAT_ID) -- the only
 * way to add a ticker is `/add` in Telegram itself; `source: "cron"` is used
 * by the daily price-trigger recheck re-running this same function on an
 * existing WAIT ticker, not a new addition. */
export async function runAnalysisAndNotify(
  ticker: string,
  optionsToken: string | null,
  source: "telegram" | "cron" = "telegram"
): Promise<Verdict> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const verdict = await analyzeTicker(ticker, optionsToken);
  if (chatId) {
    await saveVerdict(chatId, verdict);
    await sendTelegramAlert(chatId, formatVerdictMessage(verdict, source));
  }
  return verdict;
}
