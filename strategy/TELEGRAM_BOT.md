# Telegram `/add <ticker>` watchlist bot

Send `/add NVDA` to the bot -> it runs a real BUY/WAIT/PASS check (same rules
as `agent/analyze_ticker.py`, see `strategy/VERDICT_RULES.md`), saves the
result to the `watchlist` table, and replies with the verdict in the same
chat. Synchronous, no cron: everything happens inside one webhook request.

## Why this is a separate implementation from `agent/analyze_ticker.py`

Vercel only deploys the `web/` directory for this project -- `agent/`,
`sector-rotation/`, and everything else at the repo root isn't part of the
deployment at all. Rather than restructure the (working, live) deployment or
run an untested new Python runtime on Vercel, the whole engine is ported to
TypeScript, living entirely in `web/lib/`:

| Python (daily pipeline) | TypeScript (this bot) |
|---|---|
| `agent/data.py` (yfinance) | `web/lib/marketData.ts` (Yahoo Finance's own JSON endpoints, no auth needed for price bars; a cookie+crumb handshake -- the same one `yfinance` itself performs -- for earnings dates and industry classification) |
| `agent/technicals.py` | `web/lib/technicals.ts` -- cross-checked field-for-field against a live `technicals.read()` dump for NVDA, 0.000% diff on every numeric field including S/R zone clustering |
| `agent/market_regime.py` | `web/lib/marketRegime.ts` -- cross-checked, identical score/checks. Both were redesigned together (see "Regime redesign" below) |
| `agent/sector_rotation.py` | `web/lib/sectorRotation.ts` -- cross-checked, identical scores |
| `agent/options_walls.py` | `web/lib/optionsWalls.ts` -- MarketData.app only (no yfinance fallback tier available here; reports `unavailable` rather than fabricate a level, same discipline as the Python version) |
| `agent/chart_vision.py` (renders PNG, Claude vision) | `web/lib/renderChart.ts` (SVG -> PNG via `sharp`, already a transitive Next.js dependency) + `web/lib/visionGrade.ts` (OpenAI, `chat.completions.create` with a real image input + `response_format: json_object`) |
| `agent/analyze_ticker.py` | `web/lib/analyzeTicker.ts` -- cross-checked against 7 real tickers (AAPL/NVDA/KO/BRZE/SAIL/INTC/PYPL), same verdicts, same A+ scores, same regime/sector reads |
| *(no Python equivalent -- dashboard-only before now)* | `web/lib/rrgQuadrant.ts` + `web/lib/themes.ts` -- reads the RRG sector/theme quadrant the daily routine already writes to `rrg_points`, as a bonus conviction signal (see below) |

## Real chart rendering (no longer a numbers-only read)

`web/lib/renderChart.ts` draws an actual candlestick chart (SVG: candles,
volume bars, EMA 9/21/50/200, historical S/R zones, Fibonacci 38.2/50/61.8%,
volume-profile POC/VAH/VAL, anchored VWAP -- same overlays as
`agent/chart_vision.py`'s PNG), rasterized to PNG via `sharp`. `web/lib/
visionGrade.ts` sends that image to OpenAI's vision input (`gpt-4o` by
default) alongside the numeric context, using a prompt that mirrors `strategy/
vision_prompt.md`'s actual visual criteria -- the model now judges VDU,
base quality, and pattern shape by looking at the chart, not by restating
mechanical thresholds. If rendering fails for any reason, `analyzeTicker.ts`
falls back to a `null` image and `visionGrade.ts`'s prompt degrades to a
conservative numbers-only read rather than blocking the whole analysis.

This path uses OpenAI (`OPENAI_API_KEY`), not Anthropic -- a deliberate
choice for this one call, unrelated to the daily pipeline's own Claude-based
chart vision, which is untouched.

## Regime redesign (applies to BOTH this bot and the daily pipeline)

The old regime check #2, "QQQ made a new 4-week high in the last 5
sessions," was narrow/binary and largely redundant with check #4 ("SPY up
this week"). Replaced in both `agent/market_regime.py` and `web/lib/
marketRegime.ts` with a breadth check: RSP (equal-weight S&P 500) vs SPY
(cap-weight) over the trailing 20 trading days (RSP/SPY ratio now >= ratio
20 days ago x 0.99). A market carried by a handful of mega-caps while the
average stock lags shows up here even when SPY itself looks fine -- narrow
leadership is fragile leadership, and the old 4-check set missed that
failure mode entirely. Same 0-4 scale, same AGGRESSIVE/CAUTIOUS/NO_TRADE
thresholds -- only the one check changed. See `strategy/STRATEGY.md` section
1 for the full checklist.

Regime score does NOT by itself force WAIT except at the NO_TRADE tier
(<=1/4). At CAUTIOUS (2-3/4) a strong setup can still BUY -- it just needs
the A+ score to clear the same bar STRATEGY.md always required ("A+ setups
only"), since regime<3 already costs that setup one of the 9 checklist
points.

## RRG sector/theme quadrant as a bonus conviction signal

`web/lib/rrgQuadrant.ts` reads the ticker's sector's (and, where matched,
theme's) latest weekly Improving/Leading/Weakening/Lagging quadrant straight
from `rrg_points` -- the same table the daily routine already populates via
`/api/ingest`, no recomputation needed. This does NOT change the canonical
9-question A+ checklist (kept identical to `agent/technicals.py`'s), and
does NOT gate anything -- same "informational/bonus, never a hard gate"
discipline as every other confluence signal in this project. It adds a third
conviction tier for BUY verdicts:
- **A+**: full 9/9 A+ checklist (unchanged).
- **A**: 7-8/9 checklist AND the sector or theme is in the Improving/Leading
  RRG quadrant -- a real rotation tailwind.
- **standard**: 7-8/9 checklist, no rotation tailwind.

Theme matching (`web/lib/themes.ts`) is a best-effort approximation, not
true ETF-holdings membership (that requires `sector-rotation/
data_fetch.py`'s SSGA holdings fetch, Python-only): Mag7 is matched exactly
(a fixed 7-ticker list), everything else via Yahoo's `industry` field
mapped to a theme only where the match is unambiguous (Semiconductors,
Biotech, Oil & Gas, Metals & Mining, Solar, Tech-Software). Cibersecurity,
Drones, Rare Earths, Robotics, Bitcoin Miners, Photonics, and Software &
Services aren't matched from industry alone -- better to report no theme
match than guess. Every Telegram reply flags an approximate match as such.

## Required environment variables (Vercel dashboard, not settable by the agent)

| Var | Value | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | the existing bot token (already used by the daily routine) | needed here too since this runs from Vercel, not the routine sandbox |
| `TELEGRAM_CHAT_ID` | the existing owner chat id | only this chat is allowed to trigger `/add` -- everyone else is silently ignored |
| `TELEGRAM_WEBHOOK_SECRET` | a random secret (generated this session, given to the user out-of-band) | verified against Telegram's `X-Telegram-Bot-Api-Secret-Token` header on every webhook call -- without this set, the endpoint 401s everything |
| `OPENAI_API_KEY` | a real OpenAI API key | new requirement -- the Node app never needed this before. Never commit this value anywhere; this repo is public. If a key was ever pasted into a chat or any non-secret channel, rotate it at platform.openai.com/api-keys before relying on it |
| `OPENAI_VISION_MODEL` | optional, defaults to `gpt-4o` | must be a vision-capable model since a real chart image is sent now |
| `MARKETDATA_API_TOKEN` | optional, same token used by the daily routine | omit and options-wall confluence just reports `unavailable`, never a hard gate either way |
| `DATABASE_URL` | already set (shared with the dashboard) | also used now for the RRG quadrant read -- no new variable needed |

## Registering the webhook

One-time `setWebhook` call against `https://aplus-swing-trading.vercel.app/api/telegram-webhook`
with the secret token above -- done once from this session; re-run only if
the URL or secret ever changes. Verify anytime with `getWebhookInfo`.

## Deployment risk to double-check

`export const maxDuration = 60` is set on the route, but Vercel's **Hobby**
plan hard-caps serverless functions at 10s regardless of that setting --
this analysis (2 years of SPY/RSP/VIX + 11 sector ETFs + the ticker itself,
chart rendering, an RRG DB read, plus an OpenAI vision round trip) will very
likely exceed 10s -- more so now than the original text-only version. If
`/add` replies with "Checking..." and then never follows up, this is almost
certainly why -- it needs at least a Pro-tier Vercel plan (60s functions) to
work reliably.

## Data table

```sql
watchlist (chat_id, ticker, verdict, reason, conviction, rr_band, trigger_type,
           aplus_score, regime_score, regime_mode, sector, price, entry, stop,
           target, rr, confluence_count, chart_grade, earnings_trading_days,
           checked_at, raw JSONB)
```

Every `/add` inserts a new row (a history of checks over time per ticker,
not an upsert) -- deliberate, so a later feature (re-check a watchlist entry,
see how the verdict changed) has real history to work from without a schema
change. `raw` carries the full Verdict object, including the newer
`sector_rrg_quadrant`/`theme`/`theme_rrg_quadrant`/`used_fallback_levels`
fields, without needing another schema change either.
