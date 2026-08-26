"""Stage 1–3 funnel (Day 4: 11,500 -> ~13).

Primary: Finviz via finvizfinance (mirrors the exact in-class filter build).
Fallback: local universe CSV (data/sp500.csv or your own watchlist) filtered with yfinance.
"""
from __future__ import annotations
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent

FINVIZ_FILTERS = {
    # Stage 1 — basics
    "Price": "Over $5",
    "Market Cap.": "+Mid (over $2bln)",
    "Average Volume": "Over 750K",
    # Stage 2 — fundamental
    "EPS growththis year": "Over 20%",
    "EPS growthnext year": "Over 15%",
    "Forward P/E": "Under 50",
    "Sales growthqtr over qtr": "Over 20%",
    "Analyst Recom.": "Buy or better",
    # Stage 3 — technical
    "20-Day Simple Moving Average": "Price above SMA20",
    "50-Day Simple Moving Average": "Price above SMA50",
    "200-Day Simple Moving Average": "Price above SMA200",
    "Volatility": "Month - Over 5%",
}


def run_finviz(limit: int = 60) -> pd.DataFrame:
    from finvizfinance.screener.overview import Overview
    s = Overview()
    s.set_filter(filters_dict=FINVIZ_FILTERS)
    df = s.screener_view(order="Relative Strength Index (14)", verbose=0)
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.rename(columns={"Ticker": "ticker", "Sector": "sector",
                            "Industry": "industry", "Price": "price"})
    # finvizfinance 1.3.0 scraper bug: the Ticker cell text comes back with its first
    # character duplicated (e.g. "BBRZE" for Braze/BRZE, "AANET" for Arista/ANET).
    # Verified against yfinance company-name lookups — stripping the extra leading
    # char recovers the real symbol in every observed case.
    df["ticker"] = df["ticker"].astype(str).str.slice(1)
    # Stage 3b: Price x Volume > $10M -- deliberately NOT using this table's own
    # "Volume" column. That column is Finviz's live/current-session volume, not an
    # average -- this routine typically runs pre-market (well before the 9:30am ET
    # open), so it's near-zero noise unrelated to real liquidity (verified: DELL's
    # real 20-day average volume is ~5.5M/day, but a pre-market scrape showed 7,480
    # for its "Volume" cell -- three orders of magnitude off, and it would have
    # silently failed a >$10M dollar-volume check for a genuinely liquid stock).
    # Recompute from yfinance's real 20-day average volume instead, same approach
    # run_fallback() below already uses.
    from . import data
    tickers = df["ticker"].tolist()
    hists = data.batch_history(tickers, period="1mo")
    keep = []
    for _, row in df.iterrows():
        h = hists.get(row["ticker"])
        if h is None or h.empty:
            continue
        avg_vol = float(h["Volume"].iloc[-20:].mean())
        price = pd.to_numeric(row["price"], errors="coerce")
        if pd.notna(price) and avg_vol * price > 10_000_000:
            keep.append(row["ticker"])
    df = df[df["ticker"].isin(keep)]
    return df.head(limit)[["ticker", "sector", "industry", "price"]].reset_index(drop=True)


def run_fallback(universe_csv: str | None = None, limit: int = 60) -> pd.DataFrame:
    """No Finviz? Filter a local universe on the technical funnel with yfinance.
    (Fundamental growth filters are then applied later from yf info in ranking.)"""
    from . import data
    from .technicals import sma
    path = Path(universe_csv) if universe_csv else ROOT / "data" / "sp500.csv"
    uni = pd.read_csv(path)
    tcol = "Symbol" if "Symbol" in uni.columns else uni.columns[0]
    scol = "GICS Sector" if "GICS Sector" in uni.columns else None
    tickers = [t.replace(".", "-") for t in uni[tcol].astype(str).tolist()]
    hists = data.batch_history(tickers, period="1y")
    rows = []
    for t, df in hists.items():
        if len(df) < 200:
            continue
        c = df["Close"]
        price = float(c.iloc[-1])
        if price < 5:
            continue
        if not (price > sma(c, 20).iloc[-1] > 0 and price > sma(c, 50).iloc[-1]
                and price > sma(c, 200).iloc[-1]):
            continue
        vol = float(df["Volume"].iloc[-20:].mean())
        if vol < 750_000 or price * vol < 10_000_000:
            continue
        # monthly volatility proxy >= 4%
        rng = ((df["High"] - df["Low"]) / c).iloc[-21:].mean()
        if rng < 0.02:
            continue
        sector = ""
        if scol is not None:
            m = uni[uni[tcol].str.replace(".", "-", regex=False) == t]
            if not m.empty:
                sector = str(m.iloc[0][scol])
        rows.append({"ticker": t, "sector": sector, "industry": "", "price": price})
    return pd.DataFrame(rows).head(limit)


def run(universe_csv: str | None = None, limit: int = 60) -> tuple[pd.DataFrame, str]:
    try:
        df = run_finviz(limit)
        if not df.empty:
            return df, "finviz"
    except Exception as e:
        print(f"[screener] finviz unavailable ({e}); using fallback universe")
    return run_fallback(universe_csv, limit), "fallback"
