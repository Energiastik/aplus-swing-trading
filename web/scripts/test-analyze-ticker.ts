import { analyzeTicker } from "../lib/analyzeTicker";
import type { VisionGrade } from "../lib/visionGrade";

// Same fixed stub shape used for the Python cross-check earlier this session.
async function fakeGrade(_ticker: string, _chartImageDataUri: string | null, context: Record<string, any>): Promise<VisionGrade> {
  const price = context.price as number;
  return {
    grade: "B", stage: 2, trend: "uptrend", pattern: "flag", base_number: 2,
    vcp: true, vdu: (context.vol_ratio ?? 1) < 0.7,
    extended_pct_from_pivot: context.dist_to_pivot_pct, equal_highs_risk: false,
    room_to_target: "clear", entry_type: "standard",
    entry: Math.round(price * 0.99 * 100) / 100,
    stop: Math.round(price * 0.93 * 100) / 100,
    target: Math.round(price * 1.12 * 100) / 100,
    note: "[STUBBED VISION -- not a real Claude grading]",
    justification_ru: "[СТУБ] Структура в порядке, но пока нет чёткого триггера — ждём отката к EMA21 на затухающем объёме или пробоя пивота с подтверждением объёмом.",
    justification_en: "[STUB] Structure is fine but there's no clean trigger yet -- waiting for a pullback to EMA21 on lighter volume, or a pivot breakout confirmed by volume.",
  };
}

async function main() {
  for (const ticker of ["AAPL", "NVDA", "KO", "BRZE", "SAIL", "INTC", "PYPL"]) {
    console.log(`\n${"=".repeat(60)}\n${ticker}\n${"=".repeat(60)}`);
    try {
      const v = await analyzeTicker(ticker, null, fakeGrade);
      const { aplus_detail, confluence_signals, ...rest } = v;
      console.log(JSON.stringify(rest, null, 2));
    } catch (e) {
      console.error(e);
    }
  }
}
main();
