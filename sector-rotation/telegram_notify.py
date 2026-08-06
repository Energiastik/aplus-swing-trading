"""Send a message to a Telegram chat via the Bot API, chunked to stay under
Telegram's 4096-character message limit.
"""
from __future__ import annotations

import os
import sys

import requests

TELEGRAM_MAX_LEN = 4000  # a little under Telegram's 4096 hard limit


def send_telegram_message(text: str, bot_token: str | None = None, chat_id: str | None = None) -> None:
    bot_token = bot_token or os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = chat_id or os.environ["TELEGRAM_CHAT_ID"]
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    for i in range(0, len(text), TELEGRAM_MAX_LEN):
        chunk = text[i:i + TELEGRAM_MAX_LEN]
        resp = requests.post(url, json={"chat_id": chat_id, "text": chunk}, timeout=30)
        resp.raise_for_status()


if __name__ == "__main__":
    message = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    send_telegram_message(message)
