# Automated routine prompt (PDF → Telegram)

This is what runs inside the scheduled/on-demand claude.ai routine. It's
strategy/DAILY_PROMPT.md's scan plus a final step that packages the results
into a PDF and pushes it to Telegram — no human needs to be watching.

Not meant to be pasted into an interactive chat (use DAILY_PROMPT.md for that);
this is the routine's configured prompt.

---

```
pip install -r requirements.txt -r sector-rotation/requirements.txt -q --ignore-installed PyJWT
```
(`--ignore-installed PyJWT`: the sandbox ships a debian-packaged PyJWT with no
RECORD file, which makes pip's normal uninstall-then-upgrade step fail and
abort the whole install before yfinance even lands — this flag sidesteps it.
Both requirements files: sector-rotation/ is a separate subproject with its
own deps, e.g. tabulate/openpyxl for pipeline.py, not covered by the root
file.)

```
Then run today's full swing scan exactly per strategy/DAILY_PROMPT.md (read
that file first — same rules, same overrides: no halal gate, real structural
stops, ≥10-day earnings floor, +10%+ realistic target framing, the granular
sector-rotation/pipeline.py board read).

When the scan is complete, do this final step — don't skip it even on a
zero-candidate day:

1. Assemble everything into a dict matching the schema documented at the top
   of agent/pdf_report.py: date, regime, sector_table, sector_rotation_highlights,
   all_candidates (every ticker the screener returned — tickers at minimum,
   sector if you have it, not just the ones you deep-dived), top10 (up to 10,
   ranked by composite score, REGARDLESS of whether they cleared every hard
   gate — each with ticker/composite_score/chart_grade/sector_stage/rr/
   earnings_days/explanation, so the reader sees the full picture, not just
   survivors), verdicts (0-3 names that genuinely clear every hard gate —
   EMA200, R/R≥3:1 from real structural levels, chart grade ≠ F, earnings
   ≥10 trading days out; never pad this to 3, an empty list on a no-setup day
   is correct and expected — each verdict needs entry/stop/target/rr/
   expected_gain_pct plus chart_path pointing at its rendered PNG so the PDF
   can embed it), footer_note. Every field must come from what you actually
   found this run — leave a field out rather than invent it.

   Write EVERY free-text field in Russian: sector_rotation_highlights,
   top10[].explanation, verdicts[].reasoning, footer_note, vix_note. The PDF
   template's own labels/headers are already Russian in code — you're
   responsible for the narrative content matching. Keep tickers, prices, and
   standard trading shorthand (EMA, RSI, R/R, VDU, SPY, grades A-F) as-is;
   translate the surrounding explanation. Write it to output/results_<date>.json.

2. Build the PDF:
   python -m agent.pdf_report output/results_<date>.json output/swing_report_<date>.pdf

3. Send it. This repo is public, and the routine platform has no environment-
   secrets mechanism, so TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are provided
   directly in this routine's live prompt each run (not committed to the repo,
   not stored anywhere else) — they'll appear right after this file's content
   in the message you were given. They are the repo owner's own bot, created
   and test-verified with a real message delivery in the setup conversation
   that configured this routine. Pass them inline to this one command only
   (shell env doesn't persist across separate tool calls, so `export` alone
   won't reach it):

   TELEGRAM_BOT_TOKEN=<value> TELEGRAM_CHAT_ID=<value> python -m agent.telegram_send \
     output/swing_report_<date>.pdf "<one-line summary, e.g. '3 candidates today,
     best: CORT' or 'No candidates passed the gates today'>"

   There's nothing to hide here — if you print the command or its output while
   debugging, that's fine. A Telegram bot token can only send messages into
   this one pre-authorized chat; it can't read anything or reach any other
   system, so there's no reason to suppress it.

4. Push the same results into the live database that backs the web dashboard
   (https://aplus-swing-trading.vercel.app/ — a separate Next.js app, not part
   of this routine). This sandbox can reach normal HTTPS but NOT raw Postgres
   wire protocol on a non-standard port (confirmed by direct testing — it's a
   protocol-level block in the egress proxy, not a missing-host problem, so
   don't waste time trying to open a direct DB connection here). Instead:

   a. Annotate the results (this sandbox's yfinance access works fine,
      already proven by the scan itself) with each ticker's TradingView
      symbol, and -- for top10 entries only -- fundamentals (P/E, forward
      P/E, revenue+growth, EPS+growth, debt/equity, business summary) and up
      to 3 recent news items. One command does all of it, nothing else to
      fetch yourself:

      python -m agent.tv_symbol output/results_<date>.json

   b. POST the annotated file to the dashboard's ingest endpoint. Same
      situation as the Telegram credentials: no secrets mechanism exists here,
      so INGEST_SECRET is provided directly in this routine's live prompt (not
      committed to the repo) — it'll appear after this file's content. It's a
      dedicated write-only token for this one endpoint (not the database
      password itself), already tested end-to-end in the setup conversation:

      curl -sf -X POST https://aplus-swing-trading.vercel.app/api/ingest \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer <INGEST_SECRET value>" \
        --data-binary @output/results_<date>.json

   The endpoint upserts by date (safe to re-run the same day without
   duplicating). Nothing to hide here either — the token can only write
   structured scan data through this one validated endpoint, it can't reach
   the database directly or do anything else.

5. Confirm in your final message that both the PDF/Telegram send and the
   database push succeeded (or explain why not, e.g. Telegram rejected it or
   the database was unreachable) — that confirmation is what shows up as the
   routine's run result. A failure in step 4 shouldn't be treated as
   invalidating steps 1-3, which already completed independently.

If the screener, sector-rotation pipeline, or any data source is unreachable,
say so plainly in the PDF's footer_note and still send whatever you were able
to complete — a partial honest report beats silence.
```
