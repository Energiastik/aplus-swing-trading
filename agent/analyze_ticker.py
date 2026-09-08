"""On-demand single-ticker swing analysis (BUY / WAIT / PASS) -- the engine
behind the planned Telegram /add <ticker> watchlist command.

Runs the same core pieces as the daily scan (market regime, technicals,
chart-vision grading, options walls, confluence) against ONE ticker and
applies the verdict rules in strategy/VERDICT_RULES.md. Self-contained: no
Claude Code agentic session needed -- chart_vision.grade() already calls the
Anthropic API directly (ANTHROPIC_API_KEY from env), same as the daily
routine's own chart-grading step.

Two things this does NOT try to replicate from the daily pipeline, both
noted on the returned Verdict:
  - RS percentile is normally ranked against that day's full screener pool.
    A single ad-hoc ticker has no pool, so `rs_pctile_is_estimate=True` marks
    a proxy: how far the ticker's weighted RS return beats SPY's own, scaled
    onto a 0-100 range calibrated so "beats SPY by 15pp" ~= 85th percentile.
    Real peer-pool ranking (e.g. against sector-rotation's cached S&P 500
    prices) is a fair v2 upgrade, not done here.
  - No halal screen -- same standing override as the daily scan.

Usage:
    python -m agent.analyze_ticker NVDA
    python -m agent.analyze_ticker NVDA --options-token <MARKETDATA_API_TOKEN>
"""
from __future__ import annotations
import argparse
import json
import sys
from dataclasses import asdict, dataclass, field

from . import data, market_regime, options_walls, sector_rotation, technicals
from . import chart_vision

# yfinance's sector taxonomy doesn't match the 11 GICS SPDR sector names
# 1:1 (e.g. "Basic Materials" vs "Materials") -- map the ones that differ.
YF_SECTOR_MAP = {
    "Technology": "Technology",
    "Consumer Cyclical": "Consumer Discretionary",
    "Financial Services": "Financials",
    "Industrials": "Industrials",
    "Energy": "Energy",
    "Healthcare": "Health Care",
    "Consumer Defensive": "Consumer Staples",
    "Utilities": "Utilities",
    "Real Estate": "Real Estate",
    "Basic Materials": "Materials",
    "Communication Services": "Communication Services",
}

# --- verdict rule thresholds, see strategy/VERDICT_RULES.md ---
MIN_RR = 1.0
MIN_EARNINGS_TRADING_DAYS = 7
MAX_BASE_NUMBER = 4              # base_number >= this -> PASS
APLUS_WAIT_CEILING = 6           # aplus_score <= this -> WAIT (also caps BUY at >=7)
BREAKOUT_RVOL_MIN = 1.2          # trigger: breakout day needs at least this much relative volume
RS_PROXY_SPY_MARGIN_FOR_85TH = 0.15  # beating SPY's weighted return by this much ~= 85th pctile proxy


@dataclass
class Verdict:
    ticker: str
    verdict: str                     # "BUY" | "WAIT" | "PASS"
    reason: str
    conviction: str | None = None    # "A+" | "standard" (BUY only)
    rr_band: str | None = None       # "2:1-2.9:1" | "3:1+" (BUY only)
    trigger: str | None = None       # "breakout" | "pullback" | None
    aplus_score: int = 0
    aplus_detail: list = field(default_factory=list)
    regime_score: int = 0
    regime_mode: str = ""
    sector: str | None = None
    sector_beats_spy: bool | None = None
    price: float | None = None
    entry: float | None = None
    stop: float | None = None
    target: float | None = None
    rr: float | None = None
    confluence_count: int = 0
    confluence_signals: list = field(default_factory=list)
    chart_grade: str | None = None
    vision_note: str | None = None
    rs_pctile_estimate: float | None = None
    rs_pctile_is_estimate: bool = True
    earnings_trading_days: float | None = None
    options_wall_source: str | None = None
    chart_path: str | None = None


def _trading_days(calendar_days: float) -> float:
    return calendar_days * 5 / 7


