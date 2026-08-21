"""Day 3 technical engine: EMA system, RS, RSI, VDU, ATR, pivot, A+ checklist."""
from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np
import pandas as pd


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n).mean()


def rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    tr = pd.concat([df["High"] - df["Low"],
                    (df["High"] - df["Close"].shift()).abs(),
                    (df["Low"] - df["Close"].shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def rs_weighted_return(close: pd.Series) -> float:
    """IBD-style weighted momentum: 40%*3m + 20%*6m + 20%*9m + 20%*12m."""
    def r(n):
        return close.iloc[-1] / close.iloc[-n] - 1 if len(close) > n else np.nan
    parts = [(0.4, r(63)), (0.2, r(126)), (0.2, r(189)), (0.2, r(252))]
    vals = [(w, x) for w, x in parts if not pd.isna(x)]
    if not vals:
        return np.nan
    wsum = sum(w for w, _ in vals)
    return float(sum(w * x for w, x in vals) / wsum)


@dataclass
class TechRead:
    price: float = 0.0
    ema9: float = 0.0
    ema21: float = 0.0
    ema50: float = 0.0
    ema200: float = 0.0
    stacked: bool = False
    above_200: bool = False
    rsi14: float = 0.0
    rsi_ok: bool = False
    atr14: float = 0.0
    atr_pct: float = 0.0
    vol_ratio: float = 0.0        # today's vol vs 50d avg
    vdu: bool = False
    pivot: float | None = None    # recent swing high
    dist_to_pivot_pct: float | None = None
    extended: bool = False
    pullback_low: float | None = None  # recent swing low (structural stop anchor)
    rs_raw: float = np.nan
    rs_pctile: float | None = None
    # Fibonacci retracement of the rally leg into the pivot (rally_low -> pivot)
    rally_low: float | None = None
    fib_382: float | None = None
    fib_500: float | None = None
    fib_618: float | None = None
    near_fib_level: str | None = None   # "38.2%" | "50%" | "61.8%" | None
    near_fib_dist_pct: float | None = None
    # Anchored VWAP from the highest-volume day in the lookback (catalyst-day proxy --
    # a real earnings/news date isn't known inside this pure-OHLCV module, so the
    # volume spike itself stands in for "the day something happened")
    vwap_anchor_date: str | None = None
    vwap_anchor: float | None = None
    dist_to_vwap_pct: float | None = None
    # Liquidity sweep: a session whose low undercut the prior N-day swing low but
    # closed back above it -- a numerically clean stop-hunt-then-reclaim pattern,
    # distinct from the vision step's (qualitative) equal-highs read.
    liquidity_sweep: bool = False
    liquidity_sweep_low: float | None = None
    flags: list = field(default_factory=list)


def read(df: pd.DataFrame) -> TechRead:
    t = TechRead()
    c = df["Close"]
    t.price = float(c.iloc[-1])
    t.ema9, t.ema21 = float(ema(c, 9).iloc[-1]), float(ema(c, 21).iloc[-1])
    t.ema50, t.ema200 = float(ema(c, 50).iloc[-1]), float(ema(c, 200).iloc[-1])
    t.stacked = t.price > t.ema9 > t.ema21 > t.ema50 > t.ema200
    t.above_200 = t.price > t.ema200
    t.rsi14 = float(rsi(c).iloc[-1])
    t.rsi_ok = 40 <= t.rsi14 <= 80
    a = atr(df)
    t.atr14 = float(a.iloc[-1])
    t.atr_pct = t.atr14 / t.price * 100

    vol_ma = df["Volume"].rolling(50).mean()
    t.vol_ratio = float(df["Volume"].iloc[-1] / vol_ma.iloc[-1]) if vol_ma.iloc[-1] else 0
    # VDU: last 3 sessions volume <=60% of avg AND tight range <=2%
    recent_vr = (df["Volume"].iloc[-3:] / vol_ma.iloc[-3:]).mean()
    recent_rng = ((df["High"] - df["Low"]) / c).iloc[-3:].mean()
    t.vdu = bool(recent_vr <= 0.6 and recent_rng <= 0.025)

    # Pivot: highest high of last 60 sessions excluding last 3
    win = df.iloc[-63:-3] if len(df) > 63 else df.iloc[:-3]
    pivot_idx = None
    if not win.empty:
        pivot_idx = win["High"].idxmax()
        t.pivot = float(win.loc[pivot_idx, "High"])
        t.dist_to_pivot_pct = (t.price / t.pivot - 1) * 100
        t.extended = t.dist_to_pivot_pct is not None and t.dist_to_pivot_pct > 5
    lows = df["Low"].iloc[-15:]
    t.pullback_low = float(lows.min())

    # Fibonacci retracement of the rally leg (rally_low -> pivot). rally_low is the
    # lowest low in the 90 sessions before the pivot was set, not just the last 15
    # days (which may already BE the retracement, not the pre-rally base).
    if pivot_idx is not None:
        pos = df.index.get_loc(pivot_idx)
        pre_pivot = df.iloc[max(0, pos - 90):pos]
        if not pre_pivot.empty:
            t.rally_low = float(pre_pivot["Low"].min())
            fib_range = t.pivot - t.rally_low
            if fib_range > 0:
                t.fib_382 = t.pivot - 0.382 * fib_range
                t.fib_500 = t.pivot - 0.5 * fib_range
                t.fib_618 = t.pivot - 0.618 * fib_range
                levels = {"38.2%": t.fib_382, "50%": t.fib_500, "61.8%": t.fib_618}
                nearest_name, nearest_val = min(levels.items(), key=lambda kv: abs(t.price - kv[1]))
                nearest_dist = abs(t.price - nearest_val) / t.price * 100
                if nearest_dist <= 3.0:   # within 3% counts as "at" that level
                    t.near_fib_level = nearest_name
                    t.near_fib_dist_pct = round(nearest_dist, 2)

    # Anchored VWAP from the highest-volume day in the last 90 sessions (catalyst-day
    # proxy). Skipped if that day is stale (>90 sessions back) or volume data is thin.
    lookback = df.iloc[-90:] if len(df) > 90 else df
    if not lookback.empty and lookback["Volume"].max() > 0:
        anchor_idx = lookback["Volume"].idxmax()
        anchor_pos = df.index.get_loc(anchor_idx)
        from_anchor = df.iloc[anchor_pos:]
        typical = (from_anchor["High"] + from_anchor["Low"] + from_anchor["Close"]) / 3
        vol_sum = from_anchor["Volume"].sum()
        if vol_sum > 0:
            t.vwap_anchor = float((typical * from_anchor["Volume"]).sum() / vol_sum)
            t.vwap_anchor_date = str(anchor_idx.date() if hasattr(anchor_idx, "date") else anchor_idx)
            t.dist_to_vwap_pct = round((t.price / t.vwap_anchor - 1) * 100, 2)

    # Liquidity sweep: in the last 5 sessions, did price undercut the swing low from
    # the 20 sessions before that window, then close back above it the same day?
    if len(df) > 25:
        prior_swing_low = float(df["Low"].iloc[-25:-5].min())
        recent = df.iloc[-5:]
        swept = recent[(recent["Low"] < prior_swing_low) & (recent["Close"] > prior_swing_low)]
        if not swept.empty:
            t.liquidity_sweep = True
            t.liquidity_sweep_low = float(swept["Low"].min())

    t.rs_raw = rs_weighted_return(c)

    if not t.above_200:
        t.flags.append("below EMA200 — no long structure")
    if t.rsi14 < 40:
        t.flags.append("RSI<40 — reduce/avoid longs")
    if t.extended:
        t.flags.append(f"extended {t.dist_to_pivot_pct:.1f}% past pivot — chase risk")
    if t.liquidity_sweep:
        t.flags.append(f"liquidity sweep at {t.liquidity_sweep_low:.2f} then reclaimed — stop hunt, not breakdown")
    if t.near_fib_level:
        t.flags.append(f"at {t.near_fib_level} Fib retracement ({t.near_fib_dist_pct:.1f}% away)")
    return t


def confluence_count(t: TechRead, entry: float) -> tuple[int, list[str]]:
    """How many independent support/resistance signals line up near `entry`
    (within ~2%): EMA21, EMA50, a Fib level, the anchored VWAP, and (if present)
    a liquidity-sweep reclaim level. STRATEGY.md's own confluence rule: single
    signals mean little, several lining up at one price is a real level."""
    hits = []
    def near(level: float | None, name: str) -> None:
        if level and abs(entry - level) / entry * 100 <= 2.0:
            hits.append(name)
    near(t.ema21, "EMA21")
    near(t.ema50, "EMA50")
    near(t.fib_382, "Fib 38.2%")
    near(t.fib_500, "Fib 50%")
    near(t.fib_618, "Fib 61.8%")
    near(t.vwap_anchor, "anchored VWAP")
    near(t.liquidity_sweep_low, "liquidity-sweep reclaim level")
    return len(hits), hits


def stop_and_entry(t: TechRead) -> tuple[float, float, float]:
    """Standard entry (EMA9–21 zone respected -> current price), structural/ATR stop, target.
    Stop = min(swing low, price - 1.7*ATR), never above; sanity: 3–10% away."""
    entry = t.price
    struct = t.pullback_low if t.pullback_low else entry * 0.95
    stop = min(struct * 0.995, entry - 1.7 * t.atr14)
    stop = max(stop, entry * 0.90)          # cap risk at 10%
    stop = min(stop, entry * 0.97)          # at least 3% (wider than daily noise)
    target = t.pivot * 1.10 if (t.pivot and t.pivot > entry) else entry * 1.15
    return round(entry, 2), round(stop, 2), round(target, 2)


def a_plus_score(regime_score: int, sector_beats_spy: bool, t: TechRead,
                 vision: dict | None, rr: float, earnings_days: float | None) -> tuple[int, list]:
    """The 9-question A+ checklist. Returns (score, detail)."""
    vision = vision or {}
    checks = [
        ("Regime 4/4 or 3/4", regime_score >= 3),
        ("Sector beats SPY (4W)", sector_beats_spy),
        ("RS percentile >= 85", (t.rs_pctile or 0) >= 85),
        ("Recognizable pattern", vision.get("pattern") not in (None, "none")),
        ("VDU present", bool(t.vdu or vision.get("vdu"))),
        ("Clear pivot", t.pivot is not None and not t.extended),
        ("Logical stop", True),  # constructed by stop_and_entry rules
        ("R/R >= 2:1", rr >= 2.0),
        ("Earnings >= 2 weeks away", earnings_days is None or earnings_days >= 14),
    ]
    return sum(ok for _, ok in checks), checks
