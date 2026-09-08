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

If a MARKETDATA_API_TOKEN value appears in this routine's live prompt (same
no-secrets-mechanism situation as Telegram/INGEST below — it would appear
after this file's content, not committed anywhere), pass it as the
`options_token` argument on every t_options_walls / t_confluence_count(...,
include_options_walls=True) call for the Top ≤3 in DAILY_PROMPT.md's final
step — it's a tool-call argument here, not a shell env var, because those are
MCP tool calls inside this session, not standalone `python -m` commands. If no
token was provided, just omit it — the module falls back to yfinance
automatically, no error either way.

Same pattern for FRED_API_KEY if one ever appears in this routine's live
prompt: pass it as the `fred_api_key` argument on t_macro_snapshot
(DAILY_PROMPT.md step 0). It's optional, not required — no signup needed to
use this feature at all. If no key was provided (the normal case), t_macro_
snapshot reports available:false and step 0 falls back to a live web search
for the same 5 figures instead, labeled source="web_search". This session
has WebSearch access for both step 0's macro fallback and its geopolitical
summary — use it live each run, don't rely on training data for current
events or economic figures.

When the scan is complete, do this final step — don't skip it even on a
zero-candidate day:

1. Assemble everything into a dict matching the schema documented at the top
   of agent/pdf_report.py: date, macro (step 0's result — either
   t_macro_snapshot's output as-is when source="fred", or the web-search
   fallback dict you built yourself with source="web_search", or
   available:false if neither turned up real numbers; never invent one),
   geopolitical (step 0's 2-3 items, already written in Russian since you
   generated them live — omit the key entirely on a day nothing warranted
   it), regime, sector_table, sector_rotation_highlights,
   all_candidates (every ticker the screener returned — tickers at minimum,
   sector if you have it, not just the ones you deep-dived), top10 (up to 10,
   ranked by composite score, REGARDLESS of whether they cleared every hard
   gate — each with ticker/composite_score/chart_grade/sector_stage/rr/
   earnings_days/explanation, so the reader sees the full picture, not just
   survivors), verdicts (0-3 names that genuinely clear every hard gate —
   EMA200, R/R≥2:1 from real structural levels, chart grade ≠ F, earnings
   ≥10 trading days out; never pad this to 3, an empty list on a no-setup day
   is correct and expected — each verdict needs entry/stop/target/rr/
   expected_gain_pct plus chart_path pointing at its rendered PNG so the PDF
   can embed it), footer_note. Every field must come from what you actually
   found this run — leave a field out rather than invent it.

   Also include theme_rotation: one entry per row of the
   sector-rotation/data/report_<date>.csv you already read for the step-2b
   narrative (all sectors AND all themes, not a filtered subset) with name,
   kind, etf, srs, d3d, breadth_pct (the CSV's Breadth% column), breadth_trend,
   ema_stack, ema_slope, rel_vol, vol_trend, streak_leaders (Streak3+),
   avg_streak, breakouts_20d, higher_lows, universe, accum_ratio, status —
   these are numbers/short codes straight from the CSV, not narrative, so
   just carry them over field-for-field (blank CSV cells for non-SPDR themes
   stay null, don't invent them).

   Also include rrg_points: ONE combined array covering BOTH sibling files
   pipeline.py writes -- sector-rotation/data/rrg_<date>.csv (weekly tail)
   AND sector-rotation/data/rrg_daily_<date>.csv (daily tail, same run,
   written right after it). For each row of rrg_<date>.csv, emit an entry
   with name, kind, etf, week_date (from that file's WeekDate column), seq,
   rs_ratio, rs_momentum, period:"W". For each row of rrg_daily_<date>.csv,
   emit an entry the same way but with week_date set from that file's Date
   column and period:"D". Carry values over field-for-field, don't recompute
   or filter either file (weekly is the full ~26-week history, daily is the
   full ~60-trading-day history -- both feed the dashboard's Relative
   Rotation Graph, which has its own Weekly/Daily toggle and scrub slider).
   This is web-dashboard-only -- it doesn't appear in the PDF, so nothing to
   translate here.

   Write EVERY free-text field in BOTH Russian (the primary field) AND
   English (the same field name + `_en` suffix): sector_rotation_highlights
   / sector_rotation_highlights_en, top10[].explanation / explanation_en,
   verdicts[].reasoning / reasoning_en, footer_note / footer_note_en,
   regime.vix_note / regime.vix_note_en, geopolitical[].headline+summary /
   headline_en+summary_en. The dashboard's language toggle reads the `_en`
   field when set and falls back to the Russian one otherwise -- an omitted
   `_en` field just means that item shows in Russian regardless of the
   toggle, it's never a hard error, but write both whenever you can. Write
   each pair together as you compose that finding (not a separate
   translation pass after the fact) -- same underlying analysis, two
   renderings of it. Keep tickers, prices, and standard trading shorthand
   (EMA, RSI, R/R, VDU, SPY, grades A-F) as-is in both languages. The PDF
   itself stays Russian-only (agent/pdf_report.py never reads any `_en`
   field) -- these are dashboard-only. Write it to output/results_<date>.json.

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
      already proven by the scan itself) with each ticker's (and each
      theme_rotation etf's) TradingView symbol, and -- for top10 entries
      only -- fundamentals (P/E, forward P/E, revenue+growth, EPS+growth,
      debt/equity, business summary) and up to 3 recent news items. One
      command does all of it, nothing else to fetch yourself:

      python -m agent.tv_symbol output/results_<date>.json

      This adds business_summary and news[].title/summary in ENGLISH (that's
      what yfinance returns natively). Open output/results_<date>.json and,
      for every top10[] entry: copy that English business_summary verbatim
      into business_summary_en, and each news[].title/summary verbatim into
      that item's title_en/summary_en -- yfinance already gives you the
      English version for free, don't waste effort re-writing it. THEN
      translate business_summary and each news[].title/summary into Russian
      in the original fields (same rule as everything else in this file —
      company/ticker names, dollar figures, and dates stay as-is; translate
      the prose), and save it back before the next step. Don't skip this
      even though it wasn't needed for the fields in step 1 -- those you
      wrote yourself in both languages already; these come from yfinance
      starting in English only, so the Russian side is the one that needs
      the extra pass here, not the English side.

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
