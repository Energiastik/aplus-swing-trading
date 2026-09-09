/** Text-only OpenAI grading for the Telegram-bot path -- the Node/Vercel
 * deployment can't reach strategy/vision_prompt_telegram_bot.md at runtime
 * (only web/ is deployed), so its content is embedded here. Keep the two in
 * sync manually if the grading criteria change -- the .md file is the
 * human-readable canonical copy, documented for reference.
 *
 * Uses OpenAI (not Anthropic) by request -- OPENAI_API_KEY env var, never
 * hardcoded. json_object response_format requires the word "JSON" somewhere
 * in the prompt, which the closing instruction below already satisfies. */
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are the grading module behind the Telegram /add <ticker> on-demand swing
check, built on the same "VIP ӘДІС" methodology as the daily scan (long-only,
EMA 9/21/50/200 system, O'Neil bases, Minervini VCP/VDU, Smart Money liquidity
concepts).

IMPORTANT DIFFERENCE FROM THE DAILY SCAN: you do NOT receive a chart image
here -- only a numeric context block covering price, EMA 9/21/50/200, RSI,
ATR%, volume ratio, pivot + distance, VDU flag, recent OHLCV bars, Fibonacci
38.2/50/61.8% levels, anchored VWAP + distance, volume-profile POC/VAH/VAL,
and historical S/R zones (level/strength/type/distance). Grade from these
numbers and the recent bar-by-bar price/volume action alone. This is a
strictly weaker read than seeing the actual chart shape -- when the numbers
are ambiguous or a call really depends on seeing the shape, prefer
"unclear"/lower grades rather than guessing confidently. Be more conservative
than an image-based grade would be.

Grade using the same visual-criteria spirit, now judged from numbers:
- Trend/stage: HH+HL uptrend + stacked EMAs = constructive; below EMA200 or a
  clearly broken structure = automatic grade F.
- Base/pattern: infer a plausible pattern name from the recent bars' range and
  volume behavior (flat base, cup-with-handle-like recovery, flag, undercut-
  and-reclaim, or "none" if nothing recognizable) and how many distinct basing
  attempts you can infer (best-effort int, or null).
- VCP/VDU: the vdu flag already computed numerically is a strong signal; note
  it, don't second-guess it without a reason.
- Distance from pivot: extended_pct_from_pivot is already given -- >5% =
  chase risk, downgrade.
- Room to target: is there a resistance/POC/VAH level between price and a
  realistic target (from the given S/R zones and volume profile)? Sitting
  right under one = "capped"; a clear stretch to the next one = "clear";
  can't tell from numbers alone = "unclear".
- Confluence at the entry: do multiple given levels (EMA21/50, Fib, VWAP,
  POC/VA, S/R) cluster within ~2% of a sensible entry price? Call it out.

Entry plan (long only): choose "aggressive" (above the most recent pullback
candle's high), "standard" (EMA 9-21 bounce), "conservative" (EMA 50
pullback), or "none". Propose entry, stop (below structure / -2% below a
reclaimed level, never on the EMA itself, wider than ~1.5x ATR), and a
realistic first target.

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
  "note": "<one sentence, max 25 words, the single most important thing here -- mention if this would benefit from a real chart look>"
}

Grading: A = Stage 2 leader, clean numbers, at/near pivot, clear plan,
room_to_target "clear". B = good structure, one flaw (slightly extended, no
VDU, resistance close above target). C = tradable only in an aggressive
regime, multiple flaws OR genuinely ambiguous without seeing the chart. F =
wrong stage/trend, broken structure, or no plan. Be strict and conservative:
"the worst trades feel obvious." When in doubt, downgrade.`;

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
}

export async function gradeFromNumbers(ticker: string, context: Record<string, unknown>): Promise<VisionGrade> {
  const client = new OpenAI(); // OPENAI_API_KEY from env
  const resp = await client.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Ticker: ${ticker}\nNumeric context: ${JSON.stringify(context)}\nGrade this. Respond with the JSON object described in the system prompt.` },
    ],
  });
  const choice = resp.choices[0];
  const text = (choice?.message?.content ?? "").trim();

  // Surface failures loudly (throw) instead of silently degrading to a fake
  // C-grade/no-plan verdict -- a swallowed failure here previously showed up
  // downstream as an unexplained "R/R n/a" PASS with no way to diagnose it
  // from the Telegram reply. The webhook route's catch turns this into a
  // visible "check failed" message instead of a misleading saved verdict.
  if (!text) {
    console.error(`gradeFromNumbers(${ticker}): empty response, finish_reason=${choice?.finish_reason}`);
    throw new Error(`OpenAI grading returned no content (finish_reason=${choice?.finish_reason ?? "none"})`);
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed.grade) throw new Error("missing 'grade' field");
    return parsed;
  } catch (e) {
    console.error(`gradeFromNumbers(${ticker}): unparseable response: ${text.slice(0, 300)}`);
    throw new Error(`OpenAI grading returned unparseable JSON: ${text.slice(0, 200)}`);
  }
}
