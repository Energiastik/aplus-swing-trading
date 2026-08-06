# Automated routine prompt (PDF → Telegram)

This is what runs inside the scheduled/on-demand claude.ai routine. It's
strategy/DAILY_PROMPT.md's scan plus a final step that packages the results
into a PDF and pushes it to Telegram — no human needs to be watching.

Not meant to be pasted into an interactive chat (use DAILY_PROMPT.md for that);
this is the routine's configured prompt.

---

```
pip install -r requirements.txt -q

Then run today's full swing scan exactly per strategy/DAILY_PROMPT.md (read
that file first — same rules, same overrides: no halal gate, real structural
stops, ≥10-day earnings floor, +10%+ realistic target framing, the granular
sector-rotation/pipeline.py board read).

When the scan is complete, do this final step — don't skip it even on a
zero-candidate day:

1. Assemble everything into a dict matching the schema documented at the top
   of agent/pdf_report.py (date, regime, sector_table, sector_rotation_highlights,
   screener_count, candidates[], rejected_count, best_pick, footer_note). Every
   field must come from what you actually found this run — leave a field out
   rather than invent it. Write it to output/results_<date>.json.

2. Build the PDF:
   python -m agent.pdf_report output/results_<date>.json output/swing_report_<date>.pdf

3. Send it:
   python -m agent.telegram_send output/swing_report_<date>.pdf "<one-line summary,
   e.g. '3 candidates today, best: CORT' or 'No candidates passed the gates today'>"

   TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are already set as environment
   secrets on this routine — don't ask for them, don't print them.

4. Confirm in your final message that the PDF was sent (or explain why not,
   e.g. Telegram rejected it) — that confirmation is what shows up as the
   routine's run result.

If the screener, sector-rotation pipeline, or any data source is unreachable,
say so plainly in the PDF's footer_note and still send whatever you were able
to complete — a partial honest report beats silence.
```
