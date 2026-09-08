# Single-ticker verdict rules (BUY / WAIT / PASS)

Implemented in `agent/analyze_ticker.py`, this is the deterministic decision
tree behind the planned Telegram `/add <ticker>` watchlist command. It's a
sibling to the daily scan's own hard gates in `agent/ranking.py`'s `gates()`
and A+ checklist in `agent/technicals.py`'s `a_plus_score()`, but scoped to
one arbitrary ticker on demand rather than a pre-filtered screener pool —
see the two noted deviations below.

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
plus a detected trigger. Conviction label: `aplus_score == 9` → **BUY (A+)**,
else **BUY (standard)**. R/R band noted separately: `2.0–2.9` vs `3.0+`.

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
