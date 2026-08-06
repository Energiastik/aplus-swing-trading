# Daily swing scan — copy/paste prompt

Paste the block below into a fresh chat each trading day. It's self-contained —
it doesn't depend on any prior conversation.

---

```
Read strategy/STRATEGY.md fully as the base rulebook, with these standing overrides
(apply every day, don't ask):

- SKIP the halal screen entirely — I check that myself. Don't call halal_screen,
  don't gate on it, don't mention it except "confirm compliance yourself" in the footer.
- Goal is a realistic +10%+ move in days-to-a-few-weeks, not months. Every surviving
  candidate must state its expected % gain to target.
- Minimum R/R 3:1, but computed from REAL structural levels (actual swing low/high,
  gap-day low, EMA21/50, Fib retracement, prior pivot) — never the blunt capped
  formula in technicals.stop_and_entry(). Pull actual daily High/Low/Volume and
  derive entry/stop/target from what the chart is actually doing.
- Earnings must be ≥10 trading days away. Check earnings_days for every survivor
  before it reaches the final table, not after.
- Never invent a number. Every price/volume/date in the output must trace to a tool
  call or a data pull you actually made this session.

Run the full scan in this order:

1. MARKET REGIME — market_regime tool (or agent/market_regime.py directly if the
   swing MCP server isn't connected — call the underlying functions in
   agentic/tools.py, same code path). Report score/4, mode, VIX note, size_multiplier.

2. SECTOR ROTATION — two layers:
   a. Broad check: sector_rotation tool / agent/sector_rotation.py (11 GICS ETFs vs
      SPY, 1W/4W/12W). Name top-3 and anything turning up from weakness.
   b. Granular signal (the real source of truth): run
      `python sector-rotation/pipeline.py` (reuses same-day cache if <20h old,
      pass --refresh to force). Read the resulting sector-rotation/data/report_<date>.csv
      yourself — don't call analysis.py (that spins up its own separate Claude API
      billing). For each sector AND theme ETF (Semiconductors, Biotech, Software,
      Oil & Gas, Metals & Mining, Mag7, etc.) read SRS/D3D/Breadth%+trend/
      EMAStack+slope/RelVol+VolTrend/Streak/Breakouts/HigherLows/AccumRatio/Status
      together, the way an analyst reads a board — not as independent thresholds.
      Call out: what's Building or Emerging (early, most interesting for new swing
      entries), what's Leading but extended, what's Fading (SRS still high but
      internals already rolling over — the "everyone piles in here, too late" trap),
      what's Lagging or Neutral (avoid). Favor candidates from Building/Emerging/
      early-Leading groups; flag but don't hard-exclude Fading-group candidates.

3. SCREENER — run_screener, limit 40.

4. TECHNICAL READ + RANK — technical_read on the full candidate pool, rank by
   ranking.technical_points with RS percentile computed within that pool (replicate
   agent/main.py's logic), take the ~12–15 strongest.

5. CHART VISION — render_chart each, then actually OPEN and LOOK at every PNG.
   Grade A/B/C/F per strategy/vision_prompt.md's criteria (stage, base count/quality,
   VCP tightening, VDU, equal-highs stop-hunt risk, extension past pivot). Be strict.
   In a non-AGGRESSIVE regime, C grades are context only, not entries.

6. VOLUME CONTEXT (for every chart that isn't an outright F) — pull real daily
   High/Low/Close/Volume for the last ~10-12 sessions. Compute average volume on
   up-days vs down-days. A stock pulling back or basing on DEclining/below-average
   volume near a real support level (EMA21/50, prior swing low, gap-day low) with
   good R/R is a valid setup — don't dismiss it just because it isn't breaking out
   today. A stock declining on RISING volume is distribution — downgrade regardless
   of how the numeric technicals look.

7. EARNINGS CONTEXT — earnings_days for every survivor.
   - If earnings are ≤10 trading days out: hard-exclude, no matter how good the chart.
   - If earnings were recently in the past (a negative/small days-since figure):
     explicitly evaluate it as a POST-EARNINGS-GAP setup — is the stock now
     pulling back on shrinking volume toward a Fibonacci retracement (38.2%/50%/
     61.8%) or the gap-day's own low, with that low usable as a real structural
     stop? That's a favored, explicit setup type here, not a "chase."

8. EXTRA FILTERS (apply while building the final list):
   - Relative volume: flag today's volume vs 20d average for each finalist —
     unusually low RVOL on a "breakout" day is a red flag; unusually high RVOL on
     a pullback day (without a bad-news reason) can mean capitulation, not entry.
   - 52-week-high proximity: prefer names reasonably close to their highs
     (O'Neil leadership) over deeply-lagging names, all else equal.
   - Don't stack more than 1-2 finalists from the same narrow industry/theme
     group unless conviction is clearly justified — correlated risk isn't
     diversification.
   - For post-earnings-gap names, note the unfilled gap zone explicitly — it's
     often a magnet if the pullback stop fails.

9. A+ CHECKLIST — score every survivor on the 9-question checklist in STRATEGY.md
   section 5 (note: item 9 there says "≥2 weeks" — use the ≥10-trading-day rule
   from this prompt as the operative earnings filter instead, but still report
   both).

10. FINAL OUTPUT — three tiers, don't collapse them into just the survivors:

    a. ALL CANDIDATES — list every ticker the screener returned (limit-40 output),
       at minimum ticker + sector, so nothing found today is invisible even if it
       never got a deep look.

    b. TOP 10 TABLE — up to 10 names ranked by composite technical score,
       REGARDLESS of whether they cleared every hard gate: ticker · composite
       score · A+ score · sector-rotation stage (Building/Emerging/Leading/
       Fading) · chart grade · R/R · earnings-days · one-line explanation
       (why it's ranked here, and which gate(s) it fails if any). This is the
       full picture, not just the names you'd actually enter.

    c. TOP ≤3 RECOMMENDATION VERDICTS — the names that genuinely clear every
       hard gate (EMA200, R/R≥3:1 from real structural levels, chart grade ≠ F,
       earnings ≥10 trading days out): entry/stop/target · R/R · expected %
       gain to target · shares at 1% risk on a $10,000 deposit (state if you
       use a different deposit) · regime-adjusted size · full reasoning. If
       fewer than 3 qualify — including zero — say so plainly and stop there.
       Never pad this list to hit 3. Footer: "confirm halal compliance yourself."
```
