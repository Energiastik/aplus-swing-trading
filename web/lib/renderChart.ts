/** Renders an actual candlestick chart (SVG, rasterized to PNG via `sharp`
 * -- already a transitive dependency via Next.js's image optimization, so
 * no new native dependency) so the grading call can genuinely look at the
 * chart, the same idea as agent/chart_vision.py's render_chart(), not just
 * read numbers about it. Colors/overlays mirror that module: EMA 9/21/50/
 * 200 (blue/orange/purple/red), historical S/R zones (pink/green dashed),
 * Fibonacci 38.2/50/61.8% (yellow dashed), volume-profile POC/VAH/VAL
 * (cyan dashed), anchored VWAP (gold). */
import sharp from "sharp";
import type { Bar } from "./marketData";
import { ema, type TechRead } from "./technicals";

const W = 1000;
const H_PRICE = 520;
const H_VOL = 140;
const H = H_PRICE + H_VOL;
const MARGIN = { top: 42, right: 70, bottom: 10, left: 10 };
const MONTHS = 9;

function anchoredVwapSeries(bars: Bar[], anchorDate: string): number[] {
  const anchorIdx = bars.findIndex((b) => b.date === anchorDate);
  if (anchorIdx < 0) return bars.map(() => NaN);
  const out = new Array(bars.length).fill(NaN);
  let cumTypVol = 0;
  let cumVol = 0;
  for (let i = anchorIdx; i < bars.length; i++) {
    const b = bars[i];
    const typical = (b.high + b.low + b.close) / 3;
    cumTypVol += typical * b.volume;
    cumVol += b.volume;
    out[i] = cumVol > 0 ? cumTypVol / cumVol : NaN;
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/** Renders the chart and returns a base64-encoded PNG data URI, ready to
 * pass straight into an OpenAI vision content part. */
export async function renderChartPng(ticker: string, bars: Bar[], t: TechRead): Promise<string> {
  const closes = bars.map((b) => b.close);
  const ema9 = ema(closes, 9), ema21 = ema(closes, 21), ema50 = ema(closes, 50), ema200 = ema(closes, 200);
  const vwapSeries = t.vwap_anchor_date ? anchoredVwapSeries(bars, t.vwap_anchor_date) : null;

  const sliceLen = Math.min(bars.length, MONTHS * 21);
  const start = bars.length - sliceLen;
  const d = bars.slice(start);
  const dEma9 = ema9.slice(start), dEma21 = ema21.slice(start), dEma50 = ema50.slice(start), dEma200 = ema200.slice(start);
  const dVwap = vwapSeries ? vwapSeries.slice(start) : null;

  const priceLo = Math.min(...d.map((b) => b.low));
  const priceHi = Math.max(...d.map((b) => b.high));
  const pad = (priceHi - priceLo) * 0.04;
  const yMin = priceLo - pad, yMax = priceHi + pad;

  const volMax = Math.max(...d.map((b) => b.volume), 1);

  const plotW = W - MARGIN.left - MARGIN.right;
  const plotX = (i: number) => MARGIN.left + (i / (d.length - 1 || 1)) * plotW;
  const priceY = (p: number) => MARGIN.top + (1 - (p - yMin) / (yMax - yMin)) * H_PRICE;
  const volY = (v: number) => H_PRICE + H_VOL - (v / volMax) * (H_VOL - 10);
  const candleW = Math.max(1.5, (plotW / d.length) * 0.6);

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#0b0f1a"/>`);
  parts.push(`<text x="${MARGIN.left}" y="14" font-family="monospace" font-size="12" fill="#cbd5e1">${esc(ticker)} — Daily, S/R, Fib, VWAP, POC/VA</text>`);

  // On-image legend -- relying on the model to remember a text-described
  // color mapping (blue/orange/purple/red/gold) was producing real misreads
  // (e.g. confusing the gold VWAP line for an EMA and misjudging price vs.
  // EMA200 on a chart where the numbers were actually correct). A swatch +
  // label directly on the chart removes that ambiguity.
  const legend: [string, string][] = [
    ["EMA9", "#4fc3f7"], ["EMA21", "#ffb74d"], ["EMA50", "#ba68c8"], ["EMA200", "#e57373"], ["VWAP", "#d4af37"],
  ];
  let lx = MARGIN.left;
  const ly = 30;
  for (const [label, color] of legend) {
    parts.push(`<line x1="${lx}" y1="${ly - 4}" x2="${lx + 18}" y2="${ly - 4}" stroke="${color}" stroke-width="2.5"/>`);
    parts.push(`<text x="${lx + 22}" y="${ly}" font-family="monospace" font-size="11" fill="${color}">${label}</text>`);
    lx += 22 + label.length * 6.5 + 16;
  }

  // Y-axis gridlines + price labels
  for (let i = 0; i <= 5; i++) {
    const p = yMin + ((yMax - yMin) * i) / 5;
    const y = priceY(p);
    parts.push(`<line x1="${MARGIN.left}" y1="${y}" x2="${W - MARGIN.right}" y2="${y}" stroke="#1f2937" stroke-width="1"/>`);
    parts.push(`<text x="${W - MARGIN.right + 6}" y="${y + 3}" font-family="monospace" font-size="10" fill="#94a3b8">${p.toFixed(2)}</text>`);
  }

  // Historical S/R zones (top 3, pink=resistance/green=support), only if in the visible range
  const visLo = priceLo * 0.97, visHi = priceHi * 1.03;
  for (const z of t.sr_zones.slice(0, 3)) {
    if (z.level < visLo || z.level > visHi) continue;
    const y = priceY(z.level);
    const color = z.type === "resistance" ? "#ff4081" : "#00e676";
    parts.push(`<line x1="${MARGIN.left}" y1="${y}" x2="${W - MARGIN.right}" y2="${y}" stroke="${color}" stroke-width="${0.7 + 0.35 * z.strength}" stroke-dasharray="6 4" opacity="0.8"/>`);
  }
  // Fibonacci levels (yellow dashed)
  for (const lvl of [t.fib_382, t.fib_500, t.fib_618]) {
    if (lvl == null || lvl < visLo || lvl > visHi) continue;
    const y = priceY(lvl);
    parts.push(`<line x1="${MARGIN.left}" y1="${y}" x2="${W - MARGIN.right}" y2="${y}" stroke="#fff176" stroke-width="0.8" stroke-dasharray="4 4" opacity="0.7"/>`);
  }
  // Volume-profile POC/VAH/VAL (cyan dashed)
  for (const lvl of [t.poc, t.vah, t.val]) {
    if (lvl == null || lvl < visLo || lvl > visHi) continue;
    const y = priceY(lvl);
    parts.push(`<line x1="${MARGIN.left}" y1="${y}" x2="${W - MARGIN.right}" y2="${y}" stroke="#00e5ff" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.7"/>`);
  }

  // Candles
  for (let i = 0; i < d.length; i++) {
    const b = d[i];
    const x = plotX(i);
    const up = b.close >= b.open;
    const color = up ? "#26a69a" : "#78909c";
    parts.push(`<line x1="${x}" y1="${priceY(b.high)}" x2="${x}" y2="${priceY(b.low)}" stroke="${color}" stroke-width="1"/>`);
    const yTop = priceY(Math.max(b.open, b.close));
    const bodyH = Math.max(0.8, Math.abs(priceY(b.open) - priceY(b.close)));
    parts.push(`<rect x="${x - candleW / 2}" y="${yTop}" width="${candleW}" height="${bodyH}" fill="${color}"/>`);
    // volume bar
    parts.push(`<rect x="${x - candleW / 2}" y="${volY(b.volume)}" width="${candleW}" height="${H_PRICE + H_VOL - volY(b.volume)}" fill="${color}" opacity="0.6"/>`);
  }

  // EMA lines
  const emaLine = (series: number[], color: string, width: number) => {
    const pts = series.map((v, i) => `${plotX(i)},${priceY(v)}`).join(" ");
    parts.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${width}"/>`);
  };
  emaLine(dEma9, "#4fc3f7", 1.1);
  emaLine(dEma21, "#ffb74d", 1.3);
  emaLine(dEma50, "#ba68c8", 1.4);
  emaLine(dEma200, "#e57373", 1.6);

  // Anchored VWAP (gold, only from its anchor date forward)
  if (dVwap) {
    const validPts = dVwap.map((v, i) => (isNaN(v) ? null : `${plotX(i)},${priceY(v)}`)).filter((p): p is string => p !== null);
    if (validPts.length > 1) parts.push(`<polyline points="${validPts.join(" ")}" fill="none" stroke="#d4af37" stroke-width="1.3" stroke-dasharray="8 4"/>`);
  }

  parts.push(`</svg>`);
  const svg = parts.join("");
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}
