/** TypeScript port of agent/technicals.py's numeric engine (EMA/RSI/ATR/pivot/
 * VDU/Fib/VWAP/S-R zones/confluence), for the Node/Vercel Telegram-bot path
 * that can't run the Python pipeline directly (see strategy/TELEGRAM_BOT.md
 * for why). Formulas are copied 1:1, including quirks like rsWeightedReturn's
 * off-by-one lookback indexing -- this mirrors the verified Python behavior
 * on purpose, not a "cleaned up" reimplementation. Cross-checked against a
 * real technicals.read() dump for NVDA (see commit message). */
import type { Bar } from "./marketData";

export function ema(values: number[], n: number): number[] {
  const alpha = 2 / (n + 1);
  const out: number[] = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  return out;
}

export function rsi(values: number[], n: number = 14): number[] {
  const alpha = 1 / n;
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const avgGain = ewmAlpha(gains, alpha);
  const avgLoss = ewmAlpha(losses, alpha);
  return values.map((_, i) => {
    if (avgLoss[i] === 0) return avgGain[i] === 0 ? 50 : 100;
    const rs = avgGain[i] / avgLoss[i];
    return 100 - 100 / (1 + rs);
  });
}

function ewmAlpha(values: number[], alpha: number): number[] {
  const out: number[] = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  return out;
}

export function atr(bars: Bar[], n: number = 14): number[] {
  const tr: number[] = bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const prevClose = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
  });
  return ewmAlpha(tr, 1 / n);
}

/** IBD-style weighted momentum: 40%*3m + 20%*6m + 20%*9m + 20%*12m. Uses
 * close[-1]/close[-n] (not close[-1-n]) intentionally -- matches the exact
 * indexing of the verified Python rs_weighted_return(). */
export function rsWeightedReturn(closes: number[]): number | null {
  const last = closes.length - 1;
  const r = (n: number): number | null => (closes.length > n ? closes[last] / closes[last - (n - 1)] - 1 : null);
  const parts: [number, number | null][] = [
    [0.4, r(63)],
    [0.2, r(126)],
    [0.2, r(189)],
    [0.2, r(252)],
  ];
  const vals = parts.filter((p): p is [number, number] => p[1] !== null);
  if (vals.length === 0) return null;
  const wsum = vals.reduce((s, [w]) => s + w, 0);
  return vals.reduce((s, [w, x]) => s + w * x, 0) / wsum;
}

export interface VolumeProfile {
  poc: number | null;
  val: number | null;
  vah: number | null;
}

export function volumeProfile(bars: Bar[], lookback: number = 90, nBins: number = 40): VolumeProfile {
  const d = bars.length > lookback ? bars.slice(-lookback) : bars;
  if (d.length === 0) return { poc: null, val: null, vah: null };
  const lo = Math.min(...d.map((b) => b.low));
  const hi = Math.max(...d.map((b) => b.high));
  if (hi <= lo) return { poc: null, val: null, vah: null };
  const edges = Array.from({ length: nBins + 1 }, (_, i) => lo + ((hi - lo) * i) / nBins);
  const volByBin = new Array(nBins).fill(0);
  for (const b of d) {
    if (b.high <= b.low || b.volume <= 0) continue;
    const loBin = Math.max(0, searchSortedRight(edges, b.low) - 1);
    const hiBin = Math.min(nBins - 1, searchSortedRight(edges, b.high) - 1);
    const span = hiBin - loBin + 1;
    for (let i = loBin; i <= hiBin; i++) volByBin[i] += b.volume / span;
  }
  const centers = edges.slice(0, -1).map((e, i) => (e + edges[i + 1]) / 2);
  const total = volByBin.reduce((s, v) => s + v, 0);
  if (total <= 0) return { poc: null, val: null, vah: null };
  let pocI = 0;
  for (let i = 1; i < nBins; i++) if (volByBin[i] > volByBin[pocI]) pocI = i;
  let loI = pocI;
  let hiI = pocI;
  let covered = volByBin[pocI];
  const target = total * 0.68;
  while (covered < target && (loI > 0 || hiI < nBins - 1)) {
    const left = loI > 0 ? volByBin[loI - 1] : -1;
    const right = hiI < nBins - 1 ? volByBin[hiI + 1] : -1;
    if (right >= left) {
      hiI++;
      covered += volByBin[hiI];
    } else {
      loI--;
      covered += volByBin[loI];
    }
  }
  return { poc: round2(centers[pocI]), val: round2(centers[loI]), vah: round2(centers[hiI]) };
}

