"""Build the daily swing-scan PDF (in Russian) from a structured results dict.

This does NOT run any analysis itself -- the calling agent (Claude, working
through strategy/DAILY_PROMPT.md) does the regime/sector/screener/technical/
chart-vision work and hands the findings here as plain data, already written
in Russian for every free-text field. Keeping this module dumb-on-purpose
means the judgment calls (chart grading, R/R from real structural levels,
which names are the top verdicts) stay with whoever ran the scan.

Reportlab's built-in fonts (Helvetica etc.) cannot render Cyrillic at all --
Russian text would come out as blank boxes. assets/fonts/DejaVuSans(.ttf/-Bold)
is bundled in this repo specifically to fix that; it's registered below and
used for every style.

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
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "assets" / "fonts"

NAVY = colors.HexColor("#0a1628")
GOLD = colors.HexColor("#d4af37")
CREAM = colors.HexColor("#e8e2d0")
GREY = colors.HexColor("#666666")

MODE_RU = {
    "AGGRESSIVE": "АГРЕССИВНЫЙ",
    "CAUTIOUS": "ОСТОРОЖНО",
    "NO_TRADE": "БЕЗ СДЕЛОК (только наблюдение)",
}


def _register_fonts() -> None:
    if "DejaVuSans" in pdfmetrics.getRegisteredFontNames():
        return
    pdfmetrics.registerFont(TTFont("DejaVuSans", str(FONT_DIR / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(FONT_DIR / "DejaVuSans-Bold.ttf")))


def _styles():
    _register_fonts()
    ss = getSampleStyleSheet()
    for name in list(ss.byName):
        ss[name].fontName = "DejaVuSans"
    ss.add(ParagraphStyle("H1", parent=ss["Heading1"], fontName="DejaVuSans-Bold",
                           textColor=NAVY, spaceAfter=4))
    ss.add(ParagraphStyle("H2", parent=ss["Heading2"], fontName="DejaVuSans-Bold",
                           textColor=NAVY, spaceBefore=14, spaceAfter=6))
    ss.add(ParagraphStyle("Body", parent=ss["BodyText"], fontName="DejaVuSans", leading=14))
    ss.add(ParagraphStyle("Small", parent=ss["BodyText"], fontName="DejaVuSans",
                           fontSize=8.5, textColor=GREY, leading=11))
    ss.add(ParagraphStyle("Note", parent=ss["BodyText"], fontName="DejaVuSans",
                           fontSize=9.5, leading=13, spaceBefore=4))
    return ss


def _regime_block(data: dict, ss) -> list:
    r = data["regime"]
    mode_ru = MODE_RU.get(r.get("mode", ""), r.get("mode", ""))
    checks = r.get("checks", {})
    check_lines = "  ".join(("✓" if ok else "✗") + " " + k for k, ok in checks.items())
    flow = [
        Paragraph(f"Режим: <b>{mode_ru}</b> ({r['score']}/4, объём ×{r.get('size_multiplier', 1)})",
                  ss["Body"]),
        Paragraph(check_lines, ss["Small"]),
    ]
    if r.get("vix") is not None:
        flow.append(Paragraph(f"VIX {r['vix']:.1f} — {r.get('vix_note', '')}", ss["Small"]))
    return flow


def _sector_table(data: dict, ss) -> Table:
    rows = [["Место", "ETF", "Сектор", "1НЕД/SPY", "4НЕД/SPY", "12НЕД/SPY", "Взвеш. балл"]]
    for s in data.get("sector_table", []):
        rows.append([s.get("rank", ""), s.get("etf", ""), s.get("sector", ""),
                     s.get("w1", ""), s.get("w4", ""), s.get("w12", ""), s.get("weighted", "")])
    t = Table(rows, hAlign="LEFT", colWidths=[0.45 * inch, 0.45 * inch, 1.45 * inch,
                                               0.85 * inch, 0.85 * inch, 0.85 * inch, 1.1 * inch])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "DejaVuSans"),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), CREAM),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f2ec")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _all_candidates_block(data: dict, ss) -> list:
    tickers = data.get("all_candidates", [])
    if not tickers:
        return []
    line = "  ·  ".join(
        f"{c.get('ticker', c) if isinstance(c, dict) else c}"
        + (f" ({c.get('sector')})" if isinstance(c, dict) and c.get("sector") else "")
        for c in tickers
    )
    return [
        Paragraph(f"Все кандидаты, прошедшие скринер ({len(tickers)}):", ss["H2"]),
        Paragraph(line, ss["Small"]),
    ]


def _top10_table(data: dict, ss) -> list:
    top10 = data.get("top10", [])
    if not top10:
        return [Paragraph("Недостаточно кандидатов для топ-10.", ss["Body"])]
    header = ["Тикер", "Балл", "График", "Стадия", "R/R", "До\nотчёта", "Пояснение"]
    rows = [header]
    for c in top10:
        rows.append([
            c.get("ticker", ""), c.get("composite_score", ""), c.get("chart_grade", ""),
            Paragraph(str(c.get("sector_stage", "")), ss["Small"]),
            Paragraph(str(c.get("rr", "—")), ss["Small"]),
            Paragraph(str(c.get("earnings_days", "—")), ss["Small"]),
            Paragraph(c.get("explanation", ""), ss["Small"]),
        ])
    t = Table(rows, hAlign="LEFT", colWidths=[0.5 * inch, 0.4 * inch, 0.6 * inch,
                                               0.8 * inch, 0.5 * inch, 0.7 * inch, 2.7 * inch])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "DejaVuSans"),
        ("FONTNAME", (0, 0), (-1, 0), "DejaVuSans-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), CREAM),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f2ec")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [Paragraph("Топ-10 кандидатов", ss["H1"]), t]


def _verdict_block(v: dict, ss) -> list:
    flow = [Paragraph(
        f"<b>{v['ticker']}</b> — Вход {v.get('entry','')} · Стоп {v.get('stop','')} · "
        f"Цель {v.get('target','')} · R/R {v.get('rr','')} · "
        f"Ожидаемый рост {v.get('expected_gain_pct','')}", ss["H2"])]
    if v.get("chart_path") and Path(v["chart_path"]).exists():
        flow.append(Image(v["chart_path"], width=5.3 * inch, height=3.0 * inch))
    if v.get("reasoning"):
        flow.append(Paragraph(v["reasoning"], ss["Note"]))
    flow.append(Spacer(1, 10))
    return flow


def build_pdf(data: dict, out_path: str | Path) -> Path:
    """data schema (all keys optional except date/regime):
    {
      "date": "2026-08-07",
      "regime": {"score": int, "mode": "AGGRESSIVE"|"CAUTIOUS"|"NO_TRADE",
                 "vix": float|None, "vix_note": str (Russian),
                 "size_multiplier": float, "checks": {label: bool}},
      "sector_table": [{"rank","etf","sector","w1","w4","w12","weighted"}],
      "sector_rotation_highlights": "Russian free text",
      "all_candidates": [{"ticker","sector"}] or [ticker, ...] -- every name
          the screener returned, tickers at minimum.
      "top10": [{
          "ticker","composite_score","chart_grade","sector_stage","rr",
          "earnings_days","explanation" (Russian, one line)
      }] -- up to 10, ranked, regardless of whether they cleared every gate.
      "verdicts": [{
          "ticker","entry","stop","target","rr","expected_gain_pct",
          "chart_path","reasoning" (Russian)
      }] -- 0-3 names that genuinely clear every hard gate. Never padded.
      "footer_note": str (Russian),
    }
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ss = _styles()
    doc = SimpleDocTemplate(str(out_path), pagesize=letter,
                             topMargin=0.6 * inch, bottomMargin=0.6 * inch,
                             leftMargin=0.6 * inch, rightMargin=0.6 * inch)
    flow = [
        Paragraph(f"A+ Swing Trading — Ежедневный Скрининг · {data.get('date', '')}", ss["H1"]),
        *_regime_block(data, ss),
        Spacer(1, 10),
        Paragraph("Ротация секторов", ss["H2"]),
    ]
    if data.get("sector_table"):
        flow.append(_sector_table(data, ss))
    if data.get("sector_rotation_highlights"):
        flow.append(Spacer(1, 6))
        flow.append(Paragraph(data["sector_rotation_highlights"], ss["Body"]))

    flow.append(Spacer(1, 10))
    flow.extend(_all_candidates_block(data, ss))

    flow.append(PageBreak())
    flow.extend(_top10_table(data, ss))

    verdicts = data.get("verdicts", [])
    flow.append(Spacer(1, 14))
    flow.append(Paragraph("Топ-3 рекомендации — итоговый вердикт", ss["H1"]))
    if not verdicts:
        flow.append(Paragraph(
            "Сегодня ни один кандидат не прошёл все фильтры полностью. "
            "Не создаём сетап из ничего — это день наблюдения.", ss["Body"]))
    else:
        for v in verdicts:
            flow.extend(_verdict_block(v, ss))

    flow.append(Spacer(1, 16))
    flow.append(Paragraph(
        data.get("footer_note",
                  "Скринер — это фильтр, а не сигнал; решение принимается вручную. "
                  "Капитал — на первом месте. Это образовательный инструмент, "
                  "а не финансовая консультация."),
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