def _sector_and_beats_spy(ticker: str, sectors_df) -> tuple[str | None, bool]:
    info = data.info(ticker)
    yf_sector = info.get("sector")
    mapped = YF_SECTOR_MAP.get(yf_sector, yf_sector)
    if not mapped or sectors_df.empty:
        return mapped, False
    row = sectors_df[sectors_df["sector"] == mapped]
    if row.empty:
        return mapped, False
    return mapped, bool(row.iloc[0]["4W_vs_SPY"] > 0)


def _rs_pctile_estimate(t) -> float | None:
    """Proxy for a peer-pool RS percentile: how far this ticker's weighted RS
    return beats SPY's own, mapped onto ~0-100 so a 15pp margin lands near 85.
    See module docstring -- not a real percentile."""
    if t.rs_raw != t.rs_raw:  # nan
        return None
    spy_df = data.history("SPY", period="2y")
    if spy_df.empty:
        return None
    spy_rs = technicals.rs_weighted_return(spy_df["Close"])
    if spy_rs != spy_rs:
        return None
    margin = t.rs_raw - spy_rs
    pctile = 50 + (margin / RS_PROXY_SPY_MARGIN_FOR_85TH) * 35
    return round(min(max(pctile, 0), 100), 1)


def _aplus_checklist(regime_score: int, sector_beats_spy: bool, t, vision: dict,
                      rr: float | None, rs_pctile: float | None,
                      earnings_trading_days: float | None) -> tuple[int, list]:
    """Same 9-question checklist as technicals.a_plus_score(), but with the
    earnings item pointed at MIN_EARNINGS_TRADING_DAYS (this tool's own
    agreed threshold) instead of that function's hardcoded 14-calendar-day
    default, and rs_pctile passed in explicitly (the estimate above, not a
    peer-pool rank)."""
    checks = [
        ("Regime 3/4 or 4/4", regime_score >= 3),
        ("Sector beats SPY (4W)", sector_beats_spy),
        ("RS percentile >= 85 (estimate)", (rs_pctile or 0) >= 85),
        ("Recognizable pattern", vision.get("pattern") not in (None, "none")),
        ("VDU present", bool(t.vdu or vision.get("vdu"))),
        ("Clear pivot", t.pivot is not None and not t.extended),
        ("Logical stop", True),
        ("R/R >= 2:1", rr is not None and rr >= 2.0),
        (f"Earnings >= {MIN_EARNINGS_TRADING_DAYS} trading days away",
         earnings_trading_days is None or earnings_trading_days >= MIN_EARNINGS_TRADING_DAYS),
    ]
    return sum(1 for _, ok in checks if ok), [{"check": c, "ok": ok} for c, ok in checks]


def _detect_trigger(t, vision: dict) -> str | None:
    """Breakout: at/through pivot on RVOL>=BREAKOUT_RVOL_MIN, not extended.
    Pullback: VDU (numeric or vision-confirmed) -- assumed sitting at a level
    since the WAIT gate above already requires confluence_count>=1 to reach
    here. Neither -> no trigger today, stays WAIT."""
    if t.pivot is not None and t.dist_to_pivot_pct is not None:
        if t.dist_to_pivot_pct >= -1.0 and not t.extended and t.vol_ratio >= BREAKOUT_RVOL_MIN:
            return "breakout"
    if t.vdu or vision.get("vdu"):
        return "pullback"
    return None


