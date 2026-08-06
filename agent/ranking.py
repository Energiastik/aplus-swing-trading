"""Composite ranking. Hard gates first, then weighted score, then Top N."""
from __future__ import annotations
import pandas as pd

GRADE_PTS = {"A": 100, "B": 75, "C": 45, "F": 0}
WEIGHTS = {"technical": 0.35, "vision": 0.30, "aplus": 0.25, "sector": 0.10}


def technical_points(t) -> float:
    pts = 0.0
    pts += 25 if t.stacked else (12 if t.above_200 else 0)
    pts += min(max(t.rs_pctile or 0, 0), 100) * 0.35
    pts += 15 if t.rsi_ok else 0
    pts += 15 if t.vdu else 0
    pts += 10 if (t.dist_to_pivot_pct is not None and -8 <= t.dist_to_pivot_pct <= 3) else 0
    return min(pts, 100)


def gates(row: dict, regime_mult: float) -> tuple[bool, str]:
    t = row["tech"]
    if not t.above_200:
        return False, "below EMA200"
    if row["halal"].status == "FAIL":
        return False, f"halal FAIL: {row['halal'].reasons[0]}"
    if row["rr"] < 3.0:
        return False, f"R/R {row['rr']:.1f} < 3.0"
    v = row.get("vision") or {}
    if v.get("grade") == "F":
        return False, f"vision F: {v.get('note','')}"
    return True, ""


def rank(rows: list[dict], regime_mult: float, top_n: int = 10) -> tuple[pd.DataFrame, list]:
    kept, rejected = [], []
    for row in rows:
        ok, why = gates(row, regime_mult)
        if not ok:
            rejected.append((row["ticker"], why))
            continue
        t = row["tech"]
        v = row.get("vision") or {}
        score = (WEIGHTS["technical"] * technical_points(t)
                 + WEIGHTS["vision"] * GRADE_PTS.get(v.get("grade", "C"), 45)
                 + WEIGHTS["aplus"] * (row["aplus"] / 9 * 100)
                 + WEIGHTS["sector"] * (100 if row["sector_top"] else 40))
        row["score"] = round(score, 1)
        kept.append(row)
    kept.sort(key=lambda r: r["score"], reverse=True)
    return kept[:top_n], rejected
