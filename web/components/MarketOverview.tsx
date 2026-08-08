import TradingViewWidget from "./TradingViewWidget";

// Real TradingView symbols, resolved via yfinance's exchange field (see
// agent/tv_symbol.py) rather than guessed.
const INDICES: { label: string; symbol: string }[] = [
  { label: "S&P 500 (SPY)", symbol: "AMEX:SPY" },
  { label: "Nasdaq 100 (QQQ)", symbol: "NASDAQ:QQQ" },
  { label: "Dow Jones (DIA)", symbol: "AMEX:DIA" },
];

export default function MarketOverview() {
  return (
    <section className="panel">
      <h2>Быстрый обзор рынка</h2>
      <p className="meta-line" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
        2ч, 6 месяцев, EMA + объём. (Примечание: 4-часовой интервал недоступен в
        бесплатном виджете TradingView — он ограничен 2ч максимум для
        внутридневных графиков; это подтверждённое ограничение виджета, не
        настройка страницы.)
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
            <TradingViewWidget
              symbol={idx.symbol}
              height={320}
              config={{ interval: "120", range: "6M" }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
