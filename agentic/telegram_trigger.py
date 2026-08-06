"""One-tap trigger: send /scan to your bot in Telegram -> full pipeline runs -> Top 10
arrives back in the same chat. Keep this running on your server (Railway worker / systemd).

  /scan        full run (with chart vision)
  /scan fast   numeric-only run (no vision, free & quick)
  /regime      just the market regime + sector table (30 seconds)

Run:  python -m agentic.telegram_trigger
Env:  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (only this chat may trigger), ANTHROPIC_API_KEY
"""
from __future__ import annotations
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ALLOWED_CHAT = str(os.environ["TELEGRAM_CHAT_ID"])
API = f"https://api.telegram.org/bot{TOKEN}"


def send(text: str) -> None:
    requests.post(f"{API}/sendMessage",
                  data={"chat_id": ALLOWED_CHAT, "text": text}, timeout=30)


def run_pipeline(extra: list[str]) -> None:
    send("🔄 Scan started — керемет, 2–5 минут күте тұрыңыз...")
    cmd = [sys.executable, "-m", "agent.main"] + extra
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=1800)
    if p.returncode != 0:
        send(f"❌ Run failed:\n{(p.stderr or p.stdout)[-800:]}")
    # success: agent.main sends the report + charts to Telegram itself


def run_regime_only() -> None:
    sys.path.insert(0, str(ROOT))
    from agent import market_regime, sector_rotation
    r = market_regime.assess()
    lines = [f"Regime: {r.mode} ({r.score}/4) · VIX {r.vix:.1f}" if r.vix
             else f"Regime: {r.mode} ({r.score}/4)"]
    lines += [("✅" if ok else "❌") + " " + k for k, ok in r.checks.items()]
    df = sector_rotation.score().head(5)
    lines.append("Top sectors:")
    lines += [f"  {row['etf']} {row['sector']} — {row['raw_score']}/3"
              for _, row in df.iterrows()]
    send("\n".join(lines))


def main() -> None:
    offset = None
    print("listening for /scan ...")
    while True:
        try:
            r = requests.get(f"{API}/getUpdates",
                             params={"timeout": 50, "offset": offset}, timeout=60).json()
            for u in r.get("result", []):
                offset = u["update_id"] + 1
                msg = u.get("message") or {}
                if str(msg.get("chat", {}).get("id")) != ALLOWED_CHAT:
                    continue  # ignore anyone who isn't you
                text = (msg.get("text") or "").strip().lower()
                if text.startswith("/scan"):
                    run_pipeline(["--no-vision"] if "fast" in text else [])
                elif text.startswith("/regime"):
                    run_regime_only()
        except Exception as e:
            print("poll error:", e)
            time.sleep(10)


if __name__ == "__main__":
    main()
