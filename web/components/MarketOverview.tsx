"use client";

import TradingViewWidget from "./TradingViewWidget";
import { PulseAccent } from "./Accents";
import { useLanguage } from "@/lib/i18n";

// Real TradingView symbols, resolved via yfinance's exchange field (see
// agent/tv_symbol.py) rather than guessed.
const INDICES: { label: string; symbol: string }[] = [
  { label: "S&P 500 (SPY)", symbol: "AMEX:SPY" },
  { label: "Nasdaq 100 (QQQ)", symbol: "NASDAQ:QQQ" },
  { label: "Dow Jones (DIA)", symbol: "AMEX:DIA" },
];

export default function MarketOverview() {
  const { t } = useLanguage();
  return (
    <section className="panel">
      <h2>
        <PulseAccent />
        {t("market_overview")}
      </h2>
      <p className="meta-line" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
        {t("market_overview_note")}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1rem",
        }}
      >
        {INDICES.map((idx) => (
          <div key={idx.symbol}>
            <div
              style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                marginBottom: "0.4rem",
                fontWeight: 600,
              }}
            >
              {idx.label}
            </div>
            <div className="tv-frame">
              <span className="tv-sweep" />
              <TradingViewWidget
                symbol={idx.symbol}
                height={320}
                config={{ interval: "120", range: "6M", hide_side_toolbar: true }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
