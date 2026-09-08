import { scoreSectors } from "../lib/sectorRotation";

async function main() {
  const rows = await scoreSectors();
  rows.sort((a, b) => b.weighted - a.weighted || b["4W_vs_SPY"] - a["4W_vs_SPY"]);
  for (const r of rows) {
    console.log(r.etf.padEnd(5), r.sector.padEnd(24), "raw=" + r.raw_score, "weighted=" + r.weighted, "4W_vs_SPY=" + r["4W_vs_SPY"].toFixed(2));
  }
}
main();
