"use client";

import TradingViewWidget from "./TradingViewWidget";
import { OrbitAccent } from "./Accents";
import { useLanguage } from "@/lib/i18n";

// All 11 SPDR sector ETFs, real TradingView symbols resolved via yfinance's
// exchange field (see agent/tv_symbol.py) -- all trade on NYSE Arca, which
// TradingView addresses as AMEX.
const SECTOR_SYMBOLS = [
  "AMEX:XLK", "AMEX:XLF", "AMEX:XLE", "AMEX:XLY", "AMEX:XLP",
  "AMEX:XLV", "AMEX:XLI", "AMEX:XLB", "AMEX:XLU", "AMEX:XLRE", "AMEX:XLC",
];

export default function SectorComparison() {
  const { t } = useLanguage();
  return (
    <section className="panel">
      <h2>
        <OrbitAccent />
        {t("sector_vs_spy")}
      </h2>
      <p className="meta-line" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
        {t("sector_vs_spy_note")}
      </p>
      <div className="tv-frame">
        <span className="tv-sweep" />
        <TradingViewWidget
          symbol="AMEX:SPY"
          height={620}
          config={{
            percentage: true,
            withdateranges: true,
            range: "1M",
            studies: [],
            compareSymbols: SECTOR_SYMBOLS.map((symbol) => ({
              symbol,
              position: "SameScale",
            })),
          }}
        />
      </div>
    </section>
  );
}
