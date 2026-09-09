import fs from "fs";
import { fetchDailyBars } from "../lib/marketData";
import { readTechnicals } from "../lib/technicals";
import { renderChartPng } from "../lib/renderChart";

async function main() {
  const ticker = process.argv[2] || "NVDA";
  const bars = await fetchDailyBars(ticker, "2y");
  const t = readTechnicals(bars);
  const dataUri = await renderChartPng(ticker, bars, t);
  const base64 = dataUri.split(",")[1];
  const outPath = `C:/Users/w2/AppData/Local/Temp/claude/c--Users-w2-Documents-VSCODE-swing-agent-swing-agent/27927789-c622-40d1-9181-63cb995dd940/scratchpad/chart-${ticker}.png`;
  fs.writeFileSync(outPath, Buffer.from(base64, "base64"));
  console.log("wrote", outPath, "bytes:", Buffer.from(base64, "base64").length);
}
main();
