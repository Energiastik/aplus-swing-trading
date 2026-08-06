"""Data layer — yfinance OHLCV + fundamentals, with simple on-disk caching."""
from __future__ import annotations
import time
from pathlib import Path
import pandas as pd
import yfinance as yf

CACHE = Path(__file__).resolve().parent.parent / "output" / "_cache"
CACHE.mkdir(parents=True, exist_ok=True)


def history(ticker: str, period: str = "2y", interval: str = "1d",
            max_age_hours: float = 12) -> pd.DataFrame:
    """Daily OHLCV for one ticker, cached as parquet."""
    f = CACHE / f"{ticker.replace('^','_')}_{period}_{interval}.parquet"
    if f.exists() and (time.time() - f.stat().st_mtime) < max_age_hours * 3600:
        return pd.read_parquet(f)
    df = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.rename(columns=str.title)
    try:
        df.to_parquet(f)
    except Exception:
        pass
    return df


def batch_history(tickers: list[str], period: str = "1y") -> dict[str, pd.DataFrame]:
    """Download many tickers at once; returns {ticker: df}."""
    out: dict[str, pd.DataFrame] = {}
    if not tickers:
        return out
    raw = yf.download(tickers, period=period, interval="1d", auto_adjust=True,
                      group_by="ticker", threads=True, progress=False)
    if len(tickers) == 1:
        out[tickers[0]] = raw
        return out
    for t in tickers:
        try:
            df = raw[t].dropna(how="all")
            if not df.empty:
                out[t] = df
        except Exception:
            continue
    return out


def info(ticker: str) -> dict:
    try:
        return yf.Ticker(ticker).info or {}
    except Exception:
        return {}


def balance_sheet(ticker: str) -> pd.DataFrame:
    try:
        bs = yf.Ticker(ticker).balance_sheet
        return bs if bs is not None else pd.DataFrame()
    except Exception:
        return pd.DataFrame()


def next_earnings_days(ticker: str) -> float | None:
    """Days until next earnings, or None."""
    try:
        cal = yf.Ticker(ticker).calendar
        dates = cal.get("Earnings Date") if isinstance(cal, dict) else None
        if dates:
            d = pd.Timestamp(dates[0])
            return (d - pd.Timestamp.now().normalize()).days
    except Exception:
        pass
    return None
