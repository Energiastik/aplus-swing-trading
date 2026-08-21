"""Same tools as a standalone stdio MCP server — plug into Claude Desktop or Claude Code
so you can ask interactively: "run my screener", "show me the technical read on NVDA",
"is COHR halal?" from any chat.

Claude Desktop config (claude_desktop_config.json) / Claude Code (.mcp.json):
{
  "mcpServers": {
    "swing": {
      "command": "python3",
      "args": ["/absolute/path/swing-agent/agentic/mcp_stdio.py"],
      "env": {"TELEGRAM_BOT_TOKEN": "...", "TELEGRAM_CHAT_ID": "..."}
    }
  }
}
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mcp.server.fastmcp import FastMCP  # noqa: E402
from agentic import tools as T  # noqa: E402

mcp = FastMCP("swing")

mcp.tool(description="Day-3 weekly market regime checklist (score 0-4, mode)")(T.t_market_regime)
mcp.tool(description="11 sector ETFs vs SPY over 1W/4W/12W, recency-weighted")(T.t_sector_rotation)
mcp.tool(description="Day-4 screener funnel — candidate tickers")(T.t_run_screener)
mcp.tool(description="Full technical read for a ticker (EMA/RSI/VDU/pivot/entry/stop/Fibonacci/anchored VWAP/liquidity sweep)")(T.t_technical_read)
mcp.tool(description="Confluence count (EMA/Fib/VWAP/liquidity-sweep) near a proposed entry price")(T.t_confluence_count)
mcp.tool(description="Render daily chart PNG with EMAs+volume; returns path")(T.t_render_chart)
mcp.tool(description="AAOIFI halal screen: PASS/REVIEW/FAIL")(T.t_halal_screen)
mcp.tool(description="Days to next earnings")(T.t_earnings_days)
mcp.tool(description="Send text to the configured Telegram chat")(T.t_send_telegram)

if __name__ == "__main__":
    mcp.run()  # stdio transport
