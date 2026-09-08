/** Port of agent/options_walls.py's MarketData.app path only (Node/Vercel has
 * no yfinance, so the yfinance-OI and volume-fallback tiers from the Python
 * version aren't available here) -- informational confluence input only,
 * never a hard gate, same as the daily pipeline. Reports source:"unavailable"
 * rather than fabricate a level when no token is set or the request fails. */

export interface OptionsWalls {
  source: "open_interest" | "unavailable";
  provider: "marketdata" | null;
  expiry: string | null;
  days_to_expiry: number | null;
  call_wall: number | null;
  call_wall_strength: number | null;
  put_wall: number | null;
  put_wall_strength: number | null;
  put_call_ratio: number | null;
  dist_to_call_wall_pct: number | null;
  dist_to_put_wall_pct: number | null;
}

const UNAVAILABLE: OptionsWalls = {
  source: "unavailable", provider: null, expiry: null, days_to_expiry: null,
  call_wall: null, call_wall_strength: null, put_wall: null, put_wall_strength: null,
  put_call_ratio: null, dist_to_call_wall_pct: null, dist_to_put_wall_pct: null,
};

function pickExpiry(expirations: string[], minDays = 7, maxDays = 45): [string | null, number | null] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidates: [string, number][] = [];
  for (const e of expirations) {
    const d = new Date(e + "T00:00:00Z");
    if (isNaN(d.getTime())) continue;
    const days = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (days >= minDays) candidates.push([e, days]);
  }
  if (candidates.length === 0) return [null, null];
  const inWindow = candidates.filter(([, d]) => d <= maxDays);
  return inWindow.length > 0 ? inWindow[0] : candidates[0];
}

export async function readOptionsWalls(ticker: string, price: number, token: string | null, bandPct = 25.0): Promise<OptionsWalls> {
  if (!token) return UNAVAILABLE;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const expRes = await fetch(`https://api.marketdata.app/v1/options/expirations/${ticker}/`, { headers });
    const expJson = await expRes.json();
    if (expJson?.s !== "ok" || !expJson?.expirations?.length) return UNAVAILABLE;

    const [expiry, days] = pickExpiry(expJson.expirations);
    if (!expiry) return UNAVAILABLE;

    const lo = price * (1 - bandPct / 100);
    const hi = price * (1 + bandPct / 100);
    const chainUrl = new URL(`https://api.marketdata.app/v1/options/chain/${ticker}/`);
    chainUrl.searchParams.set("expiration", expiry);
    chainUrl.searchParams.set("strike", `${lo.toFixed(2)}-${hi.toFixed(2)}`);
    const chainRes = await fetch(chainUrl.toString(), { headers });
    const chainJson = await chainRes.json();
    if (chainJson?.s !== "ok") return UNAVAILABLE;

    const strikes: number[] = chainJson.strike ?? [];
    const ois: number[] = chainJson.openInterest ?? [];
    const sides: string[] = chainJson.side ?? [];
    if (!(strikes.length && ois.length === strikes.length && sides.length === strikes.length)) return UNAVAILABLE;

    let callBest: [number, number] | null = null;
    let putBest: [number, number] | null = null;
    let callTotal = 0, putTotal = 0;
    for (let i = 0; i < strikes.length; i++) {
      const oi = ois[i] || 0;
      if (sides[i] === "call") {
        callTotal += oi;
        if (!callBest || oi > callBest[1]) callBest = [strikes[i], oi];
      } else if (sides[i] === "put") {
        putTotal += oi;
        if (!putBest || oi > putBest[1]) putBest = [strikes[i], oi];
      }
    }
    if (callTotal <= 0 && putTotal <= 0) return UNAVAILABLE;

    const out: OptionsWalls = { ...UNAVAILABLE, source: "open_interest", provider: "marketdata", expiry, days_to_expiry: days };
    if (callBest) {
      out.call_wall = callBest[0];
      out.call_wall_strength = callBest[1];
      out.dist_to_call_wall_pct = Math.round(((out.call_wall / price - 1) * 100) * 100) / 100;
    }
    if (putBest) {
      out.put_wall = putBest[0];
      out.put_wall_strength = putBest[1];
      out.dist_to_put_wall_pct = Math.round(((out.put_wall / price - 1) * 100) * 100) / 100;
    }
    if (callTotal > 0 && putTotal > 0) out.put_call_ratio = Math.round((putTotal / callTotal) * 100) / 100;
    return out;
  } catch {
    return UNAVAILABLE;
  }
}
