"""Chart-vision module: render the chart the way a trader sees it, send to Claude vision,
get a structured grade + entry plan. This is what makes the agent 'look at the graph itself'."""
from __future__ import annotations
import base64
import json
import os
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CHART_DIR = ROOT / "output" / "charts"
CHART_DIR.mkdir(parents=True, exist_ok=True)
VISION_PROMPT = (ROOT / "strategy" / "vision_prompt.md").read_text(encoding="utf-8")
MODEL = os.getenv("VISION_MODEL", "claude-sonnet-4-6")


def render_chart(ticker: str, df: pd.DataFrame, months: int = 9) -> Path:
    """Daily candles + EMA 9/21/50/200 + volume w/ 50d MA. Single-color candles per
    the course's 'red/green is a bug, not a feature' stance is optional — kept classic
    but muted so the vision model reads structure, not color emotion."""
    import mplfinance as mpf
    from .technicals import ema

    d = df.iloc[-(months * 21):].copy()
    adds = [
        mpf.make_addplot(ema(df["Close"], 9).iloc[-len(d):], color="#4fc3f7", width=0.9),
        mpf.make_addplot(ema(df["Close"], 21).iloc[-len(d):], color="#ffb74d", width=1.1),
        mpf.make_addplot(ema(df["Close"], 50).iloc[-len(d):], color="#ba68c8", width=1.2),
        mpf.make_addplot(ema(df["Close"], 200).iloc[-len(d):], color="#e57373", width=1.4),
        mpf.make_addplot(df["Volume"].rolling(50).mean().iloc[-len(d):],
                         panel=1, color="#90a4ae", width=1.0),
    ]
    style = mpf.make_mpf_style(base_mpf_style="nightclouds",
                               marketcolors=mpf.make_marketcolors(
                                   up="#26a69a", down="#546e7a", edge="inherit",
                                   wick="inherit", volume="in"))
    out = CHART_DIR / f"{ticker}.png"
    mpf.plot(d, type="candle", volume=True, addplot=adds, style=style,
             title=f"{ticker} — D, EMA 9/21/50/200", figsize=(12, 7),
             savefig=dict(fname=str(out), dpi=110, bbox_inches="tight"))
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
