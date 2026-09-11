/** TypeScript port of agent/analyze_ticker.py -- see strategy/VERDICT_RULES.md
 * for the exact BUY/WAIT/PASS rules. This is the Node/Vercel-reachable
 * version used by the Telegram webhook (web/app/api/telegram-webhook/route.ts)
 * since the Python pipeline isn't part of this deployment (see
 * strategy/TELEGRAM_BOT.md). Same thresholds, same gate order, same
 * confluence/A+ logic -- now includes a real rendered chart image sent to
 * the grading call (lib/renderChart.ts + lib/visionGrade.ts), the same
 * idea as agent/chart_vision.py, just OpenAI instead of Anthropic. */
import { fetchDailyBars, fetchNextEarningsCalendarDays, fetchSectorAndIndustry } from "./marketData";
import { readTechnicals, rsWeightedReturn, confluenceCount, stopAndEntry, type TechRead } from "./technicals";
import { assessRegime } from "./marketRegime";
import { scoreSectors } from "./sectorRotation";
import { readOptionsWalls, type OptionsWalls } from "./optionsWalls";
import { gradeChart, type VisionGrade } from "./visionGrade";
import { renderChartPng } from "./renderChart";
import { mapToTheme } from "./themes";
import { getLatestRrgReading, type Quadrant } from "./rrgQuadrant";

const YF_SECTOR_MAP: Record<string, string> = {
  "Technology": "Technology",
  "Consumer Cyclical": "Consumer Discretionary",
  "Financial Services": "Financials",
  "Industrials": "Industrials",
  "Energy": "Energy",
  "Healthcare": "Health Care",
  "Consumer Defensive": "Consumer Staples",
  "Utilities": "Utilities",
  "Real Estate": "Real Estate",
  "Basic Materials": "Materials",
  "Communication Services": "Communication Services",
};

export const MIN_RR = 1.0;
export const MIN_EARNINGS_TRADING_DAYS = 7;
export const MAX_BASE_NUMBER = 4;
export const APLUS_WAIT_CEILING = 6;
export const BREAKOUT_RVOL_MIN = 1.2;
export const RS_PROXY_SPY_MARGIN_FOR_85TH = 0.15;

export type VerdictType = "BUY" | "WAIT" | "PASS";

export interface Verdict {
  ticker: string;
  verdict: VerdictType;
  reason: string;
  conviction: "A+" | "A" | "standard" | null;
  rr_band: "2:1-2.9:1" | "3:1+" | null;
  trigger: "breakout" | "pullback" | null;
  aplus_score: number;
  aplus_detail: { check: string; ok: boolean }[];
  regime_score: number;
  regime_mode: string;
  sector: string | null;
  sector_beats_spy: boolean;
  sector_rrg_quadrant: Quadrant | null;
  theme: string | null;
  theme_match_confidence: "exact" | "approximate" | null;
  theme_rrg_quadrant: Quadrant | null;
  price: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  rr: number | null;
  confluence_count: number;
  confluence_signals: string[];
  chart_grade: string | null;
  vision_note: string | null;
  /** 3-4 sentence plain-language explanation (what the setup looks like,
   * why it isn't a buy yet, and what to watch for) -- this is what's shown
   * to the user instead of raw entry/stop/target numbers, which are still
   * computed above (needed for R/R gating and confluence) but no longer
   * surfaced directly in Telegram or the dashboard. */
  justification_ru: string | null;
  justification_en: string | null;
  used_fallback_levels: boolean;
  rs_pctile_estimate: number | null;
  rs_pctile_is_estimate: true;
  earnings_trading_days: number | null;
  options_wall_source: string | null;
}

function tradingDays(calendarDays: number): number {
  return (calendarDays * 5) / 7;
}

interface SectorThemeInfo {
  sector: string | null;
  beatsSpy: boolean;
  sectorRrgQuadrant: Quadrant | null;
  theme: string | null;
  themeConfidence: "exact" | "approximate" | null;
  themeRrgQuadrant: Quadrant | null;
}

