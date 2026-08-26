"""Chart-vision module: render the chart the way a trader sees it, send to Claude vision,
get a structured grade + entry plan. This is what makes the agent 'look at the graph itself'."""
from __future__ import annotations
import base64
import json
import os
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CHART_DIR = ROOT / "output" / "charts"
CHART_DIR.mkdir(parents=True, exist_ok=True)
VISION_PROMPT = (ROOT / "strategy" / "vision_prompt.md").read_text(encoding="utf-8")
MODEL = os.getenv("VISION_MODEL", "claude-sonnet-4-6")


def render_chart(ticker: str, df: pd.DataFrame, months: int = 9, t=None) -> Path:
    """Daily candles + EMA 9/21/50/200 + volume w/ 50d MA, plus (new) historical S/R
    zones, Fibonacci retracement levels, volume-profile POC/VAH/VAL, and the anchored
    VWAP -- all the confluence signals from technicals.read() made visible, not just
    numeric. Single-color candles per the course's 'red/green is a bug, not a
    feature' stance is optional — kept classic but muted so the vision model reads
    structure, not color emotion.

    `t`: pass an existing technicals.read(df) result to skip recomputing it here.
    """
    import mplfinance as mpf
    from .technicals import ema, read as tech_read

    if t is None:
        t = tech_read(df)

    d = df.iloc[-(months * 21):].copy()
    adds = [
        mpf.make_addplot(ema(df["Close"], 9).iloc[-len(d):], color="#4fc3f7", width=0.9),
        mpf.make_addplot(ema(df["Close"], 21).iloc[-len(d):], color="#ffb74d", width=1.1),
        mpf.make_addplot(ema(df["Close"], 50).iloc[-len(d):], color="#ba68c8", width=1.2),
        mpf.make_addplot(ema(df["Close"], 200).iloc[-len(d):], color="#e57373", width=1.4),
        mpf.make_addplot(df["Volume"].rolling(50).mean().iloc[-len(d):],
                         panel=1, color="#90a4ae", width=1.0),
    ]

    # Anchored VWAP: only drawn from the anchor date forward (NaN before it), so it
    # reads as "the line that starts at the catalyst day," not a full-width average.
    if t.vwap_anchor_date:
        anchor_ts = pd.Timestamp(t.vwap_anchor_date, tz=df.index.tz)
        if anchor_ts in df.index:
            anchor_pos = df.index.get_loc(anchor_ts)
            from_anchor = df.iloc[anchor_pos:]
            typical = (from_anchor["High"] + from_anchor["Low"] + from_anchor["Close"]) / 3
            vwap_series = (typical * from_anchor["Volume"]).cumsum() / from_anchor["Volume"].cumsum()
            vwap_full = pd.Series(np.nan, index=df.index)
            vwap_full.loc[from_anchor.index] = vwap_series
            if vwap_full.iloc[-len(d):].notna().any():
                adds.append(mpf.make_addplot(vwap_full.iloc[-len(d):], color="#d4af37",
                                             width=1.3, linestyle="-."))

    # Historical S/R zones (dashed, width by strength) + Fibonacci + volume-profile
    # POC/VAH/VAL (dotted) -- only levels inside the visible price range, so the
    # y-axis doesn't stretch to include an old base far below/above what's shown.
    vis_lo, vis_hi = float(d["Low"].min()), float(d["High"].max())
    def in_view(level: float | None) -> bool:
        return level is not None and vis_lo * 0.97 <= level <= vis_hi * 1.03

    # mplfinance's hlines only accepts ONE linestyle for the whole set (a list there
    # fails validation) -- colors and widths are still per-line, so zone type/strength
    # is distinguished by color+width, not dash pattern. Colors chosen to NOT collide
    # with the 4 EMA colors above (light blue/orange/purple/red) -- S/R uses hot
    # pink/spring-green (not red, which is EMA200's color), Fib uses plain white
    # (maximally distinct from every colored curve), POC/VA uses cyan. Capped at the
    # 3 strongest S/R zones -- 6 was too cluttered to read.
    hline_levels, hline_colors, hline_widths = [], [], []
    for z in t.sr_zones[:3]:
        if in_view(z["level"]):
            hline_levels.append(z["level"])
            hline_colors.append("#ff4081" if z["type"] == "resistance" else "#00e676")
            hline_widths.append(0.7 + 0.35 * z["strength"])
    for lvl in (t.fib_382, t.fib_500, t.fib_618):
        if in_view(lvl):
            hline_levels.append(lvl)
            hline_colors.append("#fff176")
            hline_widths.append(0.7)
    for lvl in (t.poc, t.vah, t.val):
        if in_view(lvl):
            hline_levels.append(lvl)
            hline_colors.append("#00e5ff")
            hline_widths.append(0.7)

    style = mpf.make_mpf_style(base_mpf_style="nightclouds",
                               marketcolors=mpf.make_marketcolors(
                                   up="#26a69a", down="#546e7a", edge="inherit",
                                   wick="inherit", volume="in"))
    out = CHART_DIR / f"{ticker}.png"
    plot_kwargs = dict(type="candle", volume=True, addplot=adds, style=style,
                        title=f"{ticker} — D, EMA 9/21/50/200 · S/R, Fib, VWAP, POC/VA",
                        figsize=(12, 7),
                        savefig=dict(fname=str(out), dpi=110, bbox_inches="tight"))
    if hline_levels:
        # alpha=0.75 blends #eeeeee down to a mid-gray nearly identical to the style's
        # own gridline gray -- the Fib lines rendered but were visually indistinguishable
        # from grid. Full opacity keeps them a distinct near-white.
        plot_kwargs["hlines"] = dict(hlines=hline_levels, colors=hline_colors,
                                     linestyle="--", linewidths=hline_widths,
                                     alpha=1.0)
    mpf.plot(d, **plot_kwargs)
    return out


def grade(ticker: str, chart_path: Path, context: dict) -> dict:
    """Send chart image + numeric context to Claude; return parsed JSON verdict."""
    import anthropic
    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY from env
    img_b64 = base64.standard_b64encode(chart_path.read_bytes()).decode()
    ctx = json.dumps(context, default=str)
    msg = client.messages.create(
        model=MODEL,
        max_tokens=700,
        system=VISION_PROMPT,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image",
                 "source": {"type": "base64", "media_type": "image/png", "data": img_b64}},
                {"type": "text",
                 "text": f"Ticker: {ticker}\nNumeric context: {ctx}\n"
                         f"Grade this chart. JSON only."},
            ],
        }],
    )
    text = "".join(b.text for b in msg.content if b.type == "text").strip()
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"grade": "C", "note": f"unparseable vision reply: {text[:120]}",
                "entry_type": "none", "pattern": "none"}
