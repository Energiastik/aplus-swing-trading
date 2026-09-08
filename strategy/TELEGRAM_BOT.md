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
| `agent/data.py` (yfinance) | `web/lib/marketData.ts` (Yahoo Finance's own JSON endpoints, no auth needed for price bars; a cookie+crumb handshake -- the same one `yfinance` itself performs -- for earnings dates; the unauthenticated search endpoint for sector) |
| `agent/technicals.py` | `web/lib/technicals.ts` -- cross-checked field-for-field against a live `technicals.read()` dump for NVDA, 0.000% diff on every numeric field including S/R zone clustering |
| `agent/market_regime.py` | `web/lib/marketRegime.ts` -- cross-checked, identical score/checks |
| `agent/sector_rotation.py` | `web/lib/sectorRotation.ts` -- cross-checked, identical scores |
| `agent/options_walls.py` | `web/lib/optionsWalls.ts` -- MarketData.app only (no yfinance fallback tier available here; reports `unavailable` rather than fabricate a level, same discipline as the Python version) |
| `agent/chart_vision.py` | `web/lib/visionGrade.ts` -- **the one real quality gap**, see below |
| `agent/analyze_ticker.py` | `web/lib/analyzeTicker.ts` -- cross-checked against 7 real tickers (AAPL/NVDA/KO/BRZE/SAIL/INTC/PYPL), same verdicts, same A+ scores, same regime/sector reads |

## The one real limitation: no chart image

`agent/chart_vision.py` renders an actual candlestick PNG and sends it to
Claude's vision API. Rendering a chart image from a Vercel Node function
isn't practical without adding real dependency/runtime risk (canvas
libraries have a history of native-binary pain on serverless), so this path
sends the *same numeric context* (EMA stack, RSI, ATR%, pivot, VDU, Fib
levels, VWAP, volume profile, S/R zones, recent OHLCV bars) to Claude as
**text only**, with a prompt (`web/lib/visionGrade.ts`, mirrored for
reference at `strategy/vision_prompt_telegram_bot.md` -- keep both in sync
manually if the grading criteria change) that explicitly tells the model
it's working from numbers alone and to be more conservative than an
image-based grade. This means `chart_grade`/`base_number`/pattern detection
here are a weaker signal than the daily PDF's chart-vision grade. Every
Telegram reply says as much next to the chart grade.

## Required environment variables (Vercel dashboard, not settable by the agent)

| Var | Value | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | the existing bot token (already used by the daily routine) | needed here too since this runs from Vercel, not the routine sandbox |
| `TELEGRAM_CHAT_ID` | the existing owner chat id | only this chat is allowed to trigger `/add` -- everyone else is silently ignored |
| `TELEGRAM_WEBHOOK_SECRET` | a random secret (generated this session, given to the user out-of-band) | verified against Telegram's `X-Telegram-Bot-Api-Secret-Token` header on every webhook call -- without this set, the endpoint 401s everything |
| `ANTHROPIC_API_KEY` | a real Anthropic API key | new requirement -- the Node app never needed this before; the daily routine's chart-vision step runs inside the Python sandbox with its own key, this is a separate call from Vercel |
| `MARKETDATA_API_TOKEN` | optional, same token used by the daily routine | omit and options-wall confluence just reports `unavailable`, never a hard gate either way |

## Registering the webhook

One-time `setWebhook` call against `https://aplus-swing-trading.vercel.app/api/telegram-webhook`
with the secret token above -- done once from this session; re-run only if
the URL or secret ever changes. Verify anytime with `getWebhookInfo`.

## Deployment risk to double-check

`export const maxDuration = 60` is set on the route, but Vercel's **Hobby**
plan hard-caps serverless functions at 10s regardless of that setting --
this analysis (2 years of SPY/QQQ/VIX + 11 sector ETFs + the ticker itself,
plus a Claude API round trip) will very likely exceed 10s. If `/add` replies
with "Checking..." and then never follows up, this is almost certainly why
-- it needs at least a Pro-tier Vercel plan (60s functions) to work
reliably.

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
change.
