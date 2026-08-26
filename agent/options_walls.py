"""Phase 3: options call/put walls -- max-open-interest strikes read as dealer-hedging
pressure zones (Smart Money confluence, STRATEGY.md section 6). Informational only:
never a hard gate, never changes size or rejects a setup -- it only adds or removes a
confluence hit near a proposed entry, same as an S/R zone or a Fib level.

Primary source: MarketData.app (MARKETDATA_API_TOKEN env var) -- real open interest,
24h-delayed on the free "Free Forever" tier (100 requests/day), which is fine for a
once-a-day swing scan called on the final Top<=3 only. Requires a real token for
general use -- every ticker except their AAPL demo symbol returns 401 without one, so
the "try unauthenticated too" path below only helps for that one demo case, not real
tickers, but costs nothing extra to attempt. Falls back to yfinance if the token isn't
set/valid or the request fails for any reason, and yfinance's own openInterest field is
itself unreliable -- it has been observed returning 0 across every strike on every
ticker (even SPY/QQQ, which always carry real OI in reality), a known gap in that free
feed, not a bug here. When neither source has real OI, we fall back to today's traded
volume as a much weaker "activity wall" proxy and label it as such
(source="volume_fallback"); if even that's empty we report source="unavailable" rather
than fabricate a level.
"""
from __future__ import annotations
from dataclasses import dataclass
import datetime as dt
import os


@dataclass
class OptionsWalls:
    source: str = "unavailable"  # "open_interest" | "volume_fallback" | "unavailable"
    provider: str | None = None  # "marketdata" | "yfinance" | None
    expiry: str | None = None
    days_to_expiry: int | None = None
    call_wall: float | None = None
    call_wall_strength: int | None = None
    put_wall: float | None = None
    put_wall_strength: int | None = None
    put_call_ratio: float | None = None
    dist_to_call_wall_pct: float | None = None
    dist_to_put_wall_pct: float | None = None


def _pick_expiry(expirations: list[str], min_days: int = 7, max_days: int = 45) -> tuple[str | None, int | None]:
    """Skip 0-6 day expiries (thin, near-worthless OI/quotes); prefer the first one
    inside [min_days, max_days] (front-month, most liquid); fall back to the nearest
    expiry >= min_days if nothing lands in that window."""
    today = dt.date.today()
    candidates = []
    for e in expirations:
        try:
            d = dt.date.fromisoformat(e)
        except ValueError:
            continue
        days = (d - today).days
        if days >= min_days:
            candidates.append((e, days))
    if not candidates:
        return None, None
    in_window = [c for c in candidates if c[1] <= max_days]
    return (in_window[0] if in_window else candidates[0])


def _marketdata_walls(ticker: str, price: float, band_pct: float, token: str | None) -> OptionsWalls | None:
    """Returns None (never raises) on any failure -- missing/invalid token (401),
    network error, bad response shape, or no usable OI -- so the caller can fall
    through to yfinance. `token` may be None: real tickers 401 without one (verified:
    SPY/QQQ/TSLA/NVDA/DELL/ANET/CORT all require auth; only their AAPL demo symbol
    doesn't), so this is effectively a no-op until MARKETDATA_API_TOKEN is set, but
    costs nothing to attempt."""
    import requests

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        r = requests.get(f"https://api.marketdata.app/v1/options/expirations/{ticker}/",
                          headers=headers, timeout=10)
        j = r.json()
    except Exception:
        return None
    if j.get("s") != "ok" or not j.get("expirations"):
        return None

    expiry, days = _pick_expiry(j["expirations"])
    if expiry is None:
        return None

    lo, hi = price * (1 - band_pct / 100), price * (1 + band_pct / 100)
    try:
        r = requests.get(f"https://api.marketdata.app/v1/options/chain/{ticker}/",
                          headers=headers,
                          params={"expiration": expiry, "strike": f"{lo:.2f}-{hi:.2f}"},
                          timeout=15)
        j = r.json()
    except Exception:
        return None
    if j.get("s") != "ok":
        return None

    strikes, ois, sides = j.get("strike") or [], j.get("openInterest") or [], j.get("side") or []
    if not (strikes and ois and sides and len(strikes) == len(ois) == len(sides)):
        return None

    call_best = put_best = None
    call_total = put_total = 0
    for strike, oi, side in zip(strikes, ois, sides):
        oi = oi or 0
        if side == "call":
            call_total += oi
            if call_best is None or oi > call_best[1]:
                call_best = (strike, oi)
        elif side == "put":
            put_total += oi
            if put_best is None or oi > put_best[1]:
                put_best = (strike, oi)
    if call_total <= 0 and put_total <= 0:
        return None

    out = OptionsWalls(source="open_interest", provider="marketdata",
                        expiry=expiry, days_to_expiry=days)
    if call_best:
        out.call_wall, out.call_wall_strength = float(call_best[0]), int(call_best[1])
        out.dist_to_call_wall_pct = round((out.call_wall / price - 1) * 100, 2)
    if put_best:
        out.put_wall, out.put_wall_strength = float(put_best[0]), int(put_best[1])
        out.dist_to_put_wall_pct = round((out.put_wall / price - 1) * 100, 2)
    if call_total > 0 and put_total > 0:
        out.put_call_ratio = round(float(put_total / call_total), 2)
    return out


