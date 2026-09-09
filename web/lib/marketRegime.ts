/** Port of agent/market_regime.py -- Gate #1, Day 3 weekly checklist + VIX overlay. */
import { fetchDailyBars } from "./marketData";
import { ema } from "./technicals";

export interface Regime {
  score: number;
  checks: Record<string, boolean>;
  mode: "AGGRESSIVE" | "CAUTIOUS" | "NO_TRADE";
  size_multiplier: number;
  vix: number | null;
  vix_note: string;
}

export async function assessRegime(): Promise<Regime> {
  const [spy, rsp, vix] = await Promise.all([
    fetchDailyBars("SPY", "2y"),
    fetchDailyBars("RSP", "6mo"),
    fetchDailyBars("^VIX", "3mo"),
  ]);

  const checks: Record<string, boolean> = {};
  if (spy.length === 0 || rsp.length === 0) {
    return { score: 0, checks: { error: false }, mode: "NO_TRADE", size_multiplier: 0, vix: null, vix_note: "" };
  }

  const spyCloses = spy.map((b) => b.close);
  const spyEma200 = ema(spyCloses, 200);
  const c1 = spyCloses[spyCloses.length - 1] > spyEma200[spyEma200.length - 1];
  checks["SPY > EMA200"] = c1;

  // Breadth: RSP (equal-weight S&P 500) vs SPY (cap-weight) over 20 trading
  // days. If RSP keeps pace, participation is broad and healthy; if it
  // meaningfully lags, the market is being carried by a handful of
  // mega-caps -- a fragility signal the old "QQQ new 4-week high" check
  // (narrow, binary, redundant with the SPY-up-this-week check below)
  // didn't capture. 1% tolerance band absorbs day-to-day noise.
  const spyByDate = new Map(spy.map((b) => [b.date, b.close]));
  const ratioSeries = rsp.filter((b) => spyByDate.has(b.date)).map((b) => b.close / (spyByDate.get(b.date) as number));
  const c2 = ratioSeries.length > 20 && ratioSeries[ratioSeries.length - 1] >= ratioSeries[ratioSeries.length - 21] * 0.99;
  checks["Breadth: RSP keeping pace with SPY (20d)"] = c2;

  const vixClose = vix.length > 0 ? vix[vix.length - 1].close : null;
  const c3 = vixClose !== null && vixClose < 20;
  checks["VIX < 20"] = c3;

  const w = spyCloses.slice(-11);
  const c4 = w.length >= 11 && w[w.length - 1] > w[w.length - 6];
  checks["SPY up on week"] = c4;

  const score = [c1, c2, c3, c4].filter(Boolean).length;
  let mode: Regime["mode"] = "NO_TRADE";
  let sizeMultiplier = 0;
  if (score === 4) { mode = "AGGRESSIVE"; sizeMultiplier = 1.0; }
  else if (score >= 2) { mode = "CAUTIOUS"; sizeMultiplier = 0.5; }

  let vixNote = "";
  if (vixClose !== null) {
    if (vixClose > 28) vixNote = "PANIC ZONE (VIX>28): contrarian window -- scale in slowly.";
    else if (vixClose < 15) vixNote = "Calm (VIX<15): keep booking profits per pie-exit plan.";
    else vixNote = "VIX 15-28: hold with the trend, monitor.";
  }

  return { score, checks, mode, size_multiplier: sizeMultiplier, vix: vixClose, vix_note: vixNote };
}
