"""Gate #1 — Market Regime. Day 3 weekly checklist + Day 2 VIX overlay."""
from __future__ import annotations
from dataclasses import dataclass, field
from . import data
from .technicals import ema


@dataclass
class Regime:
    score: int = 0
    checks: dict = field(default_factory=dict)
    mode: str = "NO_TRADE"          # AGGRESSIVE | CAUTIOUS | NO_TRADE
    size_multiplier: float = 0.0    # 1.0 / 0.5 / 0.0
    vix: float | None = None
    vix_note: str = ""
    spy_close: float | None = None


def assess() -> Regime:
    r = Regime()
    spy = data.history("SPY", period="2y")
    qqq = data.history("QQQ", period="6mo")
    vix = data.history("^VIX", period="3mo")

    if spy.empty or qqq.empty:
        r.checks["error"] = "no index data"
        return r

    # 1. SPY > EMA200
    spy_ema200 = ema(spy["Close"], 200).iloc[-1]
    r.spy_close = float(spy["Close"].iloc[-1])
    c1 = r.spy_close > spy_ema200
    r.checks["SPY > EMA200"] = c1

    # 2. QQQ new 4-week high within last 5 sessions
    q = qqq["Close"]
    rolling_high = q.rolling(20).max()
    c2 = bool((q.iloc[-5:] >= rolling_high.iloc[-5:] * 0.999).any())
    r.checks["QQQ 4-week high (last 5d)"] = c2

    # 3. VIX < 20
    r.vix = float(vix["Close"].iloc[-1]) if not vix.empty else None
    c3 = r.vix is not None and r.vix < 20
    r.checks["VIX < 20"] = c3

    # 4. SPY up on the week (last 5 sessions vs prior 5)
    w = spy["Close"].iloc[-11:]
    c4 = bool(w.iloc[-1] > w.iloc[-6]) if len(w) >= 11 else False
    r.checks["SPY up on week"] = c4

    r.score = sum(bool(x) for x in (c1, c2, c3, c4))
    if r.score == 4:
        r.mode, r.size_multiplier = "AGGRESSIVE", 1.0
    elif r.score >= 2:
        r.mode, r.size_multiplier = "CAUTIOUS", 0.5
    else:
        r.mode, r.size_multiplier = "NO_TRADE", 0.0

    if r.vix is not None:
        if r.vix > 28:
            r.vix_note = ("PANIC ZONE (VIX>28): contrarian window — scale into "
                          "fundamentally strong names in parts (15%/40%), never all at once.")
        elif r.vix < 15:
            r.vix_note = "Calm (VIX<15): keep booking profits per pie-exit plan."
        else:
            r.vix_note = "VIX 15–28: hold with the trend, monitor."
    return r
