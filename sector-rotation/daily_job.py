"""Daily entrypoint: refresh sector/theme data, get Claude's holistic read,
send it to Telegram. Meant to run as a scheduled one-shot job (e.g. a Railway
cron service) — it does its work and exits, it does not stay running.
"""
from __future__ import annotations

import datetime as dt
import sys
import traceback

import analysis
import config
import pipeline
import telegram_notify


def main():
    pipeline.run(max_per_sector=None, max_per_theme=None, refresh=True, output=None)
    csv_path = config.DATA_DIR / f"report_{dt.date.today().isoformat()}.csv"

    print("Generating Claude analysis...", file=sys.stderr)
    write_up = analysis.generate_analysis(str(csv_path))

    print("Sending to Telegram...", file=sys.stderr)
    telegram_notify.send_telegram_message(write_up)
    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
