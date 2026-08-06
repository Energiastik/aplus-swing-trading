"""Headless daily agentic run — Claude Agent SDK.

Unlike agent/main.py (fixed pipeline), here Claude ORCHESTRATES: it calls the MCP tools
in whatever order the situation demands, LOOKS at rendered charts with its own vision
(via the Read tool on the PNG files), can dig deeper into ambiguous names, and writes
the final report itself — grounded in strategy/STRATEGY.md.

Run:      python -m agentic.run_daily
Schedule: cron / Railway cron service (see README).

Prereqs:  pip install claude-agent-sdk   (needs Node.js 18+, the SDK drives the
          Claude Code engine under the hood)
          export ANTHROPIC_API_KEY=...
"""
from __future__ import annotations
import asyncio
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from claude_agent_sdk import (  # noqa: E402
    query, ClaudeAgentOptions, ResultMessage, SystemMessage, AssistantMessage,
)
from agentic.tools import build_sdk_server  # noqa: E402

STRATEGY = (ROOT / "strategy" / "STRATEGY.md").read_text()

MISSION = f"""You are the daily swing-trading analyst agent. Today is {date.today()}.
Your rulebook (non-negotiable) is below between <strategy> tags.

Produce today's report by working through the tools:
1. market_regime — if score is 0–1, the day is WATCHLIST-ONLY (still finish the report,
   labeled as such).
2. sector_rotation — identify top-3 sectors and any turning-up-from-weakness story.
3. run_screener — get candidates. If it returns very few, note it; never force setups.
4. For the ~12 strongest by technical_read: render_chart and then READ each PNG to
   visually grade the chart (stage, base quality, VCP/VDU, equal-highs stop-hunt risk,
   extension past pivot) exactly per the rulebook's visual criteria.
5. halal_screen + earnings_days for survivors. halal FAIL, below EMA200, R/R < 3:1,
   or broken chart structure = hard rejection.
6. Score each survivor on the 9-question A+ checklist. Rank. Keep at most 10.
7. Write the final report in the rulebook's output format (regime verdict, sector table,
   Top ≤10 with entry/stop/target/R:R/size at 1% risk on $10,000, one-line chart read
   per name, halal status with 'confirm in Zoya'). End with the standard reminders.
8. send_telegram with the final report text.

Be strict and honest: an empty list is a valid answer. Never invent data — every number
must come from a tool result.

<strategy>
{STRATEGY}
</strategy>
"""


async def main() -> None:
    options = ClaudeAgentOptions(
        mcp_servers={"swing": build_sdk_server()},
        allowed_tools=["mcp__swing__*", "Read"],   # Read = lets Claude view chart PNGs
        max_turns=60,
        cwd=str(ROOT),
    )
    async for message in query(prompt=MISSION, options=options):
        if isinstance(message, SystemMessage) and message.subtype == "init":
            bad = [s for s in message.data.get("mcp_servers", [])
                   if s.get("status") in ("failed", "needs-auth")]
            if bad:
                print(f"[warn] MCP servers unavailable: {bad}")
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if hasattr(block, "name") and str(getattr(block, "name", "")).startswith("mcp__"):
                    print(f"  → tool: {block.name}")
        if isinstance(message, ResultMessage):
            if message.subtype == "success":
                out = ROOT / "output" / f"agentic_report_{date.today()}.md"
                out.write_text(message.result or "")
                print(f"\n=== DONE — saved {out} ===\n")
                print(message.result)
            else:
                print(f"[error] run ended with subtype={message.subtype}")


if __name__ == "__main__":
    asyncio.run(main())
