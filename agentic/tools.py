"""MCP tools for the swing agent — the pipeline modules exposed as tools Claude can call.

Two consumers:
  1. agentic/run_daily.py  — in-process SDK MCP server (Claude Agent SDK, headless daily run)
  2. agentic/mcp_stdio.py  — same tools as a stdio server for Claude Desktop / Claude Code
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agent import data, market_regime, sector_rotation, screener, technicals, halal, report  # noqa: E402


# ---------- plain functions (shared by both servers) ----------

def t_market_regime() -> str:
    r = market_regime.assess()
    return json.dumps({"score": r.score, "mode": r.mode, "checks": r.checks,
                       "size_multiplier": r.size_multiplier, "vix": r.vix,
                       "vix_note": r.vix_note})


def t_sector_rotation() -> str:
    df = sector_rotation.score()
    return df.to_json(orient="records")


def t_run_screener(limit: int = 40) -> str:
    df, source = screener.run(limit=limit)
    return json.dumps({"source": source, "candidates": df.to_dict(orient="records")})


def t_technical_read(ticker: str) -> str:
    df = data.history(ticker, period="2y")
    if df.empty or len(df) < 120:
        return json.dumps({"error": f"no data for {ticker}"})
    t = technicals.read(df)
    e, s, tg = technicals.stop_and_entry(t)
    return json.dumps({
        "ticker": ticker, "price": t.price, "ema9": t.ema9, "ema21": t.ema21,
        "ema50": t.ema50, "ema200": t.ema200, "stacked": t.stacked,
        "above_200": t.above_200, "rsi14": round(t.rsi14, 1), "vdu": t.vdu,
        "atr_pct": round(t.atr_pct, 2), "pivot": t.pivot,
        "dist_to_pivot_pct": t.dist_to_pivot_pct, "extended": t.extended,
        "rs_weighted_return": None if t.rs_raw != t.rs_raw else round(t.rs_raw, 3),
        "suggested_entry": e, "suggested_stop": s, "suggested_target": tg,
        "rally_low": t.rally_low, "fib_382": t.fib_382, "fib_500": t.fib_500,
        "fib_618": t.fib_618, "near_fib_level": t.near_fib_level,
        "near_fib_dist_pct": t.near_fib_dist_pct,
        "vwap_anchor": t.vwap_anchor, "vwap_anchor_date": t.vwap_anchor_date,
        "dist_to_vwap_pct": t.dist_to_vwap_pct,
        "liquidity_sweep": t.liquidity_sweep, "liquidity_sweep_low": t.liquidity_sweep_low,
        "flags": t.flags})


def t_confluence_count(ticker: str, entry: float) -> str:
    """How many independent support/resistance signals (EMA21/50, Fibonacci levels,
    anchored VWAP, liquidity-sweep reclaim level) sit within ~2% of a proposed entry
    price. Call after you've settled on a real entry from the chart, not before."""
    df = data.history(ticker, period="2y")
    if df.empty or len(df) < 120:
        return json.dumps({"error": f"no data for {ticker}"})
    t = technicals.read(df)
    count, hits = technicals.confluence_count(t, entry)
    return json.dumps({"ticker": ticker, "entry": entry, "confluence_count": count,
                       "signals": hits})


def t_render_chart(ticker: str) -> str:
    """Render the daily chart PNG (EMA 9/21/50/200 + volume). Returns the file path —
    the agent should then Read the image to look at it."""
    from agent.chart_vision import render_chart
    df = data.history(ticker, period="2y")
    if df.empty:
        return json.dumps({"error": f"no data for {ticker}"})
    p = render_chart(ticker, df)
    return json.dumps({"chart_path": str(p)})


def t_halal_screen(ticker: str, industry: str = "", sector: str = "") -> str:
    r = halal.screen(ticker, industry, sector)
    return json.dumps({"ticker": ticker, "status": r.status,
                       "reasons": r.reasons, "ratios": r.ratios})


def t_earnings_days(ticker: str) -> str:
    return json.dumps({"ticker": ticker, "days_to_earnings": data.next_earnings_days(ticker)})


def t_send_telegram(text: str) -> str:
    ok = report.send_telegram(text)
    return json.dumps({"sent": ok})


# ---------- SDK MCP server (in-process, for claude-agent-sdk) ----------

def build_sdk_server():
    from claude_agent_sdk import tool, create_sdk_mcp_server

    def wrap(fn):
        async def inner(args):
            try:
                out = fn(**args)
            except Exception as e:  # tools must never crash the loop
                out = json.dumps({"error": str(e)})
            return {"content": [{"type": "text", "text": out}]}
        return inner

    tools = [
        tool("market_regime", "Day-3 weekly regime checklist: SPY/EMA200, QQQ 4w high, "
             "VIX, weekly SPY. Returns score 0-4 and mode.", {})(wrap(t_market_regime)),
        tool("sector_rotation", "Score 11 sector ETFs vs SPY over 1W/4W/12W "
             "(recency-weighted).", {})(wrap(t_sector_rotation)),
        tool("run_screener", "Day-4 Finviz funnel (fundamental+technical filters). "
             "Returns candidate tickers with sector/industry.",
             {"limit": int})(wrap(t_run_screener)),
        tool("technical_read", "Full Day-3 technical read for one ticker: EMA stack, RSI, "
             "VDU, ATR, pivot, suggested entry/stop/target.",
             {"ticker": str})(wrap(t_technical_read)),
        tool("render_chart", "Render daily candlestick PNG with EMA 9/21/50/200 and volume "
             "for a ticker; returns file path. READ the image afterwards to inspect the "
             "chart visually.", {"ticker": str})(wrap(t_render_chart)),
        tool("halal_screen", "AAOIFI halal screen (business + 3 ratios). "
             "PASS/REVIEW/FAIL.", {"ticker": str, "industry": str, "sector": str}
             )(wrap(t_halal_screen)),
        tool("earnings_days", "Days until next earnings report.",
             {"ticker": str})(wrap(t_earnings_days)),
        tool("send_telegram", "Send the final report text to the configured Telegram chat.",
             {"text": str})(wrap(t_send_telegram)),
    ]
    return create_sdk_mcp_server(name="swing", version="1.0.0", tools=tools)
