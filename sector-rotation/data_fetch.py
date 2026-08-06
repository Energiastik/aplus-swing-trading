"""Real-data fetch layer: S&P 500 roster (for sector membership/breadth) and
daily OHLCV price history (via yfinance). Everything is cached to disk so
repeated runs on the same day don't re-hit the network.
"""
from __future__ import annotations

import datetime as dt
import io
import time

import pandas as pd
import requests
import yfinance as yf

import config

WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
CONSTITUENTS_CACHE = config.DATA_DIR / "sp500_constituents.csv"
PRICES_CACHE_TMPL = str(config.DATA_DIR / "prices_{date}.parquet")


def _cache_is_fresh(path, max_age_hours: float) -> bool:
    if not path.exists():
        return False
    age_hours = (time.time() - path.stat().st_mtime) / 3600
    return age_hours < max_age_hours


def get_sp500_constituents(refresh: bool = False) -> pd.DataFrame:
    """Return a DataFrame with columns [Symbol, Sector] for the current
    S&P 500 roster, scraped from Wikipedia and cached to CSV."""
    if not refresh and _cache_is_fresh(CONSTITUENTS_CACHE, config.CACHE_MAX_AGE_HOURS):
        return pd.read_csv(CONSTITUENTS_CACHE)

    # yfinance/pandas.read_html can be blocked by Wikipedia's bot filter
    # without a real User-Agent header, so fetch the HTML ourselves first.
    resp = requests.get(WIKI_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    resp.raise_for_status()
    tables = pd.read_html(io.StringIO(resp.text))
    table = tables[0]
    table = table.rename(columns={"Symbol": "Symbol", "GICS Sector": "Sector"})
    table["Symbol"] = table["Symbol"].str.replace(".", "-", regex=False)  # yfinance format, e.g. BRK.B -> BRK-B
    out = table[["Symbol", "Sector"]].dropna()
    out.to_csv(CONSTITUENTS_CACHE, index=False)
    return out


_VALID_TICKER_RE = r"^[A-Z]{1,6}$"


def get_etf_holdings(etf_ticker: str, refresh: bool = False) -> list[str]:
    """Return the current constituent tickers of a State Street SPDR ETF,
    fetched from SSGA's daily holdings file and cached to CSV."""
    cache_path = config.DATA_DIR / f"holdings_{etf_ticker.lower()}.csv"
    if not refresh and _cache_is_fresh(cache_path, config.CACHE_MAX_AGE_HOURS):
        return pd.read_csv(cache_path)["Ticker"].tolist()

    url = config.SSGA_HOLDINGS_URL_TMPL.format(ticker=etf_ticker.lower())
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    resp.raise_for_status()

    df = pd.read_excel(io.BytesIO(resp.content), skiprows=4)
    df = df.dropna(subset=["Ticker"])
    df = df[df["Ticker"].str.match(_VALID_TICKER_RE, na=False)]  # drops cash/footer rows like "-"
    tickers = sorted(set(df["Ticker"].str.replace(".", "-", regex=False)))

    pd.DataFrame({"Ticker": tickers}).to_csv(cache_path, index=False)
    return tickers


def download_price_history(tickers: list[str], refresh: bool = False) -> pd.DataFrame:
    """Download daily OHLCV for `tickers` over config.PRICE_HISTORY_PERIOD.
    Returns a wide DataFrame with a MultiIndex column (ticker, field).
    Cached per calendar day since EOD data doesn't change intraday->intraday.
    """
    today = dt.date.today().isoformat()
    cache_path = config.DATA_DIR / PRICES_CACHE_TMPL.format(date=today)

    if not refresh and cache_path.exists():
        cached = pd.read_parquet(cache_path)
        cached_tickers = set(cached.columns.get_level_values(0))
        if set(tickers) <= cached_tickers:
            return cached.loc[:, (sorted(tickers), slice(None))]

    data = yf.download(
        tickers,
        period=config.PRICE_HISTORY_PERIOD,
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        threads=True,
        progress=False,
    )

    if isinstance(data.columns, pd.MultiIndex) and data.columns.nlevels == 2:
        # yfinance sometimes returns (field, ticker) ordering for a single
        # ticker; normalize to (ticker, field) for consistency.
        if data.columns.get_level_values(0).isin(["Open", "High", "Low", "Close", "Volume"]).any():
            data = data.swaplevel(0, 1, axis=1)
    else:
        # Single ticker returned a flat column index.
        data.columns = pd.MultiIndex.from_product([tickers, data.columns])

    data = data.sort_index(axis=1)
    data.to_parquet(cache_path)
    return data
