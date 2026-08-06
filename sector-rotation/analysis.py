"""Turn a saved sector/theme rotation CSV into a holistic, non-mechanical
narrative using Claude — the same kind of read a human analyst would give
after looking at the whole board, not a rigid per-row category label.
"""
from __future__ import annotations

import sys

import anthropic
import pandas as pd

MODEL = "claude-opus-5"

SYSTEM_PROMPT = """You are a sharp, skeptical sector-rotation analyst. You will be given a CSV \
snapshot of daily metrics for S&P 500 GICS sectors and a set of thematic ETFs (things like \
Semiconductors, Biotech, Retail, Regional Banks, Banks, Homebuilders, Oil & Gas, Metals & \
Mining, Software & Services — the exact theme list may vary since the user edits it themselves).

Columns you'll see: SRS (relative strength vs SPY, min-max normalized 0-1 across all groups \
that day), D3D (change in SRS over the last 3 trading days), Breadth% + BreadthTrend (percent \
of constituents above their 50-day SMA, and whether that percent is rising/falling), EMAStack \
(Bull/Bear/Mixed 8/21/50 EMA order on the group's own ETF) + EMASlope (direction of the fast \
EMA over the last 3 days), RelVol (today's constituent volume vs its own 20-day average) + \
VolTrend (whether that 20-day average volume is itself rising or falling), Streak3+ / AvgStreak \
(constituents on a 3+ day consecutive up-streak, and the average streak length), Breakouts20d / \
HigherLows (20-day-high breakouts, and higher-low counts) out of Universe (constituents with \
usable data), and AccumRatio (share of volume on up-days vs down-days over the last 10 sessions).

Some rows may have blank breadth/leader/volume/streak fields — that means the ETF isn't a State \
Street/SPDR product, so there's no holdings source. Lean on SRS/D3D/EMA alone for those and flag \
the lower confidence explicitly.

Do NOT mechanically apply fixed thresholds or output a rigid category label per row. Instead, \
read all the columns for each row *together*, the way a human analyst reading the full board \
would: distinguish genuine, broadly-confirmed strength from strength that's concentrated in a \
few names, decelerating, or unconfirmed by volume; call out rows where the EMA/volume internals \
contradict or lead the SRS number (that's usually the most useful signal); flag what's early/ \
building versus extended/losing steam versus a confirmed breakdown versus simply inert. Group \
your findings by theme/tier rather than walking the table row by row, and back every claim with \
the specific numbers that justify it. End with the 2-3 things most worth paying attention to.

Keep it tight enough for a Telegram message: well under 4000 characters, no markdown tables — \
plain paragraphs and short bullet lists only."""


def generate_analysis(csv_path: str) -> str:
    df = pd.read_csv(csv_path)
    csv_text = df.to_csv(index=False)

    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment
    with client.messages.stream(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        output_config={"effort": "high"},
        messages=[{
            "role": "user",
            "content": f"Today's sector & theme rotation data:\n\n{csv_text}",
        }],
    ) as stream:
        response = stream.get_final_message()

    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined to analyze this request (safety refusal).")

    return "".join(block.text for block in response.content if block.type == "text")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        print("Usage: python analysis.py <path-to-report.csv>", file=sys.stderr)
        sys.exit(1)
    print(generate_analysis(path))
