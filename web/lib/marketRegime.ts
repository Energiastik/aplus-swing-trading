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
  const [spy, qqq, vix] = await Promise.all([
    fetchDailyBars("SPY", "2y"),
    fetchDailyBars("QQQ", "6mo"),
    fetchDailyBars("^VIX", "3mo"),
  ]);

  const checks: Record<string, boolean> = {};
  if (spy.length === 0 || qqq.length === 0) {
    return { score: 0, checks: { error: false }, mode: "NO_TRADE", size_multiplier: 0, vix: null, vix_note: "" };
  }

  const spyCloses = spy.map((b) => b.close);
  const spyEma200 = ema(spyCloses, 200);
  const c1 = spyCloses[spyCloses.length - 1] > spyEma200[spyEma200.length - 1];
  checks["SPY > EMA200"] = c1;

  const q = qqq.map((b) => b.close);
  const rollingHigh: number[] = q.map((_, i) => Math.max(...q.slice(Math.max(0, i - 19), i + 1)));
  const last5 = q.slice(-5);
  const last5High = rollingHigh.slice(-5);
  const c2 = last5.some((v, i) => v >= last5High[i] * 0.999);
  checks["QQQ 4-week high (last 5d)"] = c2;

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
