/** Free, unauthenticated Yahoo Finance chart JSON endpoint -- the Node/Vercel
 * equivalent of the Python pipeline's yfinance calls (agent/data.py), since
 * yfinance itself isn't usable from a Node serverless function. Verified
 * against real yfinance output for NVDA: same bar count, same last close. */

export interface Bar {
  date: string; // ISO yyyy-mm-dd
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const UA = "Mozilla/5.0 (compatible; aplus-swing-bot/1.0)";

export async function fetchDailyBars(ticker: string, range: string = "2y"): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return [];

  const ts: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose ?? quote.close;
  const open: (number | null)[] = quote.open ?? [];
  const high: (number | null)[] = quote.high ?? [];
  const low: (number | null)[] = quote.low ?? [];
  const close: (number | null)[] = quote.close ?? [];
  const volume: (number | null)[] = quote.volume ?? [];

  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (close[i] == null || open[i] == null || high[i] == null || low[i] == null) continue;
    // Scale O/H/L by the same split/dividend adjustment ratio yfinance's
    // auto_adjust=True applies, so ATR/pivot/EMA all read off adjusted prices
    // exactly like the Python side does.
    const rawClose = close[i] as number;
    const adjClose = (adj[i] as number) ?? rawClose;
    const ratio = rawClose !== 0 ? adjClose / rawClose : 1;
    bars.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open: (open[i] as number) * ratio,
      high: (high[i] as number) * ratio,
      low: (low[i] as number) * ratio,
      close: adjClose,
      volume: volume[i] ?? 0,
    });
  }
  return bars;
}

export async function fetchManyDailyBars(tickers: string[], range: string = "1y"): Promise<Record<string, Bar[]>> {
  const entries = await Promise.all(
    tickers.map(async (t) => [t, await fetchDailyBars(t, range)] as const)
  );
  const out: Record<string, Bar[]> = {};
  for (const [t, bars] of entries) if (bars.length > 0) out[t] = bars;
  return out;
}

/** quoteSummary (needed for earnings dates) requires a crumb+cookie -- the
 * same auth handshake yfinance itself performs. Cached at module scope so a
 * warm serverless instance reuses it instead of re-fetching per ticker. */
let cachedCookie: string | null = null;
let cachedCrumb: string | null = null;
let crumbFetchedAt = 0;
const CRUMB_TTL_MS = 30 * 60 * 1000;

async function getCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  if (cachedCookie && cachedCrumb && Date.now() - crumbFetchedAt < CRUMB_TTL_MS) {
    return { cookie: cachedCookie, crumb: cachedCrumb };
  }
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual" });
    const setCookie = cookieRes.headers.get("set-cookie");
    const cookie = setCookie ? setCookie.split(";")[0] : "";
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, ...(cookie ? { Cookie: cookie } : {}) },
    });
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<")) return null;
    cachedCookie = cookie;
    cachedCrumb = crumb;
    crumbFetchedAt = Date.now();
    return { cookie, crumb };
  } catch {
    return null;
  }
}

/** yfinance's ticker.calendar equivalent: next earnings date, if Yahoo has
 * one queued. Returns calendar days until that date, or null (never a hard
 * failure -- callers already treat null earnings data as "unknown, don't
 * gate on it", same as the Python side). */
export async function fetchNextEarningsCalendarDays(ticker: string): Promise<number | null> {
  const auth = await getCrumb();
  if (!auth) return null;
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=calendarEvents&crumb=${encodeURIComponent(auth.crumb)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: auth.cookie } });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
    if (typeof raw !== "number") return null;
    return (raw * 1000 - Date.now()) / 86400000;
  } catch {
    return null;
  }
}

/** yfinance's ticker.info["sector"] equivalent, via the unauthenticated
 * search endpoint (quoteSummary's assetProfile module needs the crumb dance
 * too, but search returns sector AND industry directly without it). Industry
 * is the finer-grained field used for theme/sub-sector matching (lib/themes.ts). */
export async function fetchSectorAndIndustry(ticker: string): Promise<{ sector: string | null; industry: string | null }> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=5`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return { sector: null, industry: null };
    const data = await res.json();
    const quotes: any[] = data?.quotes ?? [];
    const exact = quotes.find((q) => q.symbol === ticker.toUpperCase()) ?? quotes[0];
    return { sector: exact?.sector ?? null, industry: exact?.industry ?? null };
  } catch {
    return { sector: null, industry: null };
  }
}