function searchSortedRight(edges: number[], v: number): number {
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface SrZone {
  level: number;
  strength: number;
  type: "support" | "resistance";
  dist_pct: number;
}

export function historicalSrZones(
  bars: Bar[], lookback: number = 504, window: number = 8,
  tolerancePct: number = 1.5, maxZones: number = 6
): SrZone[] {
  const d = bars.length > lookback ? bars.slice(-lookback) : bars;
  if (d.length < window * 2 + 1) return [];
  const price = d[d.length - 1].close;
  const points: number[] = [];
  for (let i = window; i < d.length - window; i++) {
    const segH = d.slice(i - window, i + window + 1).map((b) => b.high);
    if (d[i].high === Math.max(...segH)) points.push(d[i].high);
    const segL = d.slice(i - window, i + window + 1).map((b) => b.low);
    if (d[i].low === Math.min(...segL)) points.push(d[i].low);
  }
  if (points.length === 0) return [];
  points.sort((a, b) => a - b);
  const zones: number[][] = [];
  let cur = [points[0]];
  for (const p of points.slice(1)) {
    if (((p - cur[cur.length - 1]) / cur[cur.length - 1]) * 100 <= tolerancePct) cur.push(p);
    else {
      zones.push(cur);
      cur = [p];
    }
  }
  zones.push(cur);
  const out: SrZone[] = zones.map((z) => {
    const level = round2(z.reduce((s, x) => s + x, 0) / z.length);
    return {
      level, strength: z.length,
      type: level > price ? "resistance" : "support",
      dist_pct: round2((level / price - 1) * 100),
    };
  });
  out.sort((a, b) => b.strength - a.strength || Math.abs(a.dist_pct) - Math.abs(b.dist_pct));
  return out.slice(0, maxZones);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export interface TechRead {
  price: number;
  ema9: number; ema21: number; ema50: number; ema200: number;
  stacked: boolean; above_200: boolean;
  rsi14: number; rsi_ok: boolean;
  atr14: number; atr_pct: number;
  vol_ratio: number; vdu: boolean;
  pivot: number | null; dist_to_pivot_pct: number | null; extended: boolean;
  pullback_low: number | null;
  rs_raw: number | null;
  rally_low: number | null;
  fib_382: number | null; fib_500: number | null; fib_618: number | null;
  vwap_anchor: number | null; vwap_anchor_date: string | null; dist_to_vwap_pct: number | null;
  liquidity_sweep: boolean; liquidity_sweep_low: number | null;
  poc: number | null; val: number | null; vah: number | null;
  sr_zones: SrZone[];
}

export function readTechnicals(bars: Bar[]): TechRead {
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1];
  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const last = closes.length - 1;
  const ema9 = e9[last], ema21 = e21[last], ema50 = e50[last], ema200 = e200[last];
  const stacked = price > ema9 && ema9 > ema21 && ema21 > ema50 && ema50 > ema200;
  const above200 = price > ema200;
  const rsiSeries = rsi(closes);
  const rsi14 = rsiSeries[last];
  const rsiOk = rsi14 >= 40 && rsi14 <= 80;
  const atrSeries = atr(bars);
  const atr14 = atrSeries[last];
  const atrPct = (atr14 / price) * 100;

  const volMa = rollingMean(bars.map((b) => b.volume), 50);
  const volRatio = volMa[last] ? bars[last].volume / volMa[last] : 0;
  const recentVr = mean(bars.slice(-3).map((b, i) => {
    const idx = bars.length - 3 + i;
    return volMa[idx] ? bars[idx].volume / volMa[idx] : 0;
  }));
  const recentRng = mean(bars.slice(-3).map((b) => (b.high - b.low) / b.close));
  const vdu = recentVr <= 0.6 && recentRng <= 0.025;

  // Pivot: highest high of last 60 sessions excluding last 3.
  const win = bars.length > 63 ? bars.slice(-63, -3) : bars.slice(0, -3);
  let pivot: number | null = null;
  let pivotIdx: number | null = null;
  let distToPivotPct: number | null = null;
  let extended = false;
  if (win.length > 0) {
    let maxI = 0;
    for (let i = 1; i < win.length; i++) if (win[i].high > win[maxI].high) maxI = i;
    pivot = win[maxI].high;
    pivotIdx = bars.indexOf(win[maxI]);
    distToPivotPct = (price / pivot - 1) * 100;
    extended = distToPivotPct > 5;
  }
  const lows15 = bars.slice(-15).map((b) => b.low);
  const pullbackLow = lows15.length ? Math.min(...lows15) : null;

  let rallyLow: number | null = null;
  let fib382: number | null = null, fib500: number | null = null, fib618: number | null = null;
  if (pivotIdx !== null) {
    const prePivot = bars.slice(Math.max(0, pivotIdx - 90), pivotIdx);
    if (prePivot.length > 0) {
      rallyLow = Math.min(...prePivot.map((b) => b.low));
      const fibRange = (pivot as number) - rallyLow;
      if (fibRange > 0) {
        fib382 = (pivot as number) - 0.382 * fibRange;
        fib500 = (pivot as number) - 0.5 * fibRange;
        fib618 = (pivot as number) - 0.618 * fibRange;
      }
    }
  }

  // Anchored VWAP from the highest-volume day in the last 90 sessions.
  const lookback90 = bars.length > 90 ? bars.slice(-90) : bars;
  let vwapAnchor: number | null = null, vwapAnchorDate: string | null = null, distToVwapPct: number | null = null;
  if (lookback90.length > 0 && Math.max(...lookback90.map((b) => b.volume)) > 0) {
    let anchorI = 0;
    for (let i = 1; i < lookback90.length; i++) if (lookback90[i].volume > lookback90[anchorI].volume) anchorI = i;
    const anchorBar = lookback90[anchorI];
    const anchorPos = bars.indexOf(anchorBar);
    const fromAnchor = bars.slice(anchorPos);
    let volSum = 0, num = 0;
    for (const b of fromAnchor) {
      const typical = (b.high + b.low + b.close) / 3;
      volSum += b.volume;
      num += typical * b.volume;
    }
    if (volSum > 0) {
      vwapAnchor = num / volSum;
      vwapAnchorDate = anchorBar.date;
      distToVwapPct = round2((price / vwapAnchor - 1) * 100);
    }
  }

  // Liquidity sweep: last 5 sessions undercut the prior 20-session swing low
  // (sessions -25..-5) then closed back above it same day.
  let liquiditySweep = false, liquiditySweepLow: number | null = null;
  if (bars.length > 25) {
    const priorWindow = bars.slice(-25, -5);
    const priorSwingLow = Math.min(...priorWindow.map((b) => b.low));
    const recent = bars.slice(-5);
    const swept = recent.filter((b) => b.low < priorSwingLow && b.close > priorSwingLow);
    if (swept.length > 0) {
      liquiditySweep = true;
      liquiditySweepLow = Math.min(...swept.map((b) => b.low));
    }
  }

  const vp = volumeProfile(bars);
  const srZones = historicalSrZones(bars);
  const rsRaw = rsWeightedReturn(closes);

  return {
    price, ema9, ema21, ema50, ema200, stacked, above_200: above200,
    rsi14, rsi_ok: rsiOk, atr14, atr_pct: atrPct, vol_ratio: volRatio, vdu,
    pivot, dist_to_pivot_pct: distToPivotPct, extended, pullback_low: pullbackLow,
    rs_raw: rsRaw, rally_low: rallyLow, fib_382: fib382, fib_500: fib500, fib_618: fib618,
    vwap_anchor: vwapAnchor, vwap_anchor_date: vwapAnchorDate, dist_to_vwap_pct: distToVwapPct,
    liquidity_sweep: liquiditySweep, liquidity_sweep_low: liquiditySweepLow,
    poc: vp.poc, val: vp.val, vah: vp.vah, sr_zones: srZones,
  };
}

function rollingMean(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

export interface OptionsWallsLike {
  source: string;
  call_wall: number | null;
  put_wall: number | null;
}

export function confluenceCount(t: TechRead, entry: number, walls: OptionsWallsLike | null): { count: number; signals: string[] } {
  const hits: string[] = [];
  const near = (level: number | null | undefined, name: string) => {
    if (level != null && (Math.abs(entry - level) / entry) * 100 <= 2.0) hits.push(name);
  };
  near(t.ema21, "EMA21");
  near(t.ema50, "EMA50");
  near(t.fib_382, "Fib 38.2%");
  near(t.fib_500, "Fib 50%");
  near(t.fib_618, "Fib 61.8%");
  near(t.vwap_anchor, "anchored VWAP");
  near(t.liquidity_sweep_low, "liquidity-sweep reclaim level");
  near(t.poc, "volume profile POC");
  near(t.vah, "volume profile VAH");
  near(t.val, "volume profile VAL");
  for (const z of t.sr_zones) near(z.level, `historical ${z.type} (touched ${z.strength}x)`);
  if (walls && walls.source !== "unavailable") {
    near(walls.call_wall, "options call wall");
    near(walls.put_wall, "options put wall");
  }
  return { count: hits.length, signals: hits };
}
