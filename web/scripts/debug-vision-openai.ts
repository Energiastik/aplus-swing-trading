import { gradeChart } from "../lib/visionGrade";
import { fetchDailyBars } from "../lib/marketData";
import { readTechnicals } from "../lib/technicals";
import { renderChartPng } from "../lib/renderChart";

async function main() {
  const ticker = process.argv[2] || "NVDA";
  const bars = await fetchDailyBars(ticker, "2y");
  const t = readTechnicals(bars);
  const chart = await renderChartPng(ticker, bars, t);
  const grade = await gradeChart(ticker, chart, {
    price: t.price, ema9: t.ema9, ema21: t.ema21, ema50: t.ema50, ema200: t.ema200,
    rsi14: t.rsi14, atr_pct: t.atr_pct, pivot: t.pivot, dist_to_pivot_pct: t.dist_to_pivot_pct,
    vol_ratio: t.vol_ratio, vdu: t.vdu, fib_382: t.fib_382, fib_500: t.fib_500, fib_618: t.fib_618,
    vwap_anchor: t.vwap_anchor, poc: t.poc, val: t.val, vah: t.vah, sr_zones: t.sr_zones,
  });
  console.log(JSON.stringify(grade, null, 2));
}
main();
