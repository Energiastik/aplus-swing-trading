import { fetchDailyBars } from "../lib/marketData";
import { readTechnicals } from "../lib/technicals";

// Real reference values from agent/technicals.read() on NVDA, captured live
// via Python this same session (see commit message for the raw dump).
const REF = {
  price: 230.36000061035156,
  ema9: 222.88834453715975,
  ema21: 219.04108974086327,
  ema50: 213.8113566404815,
  ema200: 197.67544748130322,
  rsi14: 60.392962410868115,
  atr14: 7.3806368206559165,
  atr_pct: 3.2039576320109875,
  vol_ratio: 1.0275656680669303,
  pivot: 230.47000122070312,
  dist_to_pivot_pct: -0.047728819268855194,
  pullback_low: 207.25,
  rs_raw: 0.2219496598458665,
  rally_low: 189.8000030517578,
  fib_382: 214.93406192016602,
  fib_500: 210.13500213623047,
  fib_618: 205.33594235229492,
  vwap_anchor: 224.3495685019139,
  poc: 211.29,
  val: 202.0,
  vah: 225.23,
};

function pctDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.abs(b) * 100;
}

async function main() {
  const bars = await fetchDailyBars("NVDA", "2y");
  console.log("bars fetched:", bars.length, "last date:", bars[bars.length - 1]?.date);
  const t = readTechnicals(bars);

  let maxDiff = 0;
  for (const [key, refVal] of Object.entries(REF)) {
    const tsVal = (t as any)[key];
    const diff = typeof tsVal === "number" ? pctDiff(tsVal, refVal) : NaN;
    maxDiff = Math.max(maxDiff, diff || 0);
    const flag = diff > 0.5 ? "  <-- CHECK" : "";
    console.log(`${key.padEnd(20)} ts=${String(tsVal).slice(0, 20).padEnd(20)} py=${String(refVal).slice(0, 20).padEnd(20)} diff=${diff.toFixed(3)}%${flag}`);
  }
  console.log("\nmax pct diff across all fields:", maxDiff.toFixed(3) + "%");
  console.log("stacked:", t.stacked, "above_200:", t.above_200, "extended:", t.extended, "vdu:", t.vdu, "rsi_ok:", t.rsi_ok);
  console.log("sr_zones:", JSON.stringify(t.sr_zones, null, 1));
}

main();
