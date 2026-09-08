/** Port of agent/sector_rotation.py -- Gate #2, 11 ETFs vs SPY over 1W/4W/12W. */
import { fetchManyDailyBars } from "./marketData";

export const SECTOR_ETFS: Record<string, string> = {
  XLK: "Technology", XLY: "Consumer Discretionary", XLF: "Financials",
  XLI: "Industrials", XLE: "Energy", XLV: "Health Care",
  XLP: "Consumer Staples", XLU: "Utilities", XLRE: "Real Estate",
  XLB: "Materials", XLC: "Communication Services",
};
const PERIODS: Record<string, number> = { "1W": 5, "4W": 20, "12W": 60 };
const WEIGHTS: Record<string, number> = { "1W": 3, "4W": 2, "12W": 1 };

export interface SectorRow {
  etf: string;
  sector: string;
  raw_score: number;
  weighted: number;
  ["4W_vs_SPY"]: number;
}

function ret(closes: number[], n: number): number {
  // Matches sector_rotation.py's _ret(): close.iloc[-1]/close.iloc[-n-1]-1,
  // guarded by len(close) > n (i.e. last >= n).
  const last = closes.length - 1;
  if (last < n) return NaN;
  return closes[last] / closes[last - n] - 1;
}

export async function scoreSectors(): Promise<SectorRow[]> {
  const hists = await fetchManyDailyBars([...Object.keys(SECTOR_ETFS), "SPY"], "1y");
  const spy = hists["SPY"];
  if (!spy) return [];
  const spyCloses = spy.map((b) => b.close);

  const rows: SectorRow[] = [];
  for (const [etf, sector] of Object.entries(SECTOR_ETFS)) {
    const bars = hists[etf];
    if (!bars) continue;
    const closes = bars.map((b) => b.close);
    let raw = 0, weighted = 0;
    let ret4w = NaN;
    for (const [label, n] of Object.entries(PERIODS)) {
      const er = ret(closes, n);
      const sr = ret(spyCloses, n);
      const beat = er > sr;
      if (label === "4W") ret4w = (er - sr) * 100;
      raw += beat ? 1 : 0;
      weighted += beat ? WEIGHTS[label] : 0;
    }
    rows.push({ etf, sector, raw_score: raw, weighted, "4W_vs_SPY": ret4w });
  }
  return rows;
}
