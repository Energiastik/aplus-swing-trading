/** Theme ETF names, verbatim from sector-rotation/config.py's THEME_ETFS
 * dict (including its "Cibersecurity" typo -- that's the exact string
 * stored in the rrg_points.name column, so it must match here too). */
export const THEME_NAMES = [
  "Semiconductors", "Biotech", "Cibersecurity", "Drones", "Rare Earths",
  "Robotics", "Oil & Gas", "Metals & Mining", "Software & Services",
  "Tech-Software", "Solar", "Bitcoin Miners", "Photonics", "Mag7",
] as const;

// Mag7 isn't an industry classification -- it's a fixed list of 7 tickers,
// mapped exactly rather than approximated.
const MAG7_TICKERS = new Set(["AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA"]);

/** Best-effort mapping from Yahoo Finance's `industry` field (a GICS
 * sub-industry-like string) to one of the 14 theme names above. Approximate
 * by nature -- this is NOT true ETF-holdings membership (only
 * sector-rotation/data_fetch.py's SSGA-holdings fetch is that precise, and
 * that's Python-only, not reachable from this Vercel deployment). Only
 * industries with with a confident, unambiguous match are listed;
 * Cibersecurity/Drones/Rare Earths/Robotics/Bitcoin Miners/Photonics/
 * Software & Services aren't included because Yahoo's industry taxonomy
 * doesn't cleanly separate them from broader neighboring industries --
 * better to report "no theme match" than guess. */
const INDUSTRY_TO_THEME: Record<string, string> = {
  "Semiconductors": "Semiconductors",
  "Semiconductor Equipment & Materials": "Semiconductors",
  "Biotechnology": "Biotech",
  "Oil & Gas E&P": "Oil & Gas",
  "Oil & Gas Midstream": "Oil & Gas",
  "Oil & Gas Integrated": "Oil & Gas",
  "Oil & Gas Refining & Marketing": "Oil & Gas",
  "Oil & Gas Equipment & Services": "Oil & Gas",
  "Oil & Gas Drilling": "Oil & Gas",
  "Gold": "Metals & Mining",
  "Silver": "Metals & Mining",
  "Copper": "Metals & Mining",
  "Steel": "Metals & Mining",
  "Other Industrial Metals & Mining": "Metals & Mining",
  "Other Precious Metals & Mining": "Metals & Mining",
  "Solar": "Solar",
  "Software—Infrastructure": "Tech-Software",
  "Software—Application": "Tech-Software",
};

export interface ThemeMatch {
  theme: string;
  confidence: "exact" | "approximate";
}

export function mapToTheme(ticker: string, industry: string | null): ThemeMatch | null {
  if (MAG7_TICKERS.has(ticker.toUpperCase())) return { theme: "Mag7", confidence: "exact" };
  if (industry && INDUSTRY_TO_THEME[industry]) return { theme: INDUSTRY_TO_THEME[industry], confidence: "approximate" };
  return null;
}
