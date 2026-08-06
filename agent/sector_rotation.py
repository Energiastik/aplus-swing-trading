"""Gate #2 — Sector rotation. 11 ETFs vs SPY over 1W/4W/12W, recency-weighted (3/2/1)."""
from __future__ import annotations
import pandas as pd
from . import data

SECTOR_ETFS = {
    "XLK": "Technology", "XLY": "Consumer Discretionary", "XLF": "Financials",
    "XLI": "Industrials", "XLE": "Energy", "XLV": "Health Care",
    "XLP": "Consumer Staples", "XLU": "Utilities", "XLRE": "Real Estate",
    "XLB": "Materials", "XLC": "Communication Services",
}
PERIODS = {"1W": 5, "4W": 20, "12W": 60}
WEIGHTS = {"1W": 3, "4W": 2, "12W": 1}
HALAL_CAUTION = {"XLF": "Financials — mostly non-compliant, screen hard"}


def _ret(close: pd.Series, n: int) -> float:
    if len(close) <= n:
        return float("nan")
    return float(close.iloc[-1] / close.iloc[-n - 1] - 1)


def score() -> pd.DataFrame:
    hists = data.batch_history(list(SECTOR_ETFS) + ["SPY"], period="1y")
    spy = hists.get("SPY")
    rows = []
    for etf, name in SECTOR_ETFS.items():
        df = hists.get(etf)
        if df is None or spy is None or df.empty:
            continue
        row = {"etf": etf, "sector": name}
        raw, weighted = 0, 0
        for label, n in PERIODS.items():
            er, sr = _ret(df["Close"], n), _ret(spy["Close"], n)
            beat = er > sr
            row[f"{label}_ret"] = round(er * 100, 2)
            row[f"{label}_vs_SPY"] = round((er - sr) * 100, 2)
            raw += int(beat)
            weighted += WEIGHTS[label] * int(beat)
        row["raw_score"] = raw          # 3/3 = primary hunting ground
        row["weighted"] = weighted      # max 6
        row["halal_note"] = HALAL_CAUTION.get(etf, "")
        rows.append(row)
    df = pd.DataFrame(rows).sort_values(["weighted", "1W_vs_SPY"], ascending=False)
    df["rank"] = range(1, len(df) + 1)
    return df.reset_index(drop=True)


def top_sectors(df: pd.DataFrame, n: int = 3) -> list[str]:
    """Top-n sector NAMES (for matching against stock sector), Financials flagged not removed."""
    return df.head(n)["sector"].tolist()
