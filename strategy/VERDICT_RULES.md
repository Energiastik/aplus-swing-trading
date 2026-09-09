# Single-ticker verdict rules (BUY / WAIT / PASS)

Originally implemented in `agent/analyze_ticker.py` (a standalone CLI you can
run yourself with a real API key); the deterministic decision tree below is
now what actually ships in the live Telegram `/add <ticker>` bot, via
`web/lib/analyzeTicker.ts` (see `strategy/TELEGRAM_BOT.md`). It's a sibling
to the daily scan's own hard gates in `agent/ranking.py`'s `gates()` and A+
checklist in `agent/technicals.py`'s `a_plus_score()`, but scoped to one
arbitrary ticker on demand rather than a pre-filtered screener pool — see
the deviations below.

**Note:** the TS version has since gained two things not yet back-ported to
`agent/analyze_ticker.py`: a formulaic stop/target fallback when the grading
call gives no plan (`stopAndEntry()` in `web/lib/technicals.ts`), and the
"A" conviction tier / RRG bonus signal described below. Treat
`web/lib/analyzeTicker.ts` as the canonical current behavior; the Python
file is a slightly older reference.

Every threshold here traces to an existing field already computed by
`agent/technicals.py`, `agent/market_regime.py`, or `agent/chart_vision.py` —
nothing invented beyond what's flagged as a deliberate call.

## PASS (hard gates — any one fails, stop there)

| Check | Field | Threshold |
|---|---|---|
| Below long-term trend | `t.above_200` | must be `True` |
| R/R too thin | `rr` (from the vision model's own entry/stop/target, not the capped `stop_and_entry()` formula) | must be `≥ 1.0` |
| Chart grade | `vision.grade` | must not be `"F"` |
| Earnings too close | `earnings_trading_days` | must be `≥ 7` |
| Base too messy | `vision.base_number` | must be `< 4` |

Halal is skipped entirely, same standing override as the daily scan — user
checks it manually via Zoya.

## WAIT (clears the gates, not ready to enter)

Any of these caps it at WAIT:

| Condition | Why |
|---|---|
| `regime_score ≤ 1` | NO_TRADE day — watchlist only, even for a great setup |
| `aplus_score ≤ 6` | matches STRATEGY.md's own "≤6 = no entry" band |
| `t.extended == True` (>5% past pivot) | chase risk — `technicals.py`'s own existing threshold |
| `confluence_count == 0` at the proposed entry | no real level backing the stop |
| no trigger detected (see below) | structurally fine, nothing happening today |

## BUY (all of the above clear, AND a trigger exists)

Implied by clearing every WAIT cap above (in particular `aplus_score ≥ 7`),
plus a detected trigger. R/R band noted separately: `2.0–2.9` vs `3.0+`.

Conviction label (three tiers, TS version only — see the RRG-quadrant note
in `strategy/TELEGRAM_BOT.md` for the full rationale):
- **A+**: `aplus_score == 9` (unchanged, matches STRATEGY.md's canonical
  9-question checklist exactly).
- **A**: `aplus_score` 7–8 AND the ticker's sector or theme is in the RRG
  Improving/Leading quadrant (`web/lib/rrgQuadrant.ts`, read from the same
  `rrg_points` table the daily routine already writes) — a real rotation
  tailwind, never a hard gate, doesn't touch the 9-question checklist itself.
- **standard**: `aplus_score` 7–8, no rotation tailwind.

### Trigger definition

- **Breakout**: price at/through `pivot` (within 1%), `vol_ratio ≥ 1.2`, not
  extended.
- **Pullback**: `vdu` true (numeric or vision-confirmed) — a breakout
  legitimately won't have VDU (that's a different entry type), so the two
  are mutually exclusive by design, not a bug when only one fires.

`BREAKOUT_RVOL_MIN = 1.2` is the one number here without a source elsewhere
in the codebase — a starting point, open to tuning against real outcomes.

## Two deliberate deviations from the daily pipeline

1. **RS percentile is an estimate, not a peer-pool rank.** The daily scan
   ranks `rs_pctile` against that day's full screener pool
   (`agent/main.py`); a single ad-hoc ticker has no pool. The proxy: how far
   the ticker's weighted RS return (`technicals.rs_weighted_return`) beats
   SPY's own, scaled so a 15-percentage-point margin ≈ the 85th percentile.
   Marked `rs_pctile_is_estimate=True` on every `Verdict`. A real percentile
   (ranking against sector-rotation's already-cached S&P 500 price parquet)
   is a fair v2 upgrade, not implemented here.
2. **A+ checklist item 9 uses 7 trading days, not `technicals.a_plus_score()`'s
   hardcoded 14 calendar days.** `analyze_ticker.py` has its own
   `_aplus_checklist()` rather than calling the shared function, specifically
   to keep this one threshold consistent with the PASS-gate earnings rule
   above instead of silently diverging from it.
