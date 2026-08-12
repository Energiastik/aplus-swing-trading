"""Enrich a results JSON with data only available via a live yfinance lookup:
each ticker's TradingView symbol (EXCHANGE:TICKER), and -- for top10 entries
only -- fundamentals (P/E, forward P/E, revenue+growth, EPS+growth, debt/equity,
business summary) and up to 3 recent news items. Shared by agent/push_to_db.py
(direct Postgres write, for interactive/manual use) and the automated routine
(which annotates its results JSON before POSTing to the web app's ingest
endpoint, since the routine's sandbox has proven yfinance access but can't
reach raw Postgres).

CLI usage (mutates the file in place):
    python -m agent.tv_symbol output/results_2026-08-08.json
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

import yf_compat
yf_compat.patch()
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

_info_cache: dict[str, dict] = {}
_tv_cache: dict[str, str] = {}


def _get_info(ticker: str) -> dict:
    if ticker not in _info_cache:
        try:
            _info_cache[ticker] = yf.Ticker(ticker).get_info()
        except Exception:
            _info_cache[ticker] = {}
    return _info_cache[ticker]


def resolve_tv_symbol(ticker: str) -> str:
    if ticker in _tv_cache:
        return _tv_cache[ticker]
    info = _get_info(ticker)
    exch = info.get("exchange", "")
    prefix = EXCHANGE_MAP.get(exch)
    symbol = f"{prefix}:{ticker}" if prefix else ticker
    _tv_cache[ticker] = symbol
    return symbol


def fetch_fundamentals(ticker: str) -> dict:
    info = _get_info(ticker)
    return {
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "revenue_usd": info.get("totalRevenue"),
        "revenue_growth": info.get("revenueGrowth"),
        "eps": info.get("trailingEps"),
        "eps_growth": info.get("earningsGrowth"),
        "debt_to_equity": info.get("debtToEquity"),
        "business_summary": info.get("longBusinessSummary"),
    }


def fetch_news(ticker: str, limit: int = 3) -> list[dict]:
    try:
        items = yf.Ticker(ticker).news or []
    except Exception:
        return []
    out = []
    for item in items[:limit]:
        c = item.get("content", {})
        out.append({
            "title": c.get("title"),
            "url": (c.get("canonicalUrl") or {}).get("url"),
            "published_at": c.get("pubDate"),
            "summary": (c.get("summary") or "")[:400],
        })
    return out


def annotate_file(results_path: str | Path) -> None:
    path = Path(results_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    for c in data.get("top10", []):
        if c.get("ticker"):
            c["tv_symbol"] = resolve_tv_symbol(c["ticker"])
            c.update(fetch_fundamentals(c["ticker"]))
            c["news"] = fetch_news(c["ticker"])
    for v in data.get("verdicts", []):
        if v.get("ticker"):
            v["tv_symbol"] = resolve_tv_symbol(v["ticker"])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m agent.tv_symbol <results.json>", file=sys.stderr)
        sys.exit(1)
    annotate_file(sys.argv[1])
    print(f"Annotated tv_symbol + fundamentals + news in {sys.argv[1]}")


if __name__ == "__main__":
    main()
