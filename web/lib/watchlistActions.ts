/** Shared "analyze a ticker, save it, tell the owner" logic -- used by both
 * the Telegram webhook (web/app/api/telegram-webhook/route.ts, `/add
 * TICKER` in chat) and the website's "Add to watchlist" action (web/app/api/
 * watchlist/add/route.ts, from the new /watchlist page). Single code path
 * so "whenever a new watchlist entry appears, the owner gets a Telegram
 * alert with the analysis" holds true regardless of which one triggered it,
 * instead of two routes quietly drifting out of sync with each other. */
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

export function formatVerdictMessage(v: Verdict, source?: "web" | "telegram"): string {
  const emoji = VERDICT_EMOJI[v.verdict] ?? "";
  const originTag = source === "web" ? " (added from the dashboard)" : "";
  const lines = [`${emoji} *${v.ticker}* — *${v.verdict}*${originTag}`, v.reason];

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

/** The one shared entry point: analyze, persist, alert. `chatId` is always
 * the project owner's single Telegram chat (TELEGRAM_CHAT_ID) regardless of
 * whether this was triggered by `/add` in Telegram or the website's "Add to
 * watchlist" button -- there's only one legitimate recipient either way. */
export async function runAnalysisAndNotify(
  ticker: string,
  optionsToken: string | null,
  source: "web" | "telegram"
): Promise<Verdict> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const verdict = await analyzeTicker(ticker, optionsToken);
  if (chatId) {
    await saveVerdict(chatId, verdict);
    await sendTelegramAlert(chatId, formatVerdictMessage(verdict, source));
  }
  return verdict;
}
