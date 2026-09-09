import { gradeFromNumbers } from "../lib/visionGrade";

async function main() {
  const grade = await gradeFromNumbers("NVDA", {
    price: 230.36, ema9: 222.89, ema21: 219.04, ema50: 213.81, ema200: 197.68,
    rsi14: 60.39, atr_pct: 3.20, pivot: 230.47, dist_to_pivot_pct: -0.05,
    vol_ratio: 1.03, vdu: false, fib_382: 214.93, fib_500: 210.14, fib_618: 205.34,
    vwap_anchor: 224.35, poc: 211.29, val: 202.0, vah: 225.23,
  });
  console.log(JSON.stringify(grade, null, 2));
}
main();