def _yfinance_walls(ticker: str, price: float, band_pct: float) -> OptionsWalls:
    import yfinance as yf

    out = OptionsWalls()
    try:
        tk = yf.Ticker(ticker)
        expirations = list(tk.options)
    except Exception:
        return out
    if not expirations:
        return out

    expiry, days = _pick_expiry(expirations)
    if expiry is None:
        return out

    try:
        chain = tk.option_chain(expiry)
    except Exception:
        return out
    calls, puts = chain.calls, chain.puts
    if calls.empty and puts.empty:
        return out

    out.expiry, out.days_to_expiry = expiry, days
    lo, hi = price * (1 - band_pct / 100), price * (1 + band_pct / 100)
    calls = calls[(calls["strike"] >= lo) & (calls["strike"] <= hi)]
    puts = puts[(puts["strike"] >= lo) & (puts["strike"] <= hi)]

    for col in ("openInterest", "volume"):
        call_total = calls[col].fillna(0).sum() if col in calls else 0
        put_total = puts[col].fillna(0).sum() if col in puts else 0
        if call_total <= 0 and put_total <= 0:
            continue
        out.source = "open_interest" if col == "openInterest" else "volume_fallback"
        out.provider = "yfinance"
        if call_total > 0:
            row = calls.loc[calls[col].idxmax()]
            out.call_wall = float(row["strike"])
            out.call_wall_strength = int(row[col])
            out.dist_to_call_wall_pct = round((out.call_wall / price - 1) * 100, 2)
        if put_total > 0:
            row = puts.loc[puts[col].idxmax()]
            out.put_wall = float(row["strike"])
            out.put_wall_strength = int(row[col])
            out.dist_to_put_wall_pct = round((out.put_wall / price - 1) * 100, 2)
        if call_total > 0 and put_total > 0:
            out.put_call_ratio = round(float(put_total / call_total), 2)
        break  # openInterest worked (or we've already fallen back to volume) -- stop

    return out


def read(ticker: str, price: float, band_pct: float = 25.0, token: str | None = None) -> OptionsWalls:
    """Call/put wall read for one ticker. `price`: current price, used to (a) bound the
    strike search to a realistic band so a deep-OTM outlier can't win on a thin book,
    and (b) compute distance-to-wall percentages. Tries MarketData.app first (`token`
    if passed explicitly, else the MARKETDATA_API_TOKEN env var if set, else an
    unauthenticated attempt), then falls back to yfinance's own OI, then yfinance
    volume. `token` is accepted as an explicit arg -- not just an env var -- because
    the automated routine has no persistent-secrets mechanism and passes credentials
    through the live prompt/tool-call args each run, same as everything else in this
    project (Telegram, ingest); see ROUTINE_PROMPT.md."""
    r = _marketdata_walls(ticker, price, band_pct, token or os.getenv("MARKETDATA_API_TOKEN"))
    if r is not None:
        return r
    return _yfinance_walls(ticker, price, band_pct)
