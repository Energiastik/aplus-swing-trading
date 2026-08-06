# VIP ӘДІС — Agent Strategy Rulebook
Distilled from Day 2 (Fundamental), Day 3 (Technical), Day 4 (Smart Money + Risk + Halal).
This file is the single source of truth. Code modules implement these rules; the vision
agent receives the "Visual Criteria" section as its system prompt context.

## 0. Hard constraints
- LONG ONLY. No shorts, no options, no leverage (halal constraint — treated as an edge:
  "bankruptcy is practically impossible without them").
- Every candidate must pass (or be flagged "review") on the AAOIFI halal screen.
- Minimum R/R 3:1 on the proposed entry/stop/target. No exceptions.
- "Screener is a FILTER, not a SIGNAL" — the agent ranks and recommends; the human decides.
- No setup? Wait. Never force a setup out of nothing.

## 1. Market Regime (gate #1 — checked before anything else)
Weekly regime checklist (Day 3), scored 0–4:
1. SPY close > EMA 200 (daily)?
2. QQQ made a new 4-week high within the last 5 sessions?
3. VIX < 20?
4. SPY closed last week higher than the prior week?

Interpretation:
- 4/4 → AGGRESSIVE: full position sizes allowed.
- 2–3 → CAUTIOUS: half-size positions, A+ setups only.
- 0–1 → NO NEW TRADES: build watchlist only. The agent still reports the Top 10 but
  labels the day WATCHLIST-ONLY.
VIX overlay (Day 2): VIX < 15 keep taking profits normally; 15–28 hold with trend;
VIX > 28 = panic — flag fundamentally strong names as contrarian accumulation candidates
(scale in, e.g. 15% / 40%, never all at once).
Trend rule: "Регим бірінші, сетап екінші" — if regime doesn't fit, the strongest setup is void.

## 2. Sector Rotation (gate #2)
11 sector ETFs (XLK XLY XLF XLI XLE XLV XLP XLU XLRE XLB XLC) vs SPY over
1W / 4W / 12W. +1 point per period of outperformance; recent periods weighted more
(weights 3/2/1). 3/3 raw score = primary hunting ground.
- Prefer candidates from top-3 weighted sectors; small penalty otherwise.
- Rotation logic: "Біреудің дносы — басқаның потологы" — look for sectors turning up
  from weakness, don't chase deep red heatmaps ("қып-қызылдарына жоламаймыз").
- Halal note: XLF (Financials) mostly non-compliant; classic defensives too slow for swing.

## 3. Screener Funnel (Day 4: 11,500 → ~13)
Stage 1 basics: Price > $5 · Market cap Mid–Mega (> $2B) · Avg volume > 750K.
Stage 2 fundamental: EPS growth this year > 20% · EPS next year > 15% ·
Forward P/E < 50 · Revenue growth (q/q) > 20% · Analyst rating Buy/Strong Buy.
Stage 3 technical: Price above SMA 20, 50, 200 · monthly volatility ≥ 5% (ATR/ADR proxy) ·
Price × Volume > $10M/day.
Stage 4: intersect with strong themes / leading sectors.
Stage 5: halal screen per name.

## 4. Technical scoring (Day 3)
- EMA system: 9 (impulse), 21 (the swing line), 50 (medium trend / Undercut & Reclaim),
  200 (global filter — below EMA200 = no longs). Stacked EMAs (P>9>21>50>200) = leader.
- RS: weighted return 40%·3m + 20%·6m + 20%·9m + 20%·12m, percentile-ranked.
  Require RS percentile ≥ 85 for A+ candidates (80+ minimum).
- RSI cheat code: in an uptrend RSI should live in 40–80; >70 inside a trend is NORMAL;
  a close with RSI < 40 = reduce longs. Divergence (price HH, RSI LH) = weakening.
- Volume combos: ↑price ↑vol = strong uptrend; ↑price ↓vol = suspect; ↓price ↑vol =
  distribution; ↓price ↓vol = healthy pullback (VDU = entry zone).
- VDU (Minervini): volume 40–60% below average, right side of a base, tight range ±1–2%.
- Confluence rule: EMA + Fibonacci 0.5–0.618 + historical level + round number at one
  point = strong level. Single signals mean little; context is everything.
- Base count: base 2 = best entry; base 3 aggressive only; base 4+ = do not trade.

## 5. A+ checklist (9 questions — scored per candidate)
1. Macro/regime score 4–5? 2. Sector ETF beating SPY (4W)? 3. RS ≥ 85?
4. Recognizable pattern (base / cup&handle / flag / U&R)? 5. VDU present?
6. Clear pivot/breakout point? 7. Logical stop placement (structure/ATR, not on the EMA
itself, −2% below reclaimed level)? 8. R/R ≥ 3:1? 9. Earnings ≥ 2 weeks away?
Scoring: 9/9 full position · 7–8 half · ≤6 no entry (watchlist).
"Checklist paradox": if it feels 'obviously' A+ before scoring — stop. The worst trades
feel obvious.

## 6. Smart Money overlays (Day 4)
- The only question: WHERE IS THE LIQUIDITY? Markets move to stops.
- Equal Highs/Lows = stop clusters = stop-hunt risk → breakout там is a CAUTION signal;
  prefer retest entries over instant breakout chases.
- Anchored VWAP from a catalyst day: FIRST touch is the strongest entry (15–20% moves);
  second/third touches decay.
- Absorption: 2–3× volume with <0.5% price movement + rising OBV = institutions absorbing.
- Order Blocks / FVG: pullback into a bullish OB = long, stop 2% below zone; invalid if
  price fully trades through.

## 7. Risk parameters (attached to every recommendation)
- Risk per trade 1–1.5% of deposit; shares = (Deposit × Risk%) ÷ (Entry − Stop).
- Monthly max loss 6% → stop trading. 4–7 concurrent positions max.
- Stops: structural (below swing low), ATR-based (1.5–2× ATR, stop must exceed ATR),
  −2% below reclaimed EMA/level. Never on the EMA itself.
- Time stop: 3–5 days against structure → close half; 7–10 days <3% movement → exit or
  breakeven stop; earnings within 1 week → close or cut to 1/3.
- Pie exits: +10–15% close 25–33% + stop to breakeven; +25–35% another 25–33% +
  trailing; rest rides until close below EMA 21/50.

## 8. Halal screen (AAOIFI, Day 4)
Business screen: exclude alcohol, pork, tobacco, gambling/casino, conventional
banks/insurance, adult, weapons (doubtful — flag), cannabis. Payment processors
(Visa/MC-type) = halal; lenders = not.
Ratios: interest-bearing debt / assets < 30% · receivables / assets < 45% ·
(cash + interest-bearing securities) / assets < 33% · haram revenue < 5%.
Output PASS / REVIEW / FAIL. All passes still say: "confirm in Zoya" (teacher's own flow:
screener output → straight into Zoya).

## 9. Output discipline
Daily report = regime verdict + sector table + Top ≤10 with: setup type, entry type
(aggressive / standard EMA9-21 bounce / conservative EMA50), entry, stop, target,
R/R, position size at 1% risk, A+ score, halal status, vision grade + one-line chart read.
Reminder printed daily: "Скринер — фильтр, шешім — қолмен. Капитал — бірінші орында."
