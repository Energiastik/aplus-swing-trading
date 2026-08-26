"""Phase 3: options call/put walls -- max-open-interest strikes read as dealer-hedging
pressure zones (Smart Money confluence, STRATEGY.md section 6). Informational only:
never a hard gate, never changes size or rejects a setup -- it only adds or removes a
confluence hit near a proposed entry, same as an S/R zone or a Fib level.

Yahoo's openInterest field is settlement-computed and occasionally comes back 0 across
every strike on every ticker (observed even on SPY/QQQ, which always carry real OI in
reality) -- a known gap in the free feed, not a bug in this code. When that happens we
fall back to today's traded volume as a much weaker "activity wall" proxy and label it
as such (source="volume_fallback"); if both are empty we report unavailable rather than
fabricate a level.
"""
from __future__ import annotations
from dataclasses import dataclass
import datetime as dt


@dataclass
class OptionsWalls:
    source: str = "unavailable"  # "open_interest" | "volume_fallback" | "unavailable"
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


def read(ticker: str, price: float, band_pct: float = 25.0) -> OptionsWalls:
    """Call/put wall read for one ticker. `price`: current price, used to (a) bound the
    strike search to a realistic band so a deep-OTM outlier can't win on a thin book,
    and (b) compute distance-to-wall percentages."""
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
