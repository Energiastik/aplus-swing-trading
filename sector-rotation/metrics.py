"""Metric calculations for the sector rotation tracker.

All functions operate on real price/volume data pulled by data_fetch.py.
`prices` throughout is a wide DataFrame indexed by date with a MultiIndex
column (ticker, field), field in {Open, High, Low, Close, Volume}.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import config


def _close(prices: pd.DataFrame, ticker: str) -> pd.Series:
    return prices[(ticker, "Close")].dropna()


def _volume(prices: pd.DataFrame, ticker: str) -> pd.Series:
    return prices[(ticker, "Volume")].dropna()


def relative_return_series(sector_close: pd.Series, bench_close: pd.Series, lookback: int) -> pd.Series:
    """Rolling `lookback`-day return of the sector minus the benchmark's
    rolling return over the same window, aligned by date."""
    sector_ret = sector_close.pct_change(lookback)
    bench_ret = bench_close.pct_change(lookback)
    aligned = pd.concat([sector_ret, bench_ret], axis=1, join="inner")
    aligned.columns = ["sector", "bench"]
    return (aligned["sector"] - aligned["bench"]).dropna()


def build_srs_table(sector_etf_close: dict[str, pd.Series], bench_close: pd.Series,
                     lookback: int = config.SRS_LOOKBACK,
                     history_days: int = config.SRS_HISTORY_DAYS) -> pd.DataFrame:
    """Build a (date x sector) table of SRS scores: the raw relative return
    of each sector vs the benchmark, min-max normalized to [0, 1] across
    sectors on each date. Returns the last `history_days` rows."""
    raw = {}
    for sector, close in sector_etf_close.items():
        raw[sector] = relative_return_series(close, bench_close, lookback)
    raw_df = pd.DataFrame(raw).dropna(how="all").tail(history_days)

    row_min = raw_df.min(axis=1)
    row_max = raw_df.max(axis=1)
    span = (row_max - row_min).replace(0, np.nan)
    srs_df = raw_df.sub(row_min, axis=0).div(span, axis=0)
    return srs_df.fillna(0.5)  # a flat day (span==0) is scored neutral


def srs_and_delta(srs_df: pd.DataFrame, delta_window: int = config.DELTA_WINDOW) -> pd.DataFrame:
    """Return today's SRS and its change over `delta_window` trading days."""
    latest = srs_df.iloc[-1]
    prior = srs_df.iloc[-1 - delta_window] if len(srs_df) > delta_window else srs_df.iloc[0]
    return pd.DataFrame({"SRS": latest, "Delta3D": latest - prior})


def sector_breadth(prices: pd.DataFrame, tickers: list[str],
                    ma_window: int = config.MA_WINDOW,
                    trend_window: int = config.BREADTH_TREND_WINDOW) -> tuple[float, str]:
    """% of `tickers` currently trading above their `ma_window`-day SMA, plus
    a trend arrow comparing that % to `trend_window` trading days ago."""
    today_flags, past_flags = [], []
    for t in tickers:
        close = _close(prices, t)
        if len(close) < ma_window + trend_window:
            continue
        sma = close.rolling(ma_window).mean()
        above = (close > sma).dropna()
        if len(above) <= trend_window:
            continue
        today_flags.append(bool(above.iloc[-1]))
        past_flags.append(bool(above.iloc[-1 - trend_window]))

    if not today_flags:
        return float("nan"), "?"

    today_pct = 100 * sum(today_flags) / len(today_flags)
    past_pct = 100 * sum(past_flags) / len(past_flags)
    diff = today_pct - past_pct
    if diff > config.BREADTH_TREND_THRESHOLD_PP:
        arrow = "up"
    elif diff < -config.BREADTH_TREND_THRESHOLD_PP:
        arrow = "down"
    else:
        arrow = "flat"
    return today_pct, arrow


def leader_count(prices: pd.DataFrame, tickers: list[str],
                  high_window: int = config.HIGH_WINDOW,
                  short_low: int = config.HIGHER_LOW_SHORT,
                  long_low: int = config.HIGHER_LOW_LONG) -> dict:
    """Count constituents making a `high_window`-day high and/or a higher
    low (min close of the last `short_low` days above the min close of the
    `long_low` days before that)."""
    breakouts, higher_lows, total = 0, 0, 0
    for t in tickers:
        close = _close(prices, t)
        if len(close) < max(high_window, short_low + long_low) + 1:
            continue
        total += 1
        if close.iloc[-1] >= close.tail(high_window).max():
            breakouts += 1
        recent_low = close.tail(short_low).min()
        prior_low = close.tail(short_low + long_low).head(long_low).min()
        if recent_low > prior_low:
            higher_lows += 1
    return {"breakouts": breakouts, "higher_lows": higher_lows, "universe": total}


def accumulation_ratio(prices: pd.DataFrame, tickers: list[str],
                        window: int = config.VOLUME_WINDOW) -> float:
    """Sum of volume on up days vs down days across `tickers` over the last
    `window` sessions, as a 0-1 share (>0.5 => net accumulation)."""
    up_vol, down_vol = 0.0, 0.0
    for t in tickers:
        close = _close(prices, t).tail(window + 1)
        vol = _volume(prices, t).tail(window + 1)
        if len(close) < 2:
            continue
        ret = close.pct_change().dropna()
        vol = vol.reindex(ret.index)
        up_vol += vol[ret > 0].sum()
        down_vol += vol[ret < 0].sum()
    total = up_vol + down_vol
    return (up_vol / total) if total else float("nan")


