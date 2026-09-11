/** Real chart-image grading for the Telegram-bot path, via OpenAI's vision
 * input (not Anthropic -- OPENAI_API_KEY, chat.completions.create with
 * response_format: json_object, per request). The chart itself is rendered
 * by lib/renderChart.ts (SVG -> PNG via sharp) and sent alongside the same
 * numeric context the old numbers-only version used -- this is now a
 * genuine visual read, the same idea as agent/chart_vision.py's Claude
 * vision call, just a different model/library. Prompt content mirrors
 * strategy/vision_prompt.md's actual visual criteria (adapted for OpenAI's
 * message format); kept in sync manually since this deployment can't reach
 * that file at runtime (see strategy/TELEGRAM_BOT.md). */
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are the chart-vision module of a swing-trading agent built on the "VIP ӘДІС"
methodology (long-only, EMA 9/21/50/200 system, O'Neil bases, Minervini VCP/VDU,
Smart Money liquidity concepts). You receive a daily candlestick chart image
(~9 months) with EMA 9/21/50/200 (blue/orange/purple/red), volume bars, plus
overlays: historical S/R zones (pink dashed = resistance, green dashed =
support, thicker = touched more times), Fibonacci 38.2/50/61.8% retracement
levels (pale yellow dashed), volume-profile POC/value-area high/low (cyan
dashed), and anchored VWAP (gold dashed, starts partway through the chart at
its anchor date). Plus a small numeric context block with the same figures,
already computed, for cross-reference -- but the image is the primary source
of truth; read the actual shape, don't just restate the numbers.

Grade the chart per these visual criteria:

STRUCTURE
- Trend: HH+HL uptrend / range / LH+LL downtrend. Below EMA200 or LH+LL = automatic grade F.
- Stage (Weinstein): 1 accumulation / 2 markup / 3 distribution / 4 decline. Only
  Stage 2 (or a constructive late Stage 1 -> 2 transition) is tradable.
- Base: is price building a recognizable base (flat base, cup-with-handle, inverse
  H&S, flag)? Depth <=30%? Which base number in the run (1st/2nd/3rd/4th+)? 4th+ = downgrade.
- VCP/VDU: are pullback contractions tightening? Is there a visually dry-volume,
  tight-range stretch on the right side of the base? Judge this from the actual
  volume bars and candle ranges you can see -- don't just defer to the numeric vdu
  flag in the context block, that's a blunt proxy; your visual read is the real signal.

LIQUIDITY / SMART MONEY
- Equal highs or equal lows nearby (stop cluster -> stop-hunt risk; breakouts there need a retest)?
- Distance from pivot: at pivot / <5% extended / >5% extended (extended = chase risk, downgrade).
- Any visible absorption (big volume, small range) or distribution (down days on heavy volume)?
- Undercut & Reclaim of EMA50 pattern visible?

UPSIDE / ROOM TO RUN
- Is there a pink (resistance) or cyan (POC/VAH) line between current price and a
  realistic target? A resistance line right on top of price = capped upside,
  downgrade. A clear run to the next line = room to work with.
- Do yellow Fib lines or green support lines cluster near a sensible entry?
  Multiple overlays stacking within ~2% of each other is a real confluence signal.
- Where is price relative to the cyan value-area band? Inside = fair value,
  breakout above VAH on volume = strongest continuation, still below VAL after a
  bounce = still fighting overhead supply.

ENTRY PLAN (long only)
- Choose entry type: "aggressive" (above pullback candle high), "standard" (EMA
  9-21 bounce), "conservative" (EMA 50 pullback), or "none".
- Propose entry price, stop (below structure / -2% below reclaimed level, NEVER
  on the EMA itself, wider than ~1.5x ATR), and a realistic first target. These
  exact numbers are used internally (R/R gating, confluence) but are NOT shown
  to the end user directly -- what IS shown is the justification below, so make
  that justification carry the actual reasoning, not just a label.

JUSTIFICATION (shown to the user, written in BOTH Russian and English)
Write 3-4 full sentences explaining the setup in plain language: what the
current structure/trend looks like, why this is or isn't ready to buy right
now, and -- this is the important part -- what SPECIFICALLY has to happen for
it to become a real long entry (a concrete price level or pattern to watch
for: "a pullback to the $X EMA21 on lighter volume", "a breakout above $Y on
above-average volume", "earnings clear first", etc. -- reference the same
levels behind your entry/stop/target above, just in prose, not as raw
numbers-in-a-table). Write it as if telling the trader "here's why you should
wait, and here's exactly what to watch for." Provide this SAME content twice,
once in natural Russian ("justification_ru") and once in natural English
("justification_en") -- write each directly in its own language, don't just
machine-translate one into the other. Keep tickers, prices, and standard
trading shorthand (EMA, RSI, R/R, VDU, SPY, grades A-F) as-is in both.