async function sectorAndThemeInfo(ticker: string): Promise<SectorThemeInfo> {
  const [{ sector: yfSector, industry }, sectors] = await Promise.all([
    fetchSectorAndIndustry(ticker), scoreSectors(),
  ]);
  const mapped = yfSector ? (YF_SECTOR_MAP[yfSector] ?? yfSector) : null;
  const row = mapped ? sectors.find((r) => r.sector === mapped) : undefined;
  const beatsSpy = row ? row["4W_vs_SPY"] > 0 : false;

  const themeMatch = mapToTheme(ticker, industry);

  const [sectorRrg, themeRrg] = await Promise.all([
    mapped ? getLatestRrgReading(mapped) : Promise.resolve(null),
    themeMatch ? getLatestRrgReading(themeMatch.theme) : Promise.resolve(null),
  ]);

  return {
    sector: mapped, beatsSpy, sectorRrgQuadrant: sectorRrg?.quadrant ?? null,
    theme: themeMatch?.theme ?? null, themeConfidence: themeMatch?.confidence ?? null,
    themeRrgQuadrant: themeRrg?.quadrant ?? null,
  };
}

async function rsPctileEstimate(t: TechRead): Promise<number | null> {
  if (t.rs_raw == null) return null;
  const spyBars = await fetchDailyBars("SPY", "2y");
  if (spyBars.length === 0) return null;
  const spyRs = rsWeightedReturn(spyBars.map((b) => b.close));
  if (spyRs == null) return null;
  const margin = t.rs_raw - spyRs;
  const pctile = 50 + (margin / RS_PROXY_SPY_MARGIN_FOR_85TH) * 35;
  return Math.round(Math.min(Math.max(pctile, 0), 100) * 10) / 10;
}

function aplusChecklist(
  regimeScore: number, sectorBeatsSpy: boolean, t: TechRead, vision: VisionGrade,
  rr: number | null, rsPctile: number | null, earningsTradingDays: number | null
): { score: number; detail: { check: string; ok: boolean }[] } {
  const checks: [string, boolean][] = [
    ["Regime 3/4 or 4/4", regimeScore >= 3],
    ["Sector beats SPY (4W)", sectorBeatsSpy],
    ["RS percentile >= 85 (estimate)", (rsPctile ?? 0) >= 85],
    ["Recognizable pattern", !!vision.pattern && vision.pattern !== "none"],
    ["VDU present", !!(t.vdu || vision.vdu)],
    ["Clear pivot", t.pivot !== null && !t.extended],
    ["Logical stop", true],
    ["R/R >= 2:1", rr !== null && rr >= 2.0],
    [`Earnings >= ${MIN_EARNINGS_TRADING_DAYS} trading days away`,
      earningsTradingDays === null || earningsTradingDays >= MIN_EARNINGS_TRADING_DAYS],
  ];
  return { score: checks.filter(([, ok]) => ok).length, detail: checks.map(([check, ok]) => ({ check, ok })) };
}

function detectTrigger(t: TechRead, vision: VisionGrade): "breakout" | "pullback" | null {
  if (t.pivot !== null && t.dist_to_pivot_pct !== null) {
    if (t.dist_to_pivot_pct >= -1.0 && !t.extended && t.vol_ratio >= BREAKOUT_RVOL_MIN) return "breakout";
  }
  if (t.vdu || vision.vdu) return "pullback";
  return null;
}

