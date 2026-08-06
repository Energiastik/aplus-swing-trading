"""Day 4 halal screen — AAOIFI business + ratio screen. Output: PASS / REVIEW / FAIL.
Every PASS still carries 'confirm in Zoya' (teacher's own workflow)."""
from __future__ import annotations
from dataclasses import dataclass, field
from . import data

HARAM_KEYWORDS = [
    "bank", "insurance", "casino", "gaming", "gambl", "tobacco", "alcohol",
    "brewer", "distill", "wine", "beer", "cannabis", "mortgage", "lending",
    "consumer finance", "credit services", "capital markets", "adult",
]
REVIEW_KEYWORDS = ["aerospace & defense", "defense", "hotels", "restaurants",
                   "airlines", "media", "entertainment", "asset management"]
# Payment processors are halal (Visa/MC logic) — whitelist beats "credit services" match
WHITELIST = {"V", "MA", "PYPL", "GPN", "FI", "FIS"}


@dataclass
class HalalResult:
    status: str = "REVIEW"        # PASS | REVIEW | FAIL
    reasons: list = field(default_factory=list)
    ratios: dict = field(default_factory=dict)


def _first(bs, names):
    for n in names:
        if n in bs.index:
            v = bs.loc[n].iloc[0]
            if v == v:  # not NaN
                return float(v)
    return None


def screen(ticker: str, industry: str = "", sector: str = "") -> HalalResult:
    r = HalalResult()
    text = f"{industry} {sector}".lower()

    if ticker in WHITELIST:
        r.status = "PASS"
        r.reasons.append("payment processor — halal per course guidance")
    elif any(k in text for k in HARAM_KEYWORDS):
        r.status = "FAIL"
        r.reasons.append(f"business screen: '{industry or sector}'")
        return r
    elif any(k in text for k in REVIEW_KEYWORDS):
        r.reasons.append(f"doubtful business area: '{industry or sector}' — check AAOIFI/Zoya")

    bs = data.balance_sheet(ticker)
    if bs.empty:
        r.reasons.append("no balance sheet data — ratios unverified")
        if r.status != "PASS":
            r.status = "REVIEW"
        return r

    assets = _first(bs, ["Total Assets"])
    debt = _first(bs, ["Total Debt", "Long Term Debt"])
    recv = _first(bs, ["Accounts Receivable", "Receivables", "Gross Accounts Receivable"])
    cash = _first(bs, ["Cash Cash Equivalents And Short Term Investments",
                       "Cash And Cash Equivalents"])

    ok = True
    if assets:
        if debt is not None:
            v = debt / assets
            r.ratios["debt/assets"] = round(v, 3)
            if v >= 0.30:
                ok = False
                r.reasons.append(f"interest-bearing debt/assets {v:.0%} ≥ 30%")
        if recv is not None:
            v = recv / assets
            r.ratios["receivables/assets"] = round(v, 3)
            if v >= 0.45:
                ok = False
                r.reasons.append(f"receivables/assets {v:.0%} ≥ 45%")
        if cash is not None:
            v = cash / assets
            r.ratios["cash/assets"] = round(v, 3)
            if v >= 0.33:
                ok = False
                r.reasons.append(f"cash+securities/assets {v:.0%} ≥ 33%")

    if not ok:
        r.status = "FAIL"
    elif r.status != "FAIL" and not r.reasons:
        r.status = "PASS"
    elif r.status != "FAIL":
        r.status = "PASS" if r.status == "PASS" else "REVIEW"
    r.reasons.append("confirm in Zoya before entry")
    return r
