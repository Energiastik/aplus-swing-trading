"""Resolve a ticker to its TradingView symbol (EXCHANGE:TICKER) via yfinance's
exchange field. Shared by agent/push_to_db.py (direct Postgres write, for
interactive/manual use) and the automated routine (which annotates its results
JSON with tv_symbol before POSTing to the web app's ingest endpoint, since the
routine's sandbox has proven yfinance access but can't reach raw Postgres).

CLI usage (mutates the file in place, adding tv_symbol to every top10[] and
verdicts[] entry):
    python -m agent.tv_symbol output/results_2026-08-08.json
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

import yfinance as yf

# yfinance `exchange` field -> TradingView exchange prefix. Our screener's
# market-cap floor (>$2B) means this small, hand-verified set covers the
# realistic universe; an unmapped code falls back to a bare ticker (still
# usually resolves correctly in TradingView's own widget, just less certain).
EXCHANGE_MAP = {
    "NMS": "NASDAQ", "NGM": "NASDAQ", "NCM": "NASDAQ",  # Nasdaq Global Select/Global/Capital
    "NYQ": "NYSE",
    "ASE": "AMEX",   # NYSE American
    "PCX": "AMEX",   # NYSE Arca
}

_cache: dict[str, str] = {}


def resolve_tv_symbol(ticker: str) -> str:
    if ticker in _cache:
        return _cache[ticker]
    try:
        info = yf.Ticker(ticker).get_info()
        exch = info.get("exchange", "")
        prefix = EXCHANGE_MAP.get(exch)
        symbol = f"{prefix}:{ticker}" if prefix else ticker
    except Exception:
        symbol = ticker
    _cache[ticker] = symbol
    return symbol


def annotate_file(results_path: str | Path) -> None:
    path = Path(results_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    for c in data.get("top10", []):
        if c.get("ticker"):
            c["tv_symbol"] = resolve_tv_symbol(c["ticker"])
    for v in data.get("verdicts", []):
        if v.get("ticker"):
            v["tv_symbol"] = resolve_tv_symbol(v["ticker"])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m agent.tv_symbol <results.json>", file=sys.stderr)
        sys.exit(1)
    annotate_file(sys.argv[1])
    print(f"Annotated tv_symbol in {sys.argv[1]}")


if __name__ == "__main__":
    main()
