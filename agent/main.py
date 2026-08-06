"""Daily orchestrator.

Flow:  regime -> sectors -> screener funnel -> per-ticker technical read
       -> pre-rank -> chart render + Claude vision on top N -> halal
       -> A+ checklist -> gates + composite rank -> report (HTML/Telegram)

Usage:
  python -m agent.main                # full run
  python -m agent.main --no-vision    # skip Claude vision (free, numeric only)
  python -m agent.main --no-telegram  # print + HTML only
  python -m agent.main --vision-top 12 --deposit 10000 --risk 1.0
"""
from __future__ import annotations
import argparse
import numpy as np
import pandas as pd

from . import data, market_regime, sector_rotation, screener
from . import technicals, halal, ranking, report


def run(args) -> None:
    print("=== 1/6 Market regime ===")
    regime = market_regime.assess()
    print(f"    {regime.mode} {regime.score}/4 · VIX {regime.vix}")

    print("=== 2/6 Sector rotation ===")
    sectors = sector_rotation.score()
    top_secs = sector_rotation.top_sectors(sectors, 3)
    print(f"    Top sectors: {top_secs}")

    print("=== 3/6 Screener funnel ===")
    cands, source = screener.run(args.universe, limit=args.screen_limit)
    print(f"    {len(cands)} candidates via {source}")
    if cands.empty:
        report.send_telegram("Swing agent: screener returned 0 candidates today.")
        return

    print("=== 4/6 Technical read ===")
    tickers = cands["ticker"].tolist()
    hists = data.batch_history(tickers, period="2y")
    rows = []
    for _, c in cands.iterrows():
        tk = c["ticker"]
        df = hists.get(tk)
        if df is None or len(df) < 120:
            continue
        t = technicals.read(df)
        if not t.above_200:
            continue
        rows.append({"ticker": tk, "sector": c.get("sector", ""),
                     "industry": c.get("industry", ""), "df": df, "tech": t})

    # RS percentile within candidate pool + SPY anchor
    rs_vals = pd.Series({r["ticker"]: r["tech"].rs_raw for r in rows}).dropna()
    for r in rows:
        v = r["tech"].rs_raw
        r["tech"].rs_pctile = float((rs_vals < v).mean() * 100) if v == v else 0.0

    # Pre-rank numerically to choose which charts get vision (cost control)
    rows.sort(key=lambda r: ranking.technical_points(r["tech"]), reverse=True)
    vision_pool = rows[:args.vision_top]

    print(f"=== 5/6 Vision + halal + checklist ({len(vision_pool)} names) ===")
    from .chart_vision import render_chart, grade
    for r in vision_pool:
        t = r["tech"]
        chart = render_chart(r["ticker"], r["df"])
        r["chart_path"] = chart
        if not args.no_vision:
            ctx = {"price": t.price, "ema21": round(t.ema21, 2), "ema50": round(t.ema50, 2),
                   "rsi": round(t.rsi14, 1), "rs_pctile": round(t.rs_pctile or 0),
                   "atr_pct": round(t.atr_pct, 1), "vdu": t.vdu,
                   "pivot": t.pivot, "dist_to_pivot_pct": t.dist_to_pivot_pct}
            try:
                r["vision"] = grade(r["ticker"], chart, ctx)
            except Exception as e:
                print(f"    [vision] {r['ticker']}: {e}")
                r["vision"] = None
        v = r.get("vision") or {}
        # entry/stop: prefer vision plan if sane, else numeric construction
        e_num, s_num, tg_num = technicals.stop_and_entry(t)
        entry = v.get("entry") or e_num
        stop = v.get("stop") or s_num
        target = v.get("target") or tg_num
        if not (0.85 * t.price < entry < 1.1 * t.price) or not (stop < entry < target):
            entry, stop, target = e_num, s_num, tg_num
        r["entry"], r["stop"], r["target"] = entry, stop, target
        r["rr"] = (target - entry) / max(entry - stop, 1e-9)

        r["halal"] = halal.screen(r["ticker"], r["industry"], r["sector"])
        r["earnings_days"] = data.next_earnings_days(r["ticker"])
        r["sector_top"] = r["sector"] in sector_rotation.top_sectors(sectors, 3)
        r["aplus"], r["aplus_detail"] = technicals.a_plus_score(
            regime.score, r["sector_top"], t, r.get("vision"), r["rr"], r["earnings_days"])
        print(f"    {r['ticker']}: score-prep A+{r['aplus']}/9 "
              f"chart {v.get('grade','–')} halal {r['halal'].status} R/R {r['rr']:.1f}")

    print("=== 6/6 Rank + report ===")
    top, rejected = ranking.rank(vision_pool, regime.size_multiplier, top_n=args.top)
    text = report.build_text(regime, sectors, top, rejected,
                             deposit=args.deposit, risk_pct=args.risk)
    print("\n" + text.replace("*", ""))
    html = report.save_html(text)
    print(f"\nHTML report: {html}")
    if not args.no_telegram:
        charts = [r["chart_path"] for r in top if r.get("chart_path")]
        report.send_telegram(text, charts)


def cli():
    p = argparse.ArgumentParser()
    p.add_argument("--universe", default=None, help="fallback universe CSV")
    p.add_argument("--screen-limit", type=int, default=60)
    p.add_argument("--vision-top", type=int, default=15,
                   help="how many pre-ranked charts get Claude vision")
    p.add_argument("--top", type=int, default=10)
    p.add_argument("--deposit", type=float, default=10_000)
    p.add_argument("--risk", type=float, default=1.0, help="risk %% per trade")
    p.add_argument("--no-vision", action="store_true")
    p.add_argument("--no-telegram", action="store_true")
    run(p.parse_args())


if __name__ == "__main__":
    cli()
