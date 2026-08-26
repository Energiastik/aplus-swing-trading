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


def volume_profile(df: pd.DataFrame, lookback: int = 90, n_bins: int = 40) -> dict:
    """Volume-at-price histogram over the last `lookback` sessions (default ~90 =
    the current basing/consolidation regime, not the whole trading history -- a
    big multi-month winner's older base-building volume would otherwise dominate
    the profile and put POC nowhere near a current swing entry; see
    historical_sr_zones() for the longer-term 2y structural view instead). Each
    day's volume is distributed proportionally across the price bins its High-Low
    range touched (not just dumped into the close's bin) -- the standard
    construction. Returns the Point of Control (highest-volume bin) and the Value
    Area (bins around POC that together hold ~68% of total volume, expanded to
    whichever adjacent side has more volume each step -- the standard value-area
    algorithm)."""
    d = df.iloc[-lookback:] if len(df) > lookback else df
    if d.empty:
        return {"poc": None, "val": None, "vah": None, "bins": []}
    lo, hi = float(d["Low"].min()), float(d["High"].max())
    if hi <= lo:
        return {"poc": None, "val": None, "vah": None, "bins": []}
    edges = np.linspace(lo, hi, n_bins + 1)
    vol_by_bin = np.zeros(n_bins)
    for _, row in d.iterrows():
        rlo, rhi, vol = row["Low"], row["High"], row["Volume"]
        if rhi <= rlo or vol <= 0:
            continue
        lo_bin = max(0, np.searchsorted(edges, rlo, side="right") - 1)
        hi_bin = min(n_bins - 1, np.searchsorted(edges, rhi, side="right") - 1)
        span = hi_bin - lo_bin + 1
        vol_by_bin[lo_bin:hi_bin + 1] += vol / span
    centers = (edges[:-1] + edges[1:]) / 2
    total = vol_by_bin.sum()
    if total <= 0:
        return {"poc": None, "val": None, "vah": None, "bins": []}
    poc_i = int(vol_by_bin.argmax())
    lo_i = hi_i = poc_i
    covered = vol_by_bin[poc_i]
    target = total * 0.68
    while covered < target and (lo_i > 0 or hi_i < n_bins - 1):
        left = vol_by_bin[lo_i - 1] if lo_i > 0 else -1
        right = vol_by_bin[hi_i + 1] if hi_i < n_bins - 1 else -1
        if right >= left:
            hi_i += 1
            covered += vol_by_bin[hi_i]
        else:
            lo_i -= 1
            covered += vol_by_bin[lo_i]
    return {
        "poc": round(float(centers[poc_i]), 2),
        "val": round(float(centers[lo_i]), 2),
        "vah": round(float(centers[hi_i]), 2),
        "bins": [{"price": round(float(c), 2), "volume": round(float(v), 0)}
                 for c, v in zip(centers, vol_by_bin)],
    }


def historical_sr_zones(df: pd.DataFrame, lookback: int = 504, window: int = 8,
                         tolerance_pct: float = 1.5, max_zones: int = 6) -> list[dict]:
    """Cluster prior local swing highs/lows (a point is a swing if it's the extreme
    within +/- `window` sessions) into zones -- levels within `tolerance_pct` of each
    other merge, and how many distinct swing points fall in a zone is its strength
    (touched more = more real). Returns up to `max_zones` strongest zones, each
    tagged support/resistance relative to the current price."""
    d = df.iloc[-lookback:] if len(df) > lookback else df
    if len(d) < window * 2 + 1:
        return []
    price = float(d["Close"].iloc[-1])
    highs, lows = d["High"].values, d["Low"].values
    points = []
    for i in range(window, len(d) - window):
        seg_h = highs[i - window:i + window + 1]
        if highs[i] == seg_h.max():
            points.append(float(highs[i]))
        seg_l = lows[i - window:i + window + 1]
        if lows[i] == seg_l.min():
            points.append(float(lows[i]))
    if not points:
        return []
    points.sort()
    zones: list[dict] = []
    cur = [points[0]]
    for p in points[1:]:
        if (p - cur[-1]) / cur[-1] * 100 <= tolerance_pct:
            cur.append(p)
        else:
            zones.append(cur)
            cur = [p]
    zones.append(cur)
    out = [{"level": round(sum(z) / len(z), 2), "strength": len(z)} for z in zones]
    for z in out:
        z["type"] = "resistance" if z["level"] > price else "support"
        z["dist_pct"] = round((z["level"] / price - 1) * 100, 2)
    out.sort(key=lambda z: (-z["strength"], abs(z["dist_pct"])))
    return out[:max_zones]


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
    # Volume profile (last 180 sessions) and historical S/R zones (last ~2y, clustered
    # local swing highs/lows). Both are chart-overlay data as much as scoring inputs --
    # see agent/chart_vision.py, which now plots them.
    poc: float | None = None
    val: float | None = None
    vah: float | None = None
    sr_zones: list = field(default_factory=list)
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

    vp = volume_profile(df)
    t.poc, t.val, t.vah = vp["poc"], vp["val"], vp["vah"]
    t.sr_zones = historical_sr_zones(df)

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
    nearest_res = next((z for z in t.sr_zones if z["type"] == "resistance"), None)
    if nearest_res and nearest_res["dist_pct"] < 5:
        t.flags.append(f"historical resistance {nearest_res['dist_pct']:.1f}% away "
                        f"(touched {nearest_res['strength']}x) — limited room before target")
    return t


def confluence_count(t: TechRead, entry: float, walls=None) -> tuple[int, list[str]]:
    """How many independent support/resistance signals line up near `entry`
    (within ~2%): EMA21, EMA50, a Fib level, the anchored VWAP, a liquidity-sweep
    reclaim level, volume-profile POC/VAH/VAL, any historical S/R zone, and (if
    `walls` -- an options_walls.OptionsWalls -- is passed) the call/put wall.
    STRATEGY.md's own confluence rule: single signals mean little, several lining
    up at one price is a real level. Options walls are informational/confluence
    input only -- see options_walls.py; never a hard gate on their own."""
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
    near(t.poc, "volume profile POC")
    near(t.vah, "volume profile VAH")
    near(t.val, "volume profile VAL")
    for z in t.sr_zones:
        near(z["level"], f"historical {z['type']} (touched {z['strength']}x)")
    if walls is not None and walls.source != "unavailable":
        tag = " (volume proxy)" if walls.source == "volume_fallback" else ""
        near(walls.call_wall, f"options call wall{tag}")
        near(walls.put_wall, f"options put wall{tag}")
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
