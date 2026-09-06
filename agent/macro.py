"""Macro economic snapshot: inflation (CPI), Fed funds rate, nonfarm payrolls,
initial jobless claims, and real GDP growth -- each as actual vs. previous
reading, from FRED (the Federal Reserve's own data API). Free, official,
no scraping. Read at the start of the daily scan and surfaced as the report's
opening summary section, ahead of market regime -- informational context, not
a gate: nothing here rejects or resizes a setup, same status as sector
rotation or the geopolitical summary.

Requires a free FRED_API_KEY (fred.stlouisfed.org/docs/api/api_key.html),
passed as an explicit argument -- not just an env var -- for the same reason
options_walls.py's MARKETDATA_API_TOKEN is: the automated routine has no
persistent-secrets mechanism, so credentials travel as tool-call args each
run (see ROUTINE_PROMPT.md). Never fabricates a reading: any series that
fails to fetch is left out with source noted, not filled with a guess.
"""
from __future__ import annotations
from dataclasses import dataclass, field
import os

# FRED series IDs -- all long-standing, canonical identifiers.
SERIES = {
    "cpi_index": "CPIAUCSL",          # CPI, all urban consumers, index level (monthly)
    "fed_funds_rate": "FEDFUNDS",     # Effective federal funds rate, % (monthly)
    "nonfarm_payrolls": "PAYEMS",     # Total nonfarm payrolls, thousands of persons (monthly)
    "jobless_claims": "ICSA",         # Initial claims, seasonally adjusted (weekly)
    "gdp_growth": "A191RL1Q225SBEA",  # Real GDP, % change from preceding period, SAAR (quarterly)
}


@dataclass
class MacroSnapshot:
    available: bool = False
    source: str = "fred"  # this module only ever produces FRED-sourced readings;
                          # the "web_search" alternative is assembled by the calling
                          # agent itself (DAILY_PROMPT.md step 0) when no FRED key is
                          # available, not by this function.
    error: str | None = None
    inflation_cpi_yoy_pct: dict = field(default_factory=dict)
    fed_funds_rate_pct: dict = field(default_factory=dict)
    nonfarm_payrolls_change_k: dict = field(default_factory=dict)
    jobless_claims_k: dict = field(default_factory=dict)
    gdp_growth_pct: dict = field(default_factory=dict)


def _fetch_observations(series_id: str, api_key: str, limit: int) -> list[dict] | None:
    import requests
    try:
        r = requests.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={"series_id": series_id, "api_key": api_key, "file_type": "json",
                    "sort_order": "desc", "limit": limit},
            timeout=15,
        )
        j = r.json()
    except Exception:
        return None
    obs = j.get("observations")
    if not obs:
        return None
    # FRED uses "." for a not-yet-available reading; drop those.
    clean = [o for o in obs if o.get("value") not in (None, ".", "")]
    return clean or None


def _actual_previous(obs: list[dict]) -> dict | None:
    """obs is newest-first. Returns {actual, actual_date, previous, previous_date}."""
    if len(obs) < 2:
        return None
    return {
        "actual": float(obs[0]["value"]), "actual_date": obs[0]["date"],
        "previous": float(obs[1]["value"]), "previous_date": obs[1]["date"],
    }


def read(api_key: str | None = None) -> MacroSnapshot:
    key = api_key or os.getenv("FRED_API_KEY")
    if not key:
        return MacroSnapshot(available=False, error="no FRED_API_KEY provided")

    out = MacroSnapshot()
    any_ok = False

    # Inflation: CPI YoY% needs 13 monthly observations (this month vs. 12 months ago).
    cpi = _fetch_observations(SERIES["cpi_index"], key, limit=13)
    if cpi and len(cpi) >= 13:
        latest, year_ago = cpi[0], cpi[12]
        prev, prev_year_ago = cpi[1], cpi[13] if len(cpi) > 13 else None
        yoy = (float(latest["value"]) / float(year_ago["value"]) - 1) * 100
        out.inflation_cpi_yoy_pct = {
            "actual": round(yoy, 2), "actual_date": latest["date"],
        }
        if prev_year_ago:
            prev_yoy = (float(prev["value"]) / float(prev_year_ago["value"]) - 1) * 100
            out.inflation_cpi_yoy_pct["previous"] = round(prev_yoy, 2)
            out.inflation_cpi_yoy_pct["previous_date"] = prev["date"]
        any_ok = True

    ff = _fetch_observations(SERIES["fed_funds_rate"], key, limit=2)
    if ff:
        ap = _actual_previous(ff)
        if ap:
            out.fed_funds_rate_pct = ap
            any_ok = True

    # NFP: the reported "actual" is the MONTH-OVER-MONTH change in payrolls, not the
    # level -- need 3 observations to get both this month's and last month's deltas.
    nfp = _fetch_observations(SERIES["nonfarm_payrolls"], key, limit=3)
    if nfp and len(nfp) >= 3:
        latest, prev, prev2 = (float(o["value"]) for o in nfp[:3])
        out.nonfarm_payrolls_change_k = {
            "actual": round(latest - prev, 0), "actual_date": nfp[0]["date"],
            "previous": round(prev - prev2, 0), "previous_date": nfp[1]["date"],
        }
        any_ok = True

    claims = _fetch_observations(SERIES["jobless_claims"], key, limit=2)
    if claims:
        ap = _actual_previous(claims)
        if ap:
            ap["actual"] = round(ap["actual"] / 1000, 0)  # report in thousands
            ap["previous"] = round(ap["previous"] / 1000, 0)
            out.jobless_claims_k = ap
            any_ok = True

    gdp = _fetch_observations(SERIES["gdp_growth"], key, limit=2)
    if gdp:
        ap = _actual_previous(gdp)
        if ap:
            out.gdp_growth_pct = ap
            any_ok = True

    out.available = any_ok
    if not any_ok:
        out.error = "FRED requests failed or returned no data for every series"
    return out