export async function analyzeTicker(
  rawTicker: string,
  optionsToken: string | null = null,
  gradeFn: typeof gradeChart = gradeChart // injectable for tests -- avoids needing a live OpenAI call
): Promise<Verdict> {
  const ticker = rawTicker.toUpperCase().trim();
  const bars = await fetchDailyBars(ticker, "2y");
  const base: Omit<Verdict, "verdict" | "reason"> = {
    ticker, conviction: null, rr_band: null, trigger: null, aplus_score: 0, aplus_detail: [],
    regime_score: 0, regime_mode: "", sector: null, sector_beats_spy: false,
    sector_rrg_quadrant: null, theme: null, theme_match_confidence: null, theme_rrg_quadrant: null,
    price: null, entry: null, stop: null, target: null, rr: null,
    confluence_count: 0, confluence_signals: [], chart_grade: null, vision_note: null,
    justification_ru: null, justification_en: null,
    used_fallback_levels: false,
    rs_pctile_estimate: null, rs_pctile_is_estimate: true, earnings_trading_days: null,
    options_wall_source: null,
  };
  if (bars.length === 0) return { ...base, verdict: "PASS", reason: "no price data" };

  const t = readTechnicals(bars);
  const [regime, sectorTheme, earningsCalDays, rsPctile] = await Promise.all([
    assessRegime(),
    sectorAndThemeInfo(ticker),
    fetchNextEarningsCalendarDays(ticker),
    rsPctileEstimate(t),
  ]);
  const earningsTradingDays = earningsCalDays !== null ? tradingDays(earningsCalDays) : null;

  // Render the real chart before grading -- a rendering failure degrades to
  // a null image (visionGrade.ts falls back to a more-conservative
  // numbers-only prompt) rather than blocking the whole analysis.
  let chartImageDataUri: string | null = null;
  try {
    chartImageDataUri = await renderChartPng(ticker, bars, t);
  } catch (e) {
    console.error(`renderChartPng(${ticker}) failed: ${e instanceof Error ? e.message : e}`);
  }

  const vision = await gradeFn(ticker, chartImageDataUri, {
    price: t.price, ema9: t.ema9, ema21: t.ema21, ema50: t.ema50, ema200: t.ema200,
    rsi14: t.rsi14, atr_pct: t.atr_pct, pivot: t.pivot, dist_to_pivot_pct: t.dist_to_pivot_pct,
    vol_ratio: t.vol_ratio, vdu: t.vdu, fib_382: t.fib_382, fib_500: t.fib_500, fib_618: t.fib_618,
    vwap_anchor: t.vwap_anchor, poc: t.poc, val: t.val, vah: t.vah, sr_zones: t.sr_zones,
    recent_bars: bars.slice(-12),
  });
  const chartGrade = vision.grade || "C";

  // The numbers-only grading call sometimes declines to give a plan
  // (entry_type "none" or missing stop/target) where the real chart-vision
  // pipeline would have judged real structural levels. Rather than silently
  // discard the ticker as "R/R n/a", fall back to the same formulaic
  // stop_and_entry() the daily pipeline itself falls back to when it can't
  // do better -- always labeled as a fallback, never presented as the
  // model's own judgment.
  let entry = vision.entry ?? t.price;
  let stop = vision.stop ?? null;
  let target = vision.target ?? null;
  let usedFallbackLevels = false;
  if (stop === null || target === null) {
    const fallback = stopAndEntry(t);
    entry = vision.entry ?? fallback.entry;
    stop = fallback.stop;
    target = fallback.target;
    usedFallbackLevels = true;
  }
  const rr = stop && target && entry > stop ? Math.round(((target - entry) / (entry - stop)) * 100) / 100 : null;

  const walls: OptionsWalls = await readOptionsWalls(ticker, t.price, optionsToken);
  const { count: confCount, signals: confSignals } = confluenceCount(t, entry, walls);

  const v: Verdict = {
    ...base, verdict: "WAIT", reason: "",
    regime_score: regime.score, regime_mode: regime.mode,
    sector: sectorTheme.sector, sector_beats_spy: sectorTheme.beatsSpy,
    sector_rrg_quadrant: sectorTheme.sectorRrgQuadrant,
    theme: sectorTheme.theme, theme_match_confidence: sectorTheme.themeConfidence,
    theme_rrg_quadrant: sectorTheme.themeRrgQuadrant,
    price: t.price, entry, stop, target, rr,
    confluence_count: confCount, confluence_signals: confSignals,
    chart_grade: chartGrade, vision_note: vision.note ?? null,
    justification_ru: vision.justification_ru ?? null, justification_en: vision.justification_en ?? null,
    used_fallback_levels: usedFallbackLevels,
    rs_pctile_estimate: rsPctile, earnings_trading_days: earningsTradingDays,
    options_wall_source: walls.source,
  };

  // ---- PASS gates ----
  if (!t.above_200) return { ...v, verdict: "PASS", reason: "below EMA200 -- no long structure" };
  if (rr === null || rr < MIN_RR) {
    const why = usedFallbackLevels
      ? `structural stop/target (fallback -- grading gave no plan${vision.note ? `: "${vision.note}"` : ""})`
      : "grading's own entry/stop/target";
    return { ...v, verdict: "PASS", reason: `R/R ${rr ?? "n/a"} < ${MIN_RR} from ${why}` };
  }
  if (chartGrade === "F") return { ...v, verdict: "PASS", reason: `chart grade F -- ${vision.note ?? ""}` };
  if (earningsTradingDays !== null && earningsTradingDays < MIN_EARNINGS_TRADING_DAYS) {
    return { ...v, verdict: "PASS", reason: `earnings in ~${earningsTradingDays.toFixed(0)} trading days` };
  }
  if (vision.base_number != null && vision.base_number >= MAX_BASE_NUMBER) {
    return { ...v, verdict: "PASS", reason: `base #${vision.base_number} -- too extended a series of bases` };
  }

  const { score: aplusScore, detail: aplusDetail } = aplusChecklist(
    regime.score, sectorTheme.beatsSpy, t, vision, rr, rsPctile, earningsTradingDays
  );
  v.aplus_score = aplusScore;
  v.aplus_detail = aplusDetail;
  const trigger = detectTrigger(t, vision);
  v.trigger = trigger;

  // ---- WAIT caps ----
  if (regime.score <= 1) return { ...v, verdict: "WAIT", reason: "regime NO_TRADE -- watchlist only" };
  if (aplusScore <= APLUS_WAIT_CEILING) return { ...v, verdict: "WAIT", reason: `A+ score ${aplusScore}/9 -- no entry` };
  if (t.extended) return { ...v, verdict: "WAIT", reason: `${t.dist_to_pivot_pct!.toFixed(1)}% past pivot -- chase risk` };
  if (confCount === 0) return { ...v, verdict: "WAIT", reason: "no confluence at proposed entry" };
  if (trigger === null) return { ...v, verdict: "WAIT", reason: "structurally fine, no trigger today" };

  // ---- BUY ----
  // Conviction tiers: "A+" is the full 9/9 checklist (unchanged, matches
  // STRATEGY.md's canonical A+ checklist). Below that, a sector or theme
  // sitting in the RRG Improving/Leading quadrant is a real, separate
  // tailwind signal -- same idea as the daily pipeline treating sector-
  // rotation stage (Building/Emerging/Leading/Fading) as its own dimension
  // alongside the A+ score, not fused into the 9 questions themselves. This
  // is the one place RRG data affects the verdict; everywhere else it's
  // shown as context only.
  const rotationTailwind = (q: Quadrant | null) => q === "Improving" || q === "Leading";
  const hasRotationTailwind = rotationTailwind(sectorTheme.sectorRrgQuadrant) || rotationTailwind(sectorTheme.themeRrgQuadrant);
  const conviction: "A+" | "A" | "standard" =
    aplusScore === 9 ? "A+" : hasRotationTailwind ? "A" : "standard";
  const rrBand: "2:1-2.9:1" | "3:1+" = rr >= 3.0 ? "3:1+" : "2:1-2.9:1";
  return {
    ...v, verdict: "BUY", conviction, rr_band: rrBand,
    reason: `${trigger} trigger, A+ ${aplusScore}/9, R/R ${rr.toFixed(1)}`,
  };
}