def analyze(ticker: str, options_token: str | None = None) -> Verdict:
    ticker = ticker.upper().strip()
    df = data.history(ticker, period="2y")
    if df.empty:
        return Verdict(ticker=ticker, verdict="PASS", reason="no price data from yfinance")

    t = technicals.read(df)
    regime = market_regime.assess()
    sectors_df = sector_rotation.score()
    sector, sector_beats_spy = _sector_and_beats_spy(ticker, sectors_df)

    chart_path = chart_vision.render_chart(ticker, df, t=t)
    vision = chart_vision.grade(ticker, chart_path, context={
        "price": t.price, "ema9": t.ema9, "ema21": t.ema21, "ema50": t.ema50, "ema200": t.ema200,
        "rsi14": t.rsi14, "atr_pct": t.atr_pct, "pivot": t.pivot,
        "dist_to_pivot_pct": t.dist_to_pivot_pct, "vol_ratio": t.vol_ratio, "vdu": t.vdu,
    })
    chart_grade = vision.get("grade", "C")

    earnings_calendar_days = data.next_earnings_days(ticker)
    earnings_trading_days = (
        _trading_days(earnings_calendar_days) if earnings_calendar_days is not None else None
    )

    entry = vision.get("entry") or t.price
    stop = vision.get("stop")
    target = vision.get("target")
    rr = round((target - entry) / (entry - stop), 2) if (stop and target and entry > stop) else None

    walls = options_walls.read(ticker, t.price, token=options_token)
    conf_count, conf_signals = technicals.confluence_count(t, entry, walls)

    rs_pctile = _rs_pctile_estimate(t)

    v = Verdict(
        ticker=ticker, verdict="WAIT", reason="",
        regime_score=regime.score, regime_mode=regime.mode,
        sector=sector, sector_beats_spy=sector_beats_spy,
        price=t.price, entry=entry, stop=stop, target=target, rr=rr,
        confluence_count=conf_count, confluence_signals=conf_signals,
        chart_grade=chart_grade, vision_note=vision.get("note"),
        rs_pctile_estimate=rs_pctile,
        earnings_trading_days=earnings_trading_days,
        options_wall_source=walls.source,
        chart_path=str(chart_path),
    )

    # ---- PASS gates (any one -> stop here) ----
    if not t.above_200:
        v.verdict, v.reason = "PASS", "below EMA200 -- no long structure"
        return v
    if rr is None or rr < MIN_RR:
        v.verdict, v.reason = "PASS", f"R/R {rr if rr is not None else 'n/a'} < {MIN_RR}"
        return v
    if chart_grade == "F":
        v.verdict, v.reason = "PASS", f"chart grade F -- {vision.get('note', '')}"
        return v
    if earnings_trading_days is not None and earnings_trading_days < MIN_EARNINGS_TRADING_DAYS:
        v.verdict, v.reason = "PASS", f"earnings in ~{earnings_trading_days:.0f} trading days"
        return v
    base_number = vision.get("base_number")
    if base_number is not None and base_number >= MAX_BASE_NUMBER:
        v.verdict, v.reason = "PASS", f"base #{base_number} -- too extended a series of bases"
        return v

    aplus_score, aplus_detail = _aplus_checklist(
        regime.score, sector_beats_spy, t, vision, rr, rs_pctile, earnings_trading_days,
    )
    v.aplus_score, v.aplus_detail = aplus_score, aplus_detail
    trigger = _detect_trigger(t, vision)
    v.trigger = trigger

    # ---- WAIT caps ----
    if regime.score <= 1:
        v.verdict, v.reason = "WAIT", "regime NO_TRADE -- watchlist only"
        return v
    if aplus_score <= APLUS_WAIT_CEILING:
        v.verdict, v.reason = "WAIT", f"A+ score {aplus_score}/9 -- no entry"
        return v
    if t.extended:
        v.verdict, v.reason = "WAIT", f"{t.dist_to_pivot_pct:.1f}% past pivot -- chase risk"
        return v
    if conf_count == 0:
        v.verdict, v.reason = "WAIT", "no confluence at proposed entry"
        return v
    if trigger is None:
        v.verdict, v.reason = "WAIT", "structurally fine, no trigger today"
        return v

    # ---- BUY ----
    v.verdict = "BUY"
    v.conviction = "A+" if aplus_score == 9 else "standard"
    v.rr_band = "3:1+" if rr >= 3.0 else "2:1-2.9:1"
    v.reason = f"{trigger} trigger, A+ {aplus_score}/9, R/R {rr:.1f}"
    return v


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("ticker")
    parser.add_argument("--options-token", default=None, help="MARKETDATA_API_TOKEN (optional)")
    args = parser.parse_args()
    v = analyze(args.ticker, options_token=args.options_token)
    print(json.dumps(asdict(v), indent=2, default=str))
    print(f"\n{'='*40}\n{v.ticker}: {v.verdict} -- {v.reason}\n{'='*40}", file=sys.stderr)


if __name__ == "__main__":
    main()
