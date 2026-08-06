"""Build the daily swing-scan PDF from a structured results dict.

This does NOT run any analysis itself — the calling agent (Claude, working
through strategy/DAILY_PROMPT.md) does the regime/sector/screener/technical/
chart-vision work and hands the findings here as plain data. Keeping this
module dumb-on-purpose means the judgment calls (chart grading, R/R from
real structural levels, which name is the best pick) stay with whoever ran
the scan, not baked into a rigid script.

Usage:
    python -m agent.pdf_report results.json output/swing_report_2026-08-07.pdf
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

NAVY = colors.HexColor("#0a1628")
GOLD = colors.HexColor("#d4af37")
CREAM = colors.HexColor("#e8e2d0")
GREY = colors.HexColor("#666666")


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H1", parent=ss["Heading1"], textColor=NAVY, spaceAfter=4))
    ss.add(ParagraphStyle("H2", parent=ss["Heading2"], textColor=NAVY, spaceBefore=14, spaceAfter=6))
    ss.add(ParagraphStyle("Body", parent=ss["BodyText"], leading=14))
    ss.add(ParagraphStyle("Small", parent=ss["BodyText"], fontSize=8.5, textColor=GREY, leading=11))
    ss.add(ParagraphStyle("Note", parent=ss["BodyText"], fontSize=9.5, leading=13, spaceBefore=4))
    return ss


def _regime_block(data: dict, ss) -> list:
    r = data["regime"]
    checks = r.get("checks", {})
    check_lines = "  ".join(("✓" if ok else "✗") + " " + k for k, ok in checks.items())
    flow = [
        Paragraph(f"Regime: <b>{r['mode']}</b> ({r['score']}/4, size ×{r.get('size_multiplier', 1)})", ss["Body"]),
        Paragraph(check_lines, ss["Small"]),
    ]
    if r.get("vix") is not None:
        flow.append(Paragraph(f"VIX {r['vix']:.1f} — {r.get('vix_note', '')}", ss["Small"]))
    return flow


def _sector_table(data: dict, ss) -> Table:
    rows = [["Rank", "ETF", "Sector", "1W vs SPY", "4W vs SPY", "12W vs SPY", "Weighted"]]
    for s in data.get("sector_table", []):
        rows.append([s.get("rank", ""), s.get("etf", ""), s.get("sector", ""),
                     s.get("w1", ""), s.get("w4", ""), s.get("w12", ""), s.get("weighted", "")])
    t = Table(rows, hAlign="LEFT", colWidths=[0.5 * inch, 0.5 * inch, 1.7 * inch,
                                               0.9 * inch, 0.9 * inch, 0.9 * inch, 0.7 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), CREAM),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f2ec")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def _candidate_block(c: dict, ss) -> list:
    flow = [Paragraph(
        f"<b>{c['ticker']}</b> — score {c.get('composite_score', '?')} · "
        f"A+ {c.get('aplus_score', '?')} · stage {c.get('sector_stage', '?')} · "
        f"chart grade <b>{c.get('chart_grade', '?')}</b>",
        ss["H2"])]
    if c.get("chart_path") and Path(c["chart_path"]).exists():
        flow.append(Image(c["chart_path"], width=5.5 * inch, height=3.2 * inch))
    facts = [
        ["Entry", c.get("entry", "")], ["Stop", c.get("stop", "")], ["Target", c.get("target", "")],
        ["R/R", c.get("rr", "")], ["Expected gain", c.get("expected_gain_pct", "")],
        ["Earnings in", c.get("earnings_days", "")],
        ["Shares @1% risk", c.get("shares_1pct", "")],
        ["Shares (regime-adjusted)", c.get("shares_regime_adjusted", "")],
    ]
    t = Table(facts, colWidths=[1.6 * inch, 4 * inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    flow.append(t)
    if c.get("chart_note"):
        flow.append(Paragraph(f"<i>Chart read:</i> {c['chart_note']}", ss["Note"]))
    if c.get("volume_note"):
        flow.append(Paragraph(f"<i>Volume context:</i> {c['volume_note']}", ss["Note"]))
    if c.get("notes"):
        flow.append(Paragraph(f"<i>Notes:</i> {c['notes']}", ss["Note"]))
    flow.append(Spacer(1, 10))
    return flow


def build_pdf(data: dict, out_path: str | Path) -> Path:
    """data schema (all keys optional except date/regime):
    {
      "date": "2026-08-07",
      "regime": {"score": int, "mode": str, "vix": float|None, "vix_note": str,
                 "size_multiplier": float, "checks": {label: bool}},
      "sector_table": [{"rank","etf","sector","w1","w4","w12","weighted"}],
      "sector_rotation_highlights": "free text paragraph — Building/Emerging/Fading read",
      "screener_count": int,
      "candidates": [{
          "ticker","composite_score","aplus_score","sector_stage",
          "chart_path","chart_grade","chart_note",
          "entry","stop","target","rr","expected_gain_pct","earnings_days",
          "volume_note","shares_1pct","shares_regime_adjusted","notes"
      }],
      "rejected_count": int,
      "best_pick": {"ticker": str, "reasoning": str},
      "footer_note": str,
    }
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ss = _styles()
    doc = SimpleDocTemplate(str(out_path), pagesize=letter,
                             topMargin=0.6 * inch, bottomMargin=0.6 * inch,
                             leftMargin=0.6 * inch, rightMargin=0.6 * inch)
    flow = [
        Paragraph(f"A+ Swing Trading — Daily Scan · {data.get('date', '')}", ss["H1"]),
        *_regime_block(data, ss),
        Spacer(1, 10),
        Paragraph("Sector Rotation", ss["H2"]),
    ]
    if data.get("sector_table"):
        flow.append(_sector_table(data, ss))
    if data.get("sector_rotation_highlights"):
        flow.append(Spacer(1, 6))
        flow.append(Paragraph(data["sector_rotation_highlights"], ss["Body"]))

    flow.append(Spacer(1, 10))
    n = len(data.get("candidates", []))
    flow.append(Paragraph(
        f"Screener returned {data.get('screener_count', '?')} candidates. "
        f"{n} cleared every gate" + (f" ({data['rejected_count']} rejected)." if data.get("rejected_count") else "."),
        ss["Body"]))

    if not data.get("candidates"):
        flow.append(Spacer(1, 6))
        flow.append(Paragraph(
            "No candidates passed every gate today. Never forcing a setup out of nothing — "
            "this is a watchlist-only day.", ss["Body"]))
    else:
        flow.append(PageBreak())
        flow.append(Paragraph("Candidates", ss["H1"]))
        for c in data["candidates"]:
            flow.extend(_candidate_block(c, ss))

    if data.get("best_pick"):
        flow.append(Spacer(1, 10))
        bp = data["best_pick"]
        flow.append(Paragraph(f"Best setup today: {bp.get('ticker', '?')}", ss["H2"]))
        flow.append(Paragraph(bp.get("reasoning", ""), ss["Body"]))

    flow.append(Spacer(1, 16))
    flow.append(Paragraph(
        data.get("footer_note",
                  "Screener is a filter, not a signal — decisions are manual. "
                  "Confirm halal compliance yourself. Educational tool, not financial advice."),
        ss["Small"]))

    doc.build(flow)
    return out_path


def main():
    if len(sys.argv) < 3:
        print("Usage: python -m agent.pdf_report <results.json> <output.pdf>", file=sys.stderr)
        sys.exit(1)
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = build_pdf(data, sys.argv[2])
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
