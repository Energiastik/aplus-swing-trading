"""Daily sector-rotation report: relative strength (SRS) vs SPY, its 3-day
delta, breadth, leader counts and volume accumulation, for each S&P 500 GICS
sector. Real data end-to-end (S&P 500 roster + yfinance daily bars).

Usage:
    python pipeline.py                      # full S&P 500 universe
    python pipeline.py --max-per-sector 25  # faster first run
    python pipeline.py --refresh            # bypass today's cache
    python pipeline.py --output report.csv
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys

import pandas as pd
from tabulate import tabulate

import config
import data_fetch
import metrics


def build_sector_groups(constituents: pd.DataFrame, max_per_sector: int | None) -> dict:
    """Return {sector_name: {"etf", "kind", "tickers"}} from the GICS roster."""
    groups = {}
    for sector, etf in config.SECTOR_ETFS.items():
        tickers = constituents.loc[constituents["Sector"] == sector, "Symbol"].tolist()
        if max_per_sector:
            tickers = tickers[:max_per_sector]
        groups[sector] = {"etf": etf, "kind": "Sector", "tickers": tickers}
    return groups


def build_theme_groups(max_per_theme: int | None, refresh: bool) -> dict:
    """Return {theme_name: {"etf", "kind", "tickers"}}. Holdings come from
    live SSGA data when the ticker is a State Street product; any other
    ticker still gets a group (just with an empty tickers list, so its SRS
    still ranks but breadth/leader/accumulation are left blank) so that a
    user-added ETF never crashes the run."""
    groups = {}
    for theme, etf in config.THEME_ETFS.items():
        try:
            tickers = data_fetch.get_etf_holdings(etf, refresh=refresh)
            if max_per_theme:
                tickers = tickers[:max_per_theme]
        except Exception as e:
            print(f"Warning: no holdings data for theme '{theme}' ({etf}): {e}. "
                  f"It will still be ranked by SRS, but breadth/leader/accumulation will be blank.",
                  file=sys.stderr)
            tickers = []
        groups[theme] = {"etf": etf, "kind": "Theme", "tickers": tickers}
    return groups


def run(max_per_sector: int | None, max_per_theme: int | None, refresh: bool,
        output: str | None, include_themes: bool = True):
    print("Fetching S&P 500 sector roster...", file=sys.stderr)
    constituents = data_fetch.get_sp500_constituents(refresh=refresh)
    groups = build_sector_groups(constituents, max_per_sector)

    if include_themes:
        print("Fetching theme ETF holdings (SSGA)...", file=sys.stderr)
        groups.update(build_theme_groups(max_per_theme, refresh))

    all_tickers = {config.BENCHMARK, *(g["etf"] for g in groups.values())}
    for g in groups.values():
        all_tickers.update(g["tickers"])

    print(f"Downloading {len(all_tickers)} tickers of daily history "
          f"({config.PRICE_HISTORY_PERIOD})... this can take a minute or two.", file=sys.stderr)
    prices = data_fetch.download_price_history(sorted(all_tickers), refresh=refresh)

    bench_close = prices[(config.BENCHMARK, "Close")].dropna()

    etf_close = {}
    for name, g in groups.items():
        close = prices[(g["etf"], "Close")].dropna() if (g["etf"], "Close") in prices.columns else pd.Series(dtype=float)
        if close.empty:
            print(f"Warning: no price data for '{name}' ({g['etf']}) — dropping it from this report.",
                  file=sys.stderr)
            continue
        etf_close[name] = close
    groups = {name: g for name, g in groups.items() if name in etf_close}

    srs_df = metrics.build_srs_table(etf_close, bench_close)
    srs_delta = metrics.srs_and_delta(srs_df)

    rows = []
    for name, g in groups.items():
        tickers = g["tickers"]
        breadth_pct, breadth_trend = metrics.sector_breadth(prices, tickers)
        leaders = metrics.leader_count(prices, tickers)
        accum = metrics.accumulation_ratio(prices, tickers)
        ema_stack, ema_slope = metrics.ema_stack_and_slope(etf_close[name])
        rel_vol, vol_trend = metrics.volume_profile(prices, tickers)
        streaks = metrics.streak_profile(prices, tickers)
        srs = srs_delta.loc[name, "SRS"]
        delta = srs_delta.loc[name, "Delta3D"]
        rows.append({
            "Name": name,
            "Kind": g["kind"],
            "ETF": g["etf"],
            "SRS": round(srs, 3),
            "D3D": round(delta, 3),
            "Breadth%": round(breadth_pct, 1) if breadth_pct == breadth_pct else None,
            "BreadthTrend": breadth_trend,
            "EMAStack": ema_stack,
            "EMASlope": ema_slope,
            "RelVol": round(rel_vol, 2) if rel_vol == rel_vol else None,
            "VolTrend": vol_trend,
            "Streak3+": streaks["streak_leaders"],
            "AvgStreak": round(streaks["avg_streak"], 1) if streaks["avg_streak"] == streaks["avg_streak"] else None,
            "Breakouts20d": leaders["breakouts"],
            "HigherLows": leaders["higher_lows"],
            "Universe": leaders["universe"],
            "AccumRatio": round(accum, 3) if accum == accum else None,
            "Status": metrics.classify_status(srs, delta, ema_stack, ema_slope, vol_trend, breadth_trend),
        })

    report = pd.DataFrame(rows).sort_values("SRS", ascending=False).reset_index(drop=True)

    print(f"\nSector & Theme Rotation Report — {dt.date.today().isoformat()}\n")
    print(tabulate(report, headers="keys", tablefmt="simple", showindex=False))

    out_path = output or str(config.DATA_DIR / f"report_{dt.date.today().isoformat()}.csv")
    report.to_csv(out_path, index=False)
    print(f"\nSaved to {out_path}", file=sys.stderr)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max-per-sector", type=int, default=config.MAX_TICKERS_PER_SECTOR,
                         help="Cap constituents per sector for a faster run (default: use all)")
    parser.add_argument("--max-per-theme", type=int, default=config.MAX_TICKERS_PER_THEME,
                         help="Cap constituents per theme ETF for a faster run (default: use all)")
    parser.add_argument("--no-themes", action="store_true", help="Only report the 11 broad GICS sectors")
    parser.add_argument("--refresh", action="store_true", help="Bypass today's cached data and re-download")
    parser.add_argument("--output", type=str, default=None, help="CSV output path (default: data/report_<date>.csv)")
    args = parser.parse_args()
    run(args.max_per_sector, args.max_per_theme, args.refresh, args.output,
        include_themes=not args.no_themes)


if __name__ == "__main__":
    main()
