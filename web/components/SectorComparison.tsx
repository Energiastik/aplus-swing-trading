import TradingViewWidget from "./TradingViewWidget";

// All 11 SPDR sector ETFs, real TradingView symbols resolved via yfinance's
// exchange field (see agent/tv_symbol.py) -- all trade on NYSE Arca, which
// TradingView addresses as AMEX.
const SECTOR_SYMBOLS = [
  "AMEX:XLK", "AMEX:XLF", "AMEX:XLE", "AMEX:XLY", "AMEX:XLP",
  "AMEX:XLV", "AMEX:XLI", "AMEX:XLB", "AMEX:XLU", "AMEX:XLRE", "AMEX:XLC",
];

export default function SectorComparison() {
  return (
    <section className="panel">
      <h2>Секторы против SPY</h2>
      <p className="meta-line" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
        Все 11 секторов наложены на один график в процентах от SPY. Кликните
        по тикеру в легенде справа, чтобы скрыть/показать его. Кнопки под
        графиком (5Д, 1М, 3М и т.д.) переключают период сравнения.
      </p>
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
    </section>
  );
}
