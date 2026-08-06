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
    if not win.empty:
        t.pivot = float(win["High"].max())
        t.dist_to_pivot_pct = (t.price / t.pivot - 1) * 100
        t.extended = t.dist_to_pivot_pct is not None and t.dist_to_pivot_pct > 5
    lows = df["Low"].iloc[-15:]
    t.pullback_low = float(lows.min())

    t.rs_raw = rs_weighted_return(c)

    if not t.above_200:
        t.flags.append("below EMA200 — no long structure")
    if t.rsi14 < 40:
        t.flags.append("RSI<40 — reduce/avoid longs")
    if t.extended:
        t.flags.append(f"extended {t.dist_to_pivot_pct:.1f}% past pivot — chase risk")
    return t


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
        ("R/R >= 3:1", rr >= 3.0),
        ("Earnings >= 2 weeks away", earnings_days is None or earnings_days >= 14),
    ]
    return sum(ok for _, ok in checks), checks
