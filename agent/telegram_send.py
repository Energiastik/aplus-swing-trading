"""Push the finished PDF (and an optional short caption) to the configured
Telegram chat. Reads TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID from the
environment. This repo is public and the claude.ai routine platform has no
environment-secrets store, so there's no "set it once, forget it" option —
pass the two values inline on the command line that invokes this module (see
strategy/ROUTINE_PROMPT.md for how the automated routine does it). Never
commit real values into this repo.

Usage:
    TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... \
      python -m agent.telegram_send output/swing_report_2026-08-07.pdf "3 candidates today"
"""
from __future__ import annotations
import os
import sys

import requests


def send_document(path: str, caption: str = "") -> bool:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    url = f"https://api.telegram.org/bot{token}/sendDocument"
    with open(path, "rb") as f:
        resp = requests.post(url, data={"chat_id": chat_id, "caption": caption[:1024]},
                              files={"document": f}, timeout=60)
    resp.raise_for_status()
    ok = resp.json().get("ok", False)
    if not ok:
        print(f"[telegram_send] Telegram rejected the send: {resp.text}", file=sys.stderr)
    return ok


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m agent.telegram_send <pdf_path> [caption]", file=sys.stderr)
        sys.exit(1)
    path = sys.argv[1]
    caption = sys.argv[2] if len(sys.argv) > 2 else ""
    ok = send_document(path, caption)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