def ema_stack_and_slope(close: pd.Series,
                         fast: int = config.EMA_FAST,
                         mid: int = config.EMA_MID,
                         slow: int = config.EMA_SLOW,
                         slope_window: int = config.EMA_SLOPE_WINDOW) -> tuple[str, str]:
    """Bullish/bearish/mixed EMA stack on `close` (e.g. a sector ETF), plus
    whether the fast EMA has been sloping up, down, or flat over the last
    `slope_window` trading days ("curling up")."""
    if len(close) < slow + slope_window:
        return "?", "?"
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_mid = close.ewm(span=mid, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()

    f, m, s = ema_fast.iloc[-1], ema_mid.iloc[-1], ema_slow.iloc[-1]
    if f > m > s:
        stack = "Bull"
    elif f < m < s:
        stack = "Bear"
    else:
        stack = "Mixed"

    slope_delta = ema_fast.iloc[-1] - ema_fast.iloc[-1 - slope_window]
    slope = "Up" if slope_delta > 0 else "Down" if slope_delta < 0 else "Flat"
    return stack, slope


def volume_profile(prices: pd.DataFrame, tickers: list[str],
                    avg_window: int = config.VOLUME_AVG_WINDOW,
                    trend_window: int = config.VOLUME_TREND_WINDOW,
                    trend_threshold_pct: float = config.VOLUME_TREND_THRESHOLD_PCT) -> tuple[float, str]:
    """Aggregate `tickers` volume into one series, then: (1) today's volume
    relative to its own `avg_window`-day average (>1 = above-average volume
    today), and (2) whether that average has been rising, falling, or flat
    over the last `trend_window` days ("volume confirms")."""
    vol_series = [_volume(prices, t) for t in tickers]
    vol_series = [v for v in vol_series if len(v)]
    if not vol_series:
        return float("nan"), "?"

    total_vol = pd.concat(vol_series, axis=1).sum(axis=1, skipna=True)
    if len(total_vol) < avg_window + trend_window:
        return float("nan"), "?"

    avg_vol = total_vol.rolling(avg_window).mean()
    baseline = avg_vol.iloc[-1 - trend_window]
    rel_volume = total_vol.iloc[-1] / avg_vol.iloc[-1] if avg_vol.iloc[-1] else float("nan")
    trend_pct = (avg_vol.iloc[-1] - baseline) / baseline if baseline else 0

    if trend_pct > trend_threshold_pct:
        trend = "up"
    elif trend_pct < -trend_threshold_pct:
        trend = "down"
    else:
        trend = "flat"
    return rel_volume, trend


def _current_up_streak(close: pd.Series) -> int:
    """Number of consecutive positive daily closes trailing up to today."""
    diffs = close.diff().dropna().to_numpy()
    streak = 0
    for d in diffs[::-1]:
        if d > 0:
            streak += 1
        else:
            break
    return streak


def streak_profile(prices: pd.DataFrame, tickers: list[str],
                    min_streak: int = config.STREAK_MIN) -> dict:
    """Consecutive-up-day streaks across `tickers`: how many are currently on
    a streak of at least `min_streak` days, the average streak length, and
    the longest one — distinguishes a clean daily climb from a choppy one
    that merely happens to sit at a 20-day high."""
    streaks = [_current_up_streak(_close(prices, t)) for t in tickers if len(_close(prices, t)) > 1]
    if not streaks:
        return {"streak_leaders": 0, "avg_streak": float("nan"), "max_streak": 0}
    arr = np.array(streaks)
    return {
        "streak_leaders": int((arr >= min_streak).sum()),
        "avg_streak": float(arr.mean()),
        "max_streak": int(arr.max()),
    }


def classify_status(srs: float, delta3d: float, ema_stack: str, ema_slope: str,
                     vol_trend: str, breadth_trend: str) -> str:
    """Map SRS/Δ3D plus the EMA/volume/breadth confirmation signals onto the
    three-stage rotation framework: Building (before the move — breadth and
    EMA turning up while SRS is still unremarkable), Emerging/Leading (during
    the move — SRS strong *and* EMA stack + volume actually confirm it), and
    Fading (after the move — SRS still high but the confirmation signals have
    already rolled over, i.e. the "SRS high but delta slows, most traders
    enter here — too late" case)."""
    strong = srs >= config.SRS_STRONG_THRESHOLD
    weak = srs < config.SRS_WEAK_THRESHOLD
    rising = delta3d > config.DELTA_RISING_THRESHOLD
    confirmed = ema_stack == "Bull" and ema_slope == "Up" and vol_trend == "up"
    building = breadth_trend == "up" and ema_slope == "Up"

    if strong and confirmed and rising:
        return "Emerging"
    if strong and confirmed:
        return "Leading"
    if strong:
        return "Fading"
    if weak:
        return "Lagging"
    if building:
        return "Building"
    return "Neutral"
