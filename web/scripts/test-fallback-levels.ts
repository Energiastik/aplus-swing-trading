import { analyzeTicker } from "../lib/analyzeTicker";
import type { VisionGrade } from "../lib/visionGrade";

// Simulates exactly what was likely happening in production: the grading
// call returns a valid grade but no entry plan (entry_type "none", null
// stop/target) -- a legitimate, non-error response the old code silently
// turned into an unexplained "R/R n/a" PASS.
async function noplanGrade(_ticker: string, _context: Record<string, any>): Promise<VisionGrade> {
  return {
    grade: "C", stage: 1, trend: "range", pattern: "none", base_number: null,
    vcp: false, vdu: false, extended_pct_from_pivot: null, equal_highs_risk: false,
    room_to_target: "unclear", entry_type: "none",
    entry: null, stop: null, target: null,
    note: "Numbers alone don't show a clear base or trigger -- would want the actual chart.",
  };
}

async function main() {
  const v = await analyzeTicker("TEM", null, noplanGrade);
  console.log(JSON.stringify(v, null, 2));
  console.log("\n--- key check ---");
  console.log("used_fallback_levels:", v.used_fallback_levels, "(expect true)");
  console.log("entry/stop/target now populated:", v.entry, v.stop, v.target);
  console.log("rr computed from fallback levels:", v.rr);
  console.log("verdict:", v.verdict, "reason:", v.reason);
}
main();
