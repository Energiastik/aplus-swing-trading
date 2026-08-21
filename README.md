# VIP ӘДІС — Daily Swing Agent

Автоматты күнделікті агент: нарық режимі → сектор ротациясы → скринер воронкасы →
техникалық оқу → **графикті көзбен көру (Claude vision)** → халал скрининг → A+ чек-лист →
Top ≤10 лонг кандидат → Telegram + HTML есеп.

Barlyq erezheler `strategy/STRATEGY.md`-де — Day 2/3/4 executive summary-ден дистилденген.
Vision агенттің «көзі» — `strategy/vision_prompt.md`.

## Pipeline
| # | Module | Course source | Rule |
|---|--------|--------------|------|
| 1 | `market_regime` | Day 3 weekly checklist + Day 2 VIX | 4/4 aggressive · 2–3 half-size · 0–1 watchlist-only |
| 2 | `sector_rotation` | Day 2 practicum | 11 ETF vs SPY, 1W/4W/12W, weights 3/2/1 |
| 3 | `screener` | Day 4 Finviz funnel | 11,500 → ~13 filters, Price×Vol > $10M |
| 4 | `technicals` | Day 3 + Smart Money | EMA stack, RS pctile, RSI 40–80, VDU, pivot, ATR stops, Fibonacci retracement, anchored VWAP, liquidity-sweep detection, confluence count |
| 5 | `chart_vision` | Day 3+4 visual criteria | mplfinance snapshot → Claude → grade A/B/C/F + entry plan |
| 6 | `halal` | Day 4 AAOIFI | business screen + 3 ratios → PASS/REVIEW/FAIL (+ "confirm in Zoya") |
| 7 | `ranking` | — | hard gates (EMA200, halal, R/R≥2, vision≠F) → weighted composite (+/- bonus for R/R above/below 3:1) |
| 8 | `report` | — | Telegram (text + chart photos) + dark navy/gold HTML |

## Setup
```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."      # vision module
export TELEGRAM_BOT_TOKEN="123:ABC"        # optional
export TELEGRAM_CHAT_ID="-100..."          # optional
```

## Run
```bash
python -m agent.main                          # full daily run
python -m agent.main --no-vision              # free numeric-only run (testing)
python -m agent.main --no-telegram            # console + HTML only
python -m agent.main --deposit 10000 --risk 1.0 --top 10 --vision-top 15
python -m agent.main --universe data/my_watchlist.csv   # custom fallback universe
```
First run: use `--no-vision --no-telegram` to sanity-check the funnel before spending API calls.

## Scheduling (nightly, after US close = ~06:30 Astana)
**cron:**
```
30 6 * * 2-6 cd /path/swing-agent && /usr/bin/python3 -m agent.main >> output/agent.log 2>&1
```
**Railway:** deploy repo, add env vars, create a Cron Service with schedule `30 1 * * 2-6` (UTC)
and command `python -m agent.main`.

## Data sources & fallbacks
- Screener: Finviz (via `finvizfinance`). If Finviz is unreachable, falls back to
  `data/sp500.csv` (bundled) or your own CSV, filtered technically via yfinance.
- Prices/fundamentals: yfinance. Balance-sheet ratios drive the halal screen;
  when data is missing the name is marked REVIEW, never silently passed.
- Halal is an approximation of AAOIFI — **always confirm in Zoya before entry**
  (the course's own workflow).

## Vision cost control
Only the top `--vision-top` (default 15) numerically pre-ranked charts are sent to Claude.
~15 images/day on Sonnet ≈ a few cents/day.

## Discipline built in (can't be overridden by flags)
- Long only, no leverage/options/short.
- Regime 0–1/4 → report is labeled WATCHLIST-ONLY.
- R/R < 2:1, halal FAIL, below EMA200, vision grade F → hard rejection (2:1–2.9:1
  and 3:1+ both pass, but aren't scored as equal quality).
- Stops never sit on the EMA itself; min 3% (wider than daily noise), max 10%.
- Empty list is a valid output: «Жоқ жерден сетап жасамаймыз».

*Educational decision-support tool. Скринер — фильтр, шешім — қолмен.*