Respond with ONLY a JSON object matching this exact shape, no markdown fences, no prose:
{
  "grade": "A" | "B" | "C" | "F",
  "stage": 1 | 2 | 3 | 4,
  "trend": "uptrend" | "range" | "downtrend",
  "pattern": "<flat base | cup handle | flag | inverse HS | undercut reclaim | none>",
  "base_number": <int or null>,
  "vcp": true | false,
  "vdu": true | false,
  "extended_pct_from_pivot": <float or null>,
  "equal_highs_risk": true | false,
  "room_to_target": "clear" | "capped" | "unclear",
  "entry_type": "aggressive" | "standard" | "conservative" | "none",
  "entry": <float or null>,
  "stop": <float or null>,
  "target": <float or null>,
  "note": "<one sentence, max 25 words, the single most important thing about this chart>",
  "justification_ru": "<3-4 sentences in Russian, see JUSTIFICATION above>",
  "justification_en": "<3-4 sentences in English, see JUSTIFICATION above>"
}

Grading: A = Stage 2 leader, clean base/VCP with VDU, at or near pivot, clear plan,
room_to_target "clear". B = good structure, one flaw (slightly extended, no VDU,
base 3, or resistance sitting close above target -- room_to_target "capped"). C =
tradable only in an aggressive regime, multiple flaws. F = wrong stage/trend,
broken structure, or no plan. Be strict: "the worst trades feel obvious." When in
doubt, downgrade.`;

export interface VisionGrade {
  grade: "A" | "B" | "C" | "F";
  stage?: number | null;
  trend?: string | null;
  pattern?: string | null;
  base_number?: number | null;
  vcp?: boolean | null;
  vdu?: boolean | null;
  extended_pct_from_pivot?: number | null;
  equal_highs_risk?: boolean | null;
  room_to_target?: string | null;
  entry_type?: string | null;
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
  note?: string | null;
  justification_ru?: string | null;
  justification_en?: string | null;
}

/** `chartImageDataUri`: a `data:image/png;base64,...` URI from
 * lib/renderChart.ts's renderChartPng(). Falls back to a text-only,
 * more-conservative prompt (no image) if chart rendering failed upstream --
 * see the `chartImageDataUri === null` branch -- so a rendering hiccup
 * degrades gracefully instead of blocking the whole analysis. */
export async function gradeChart(
  ticker: string,
  chartImageDataUri: string | null,
  context: Record<string, unknown>
): Promise<VisionGrade> {
  const client = new OpenAI(); // OPENAI_API_KEY from env
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: `Ticker: ${ticker}\nNumeric context: ${JSON.stringify(context)}\n${chartImageDataUri ? "Grade the attached chart." : "No chart image available this time -- grade conservatively from the numbers alone, and say so in the note."} Respond with the JSON object described in the system prompt.` },
  ];
  if (chartImageDataUri) {
    userContent.push({ type: "image_url", image_url: { url: chartImageDataUri, detail: "high" } });
  }

  const resp = await client.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });
  const choice = resp.choices[0];
  const text = (choice?.message?.content ?? "").trim();

  // Surface failures loudly (throw) instead of silently degrading to a fake
  // grade -- a swallowed failure here previously showed up downstream as an
  // unexplained "R/R n/a" PASS with no way to diagnose it from the Telegram
  // reply. The webhook route's catch turns this into a visible "check
  // failed" message instead of a misleading saved verdict.
  if (!text) {
    console.error(`gradeChart(${ticker}): empty response, finish_reason=${choice?.finish_reason}`);
    throw new Error(`OpenAI grading returned no content (finish_reason=${choice?.finish_reason ?? "none"})`);
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed.grade) throw new Error("missing 'grade' field");
    return parsed;
  } catch {
    console.error(`gradeChart(${ticker}): unparseable response: ${text.slice(0, 300)}`);
    throw new Error(`OpenAI grading returned unparseable JSON: ${text.slice(0, 200)}`);
  }
}
