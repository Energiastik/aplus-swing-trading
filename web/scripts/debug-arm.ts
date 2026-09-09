import { fetchDailyBars } from "../lib/marketData";
import { readTechnicals } from "../lib/technicals";
import { renderChartPng } from "../lib/renderChart";
import fs from "fs";

async function main() {
  const bars = await fetchDailyBars("ARM", "2y");
  console.log("bars fetched:", bars.length, "last date:", bars[bars.length - 1]?.date);
  console.log("last 5 bars:", bars.slice(-5));
  const t = readTechnicals(bars);
  console.log("price:", t.price);
  console.log("ema200:", t.ema200);
  console.log("above_200:", t.above_200);
  console.log("stacked:", t.stacked);
  console.log("ema9/21/50/200:", t.ema9, t.ema21, t.ema50, t.ema200);

  const chart = await renderChartPng("ARM", bars, t);
  const base64 = chart.split(",")[1];
  const outPath = "C:/Users/w2/AppData/Local/Temp/claude/c--Users-w2-Documents-VSCODE-swing-agent-swing-agent/27927789-c622-40d1-9181-63cb995dd940/scratchpad/chart-ARM.png";
  fs.writeFileSync(outPath, Buffer.from(base64, "base64"));
  console.log("wrote", outPath);
}
main();
