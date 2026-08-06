"""Daily report: console/Telegram text + dark navy/gold HTML file + chart photos."""
from __future__ import annotations
import os
from datetime import date
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"


def _fmt_stock(i: int, r: dict, deposit: float, risk_pct: float, size_mult: float) -> str:
    t, v, h = r["tech"], r.get("vision") or {}, r["halal"]
    risk_per_share = max(r["entry"] - r["stop"], 0.01)
    shares = int(deposit * risk_pct / 100 * size_mult / risk_per_share) if size_mult else 0
    lines = [
        f"{i}. *{r['ticker']}* — {r['score']:.0f}/100 · A+ {r['aplus']}/9 · "
        f"chart {v.get('grade','–')} · halal {h.status}",
        f"   {v.get('pattern','?')} | {v.get('entry_type','–')} entry | "
        f"RS {t.rs_pctile:.0f} | RSI {t.rsi14:.0f}"
        + (" | VDU" if t.vdu else ""),
        f"   Entry {r['entry']} · Stop {r['stop']} · Target {r['target']} · "
        f"R/R {r['rr']:.1f} · size ~{shares} sh @1% risk",
    ]
    if v.get("note"):
        lines.append(f"   👁 {v['note']}")
    if t.flags:
        lines.append(f"   ⚠ {'; '.join(t.flags)}")
    return "\n".join(lines)


def build_text(regime, sectors, top, rejected, deposit=10_000, risk_pct=1.0) -> str:
    checks = " · ".join(("✅" if ok else "❌") + " " + k for k, ok in regime.checks.items())
    s = [f"📊 *VIP ӘДІС — Daily Swing Agent* · {date.today()}",
         "",
         f"*Regime:* {regime.mode} ({regime.score}/4, size ×{regime.size_multiplier})",
         checks,
         f"VIX {regime.vix:.1f} — {regime.vix_note}" if regime.vix else "",
         "",
         "*Sector rotation (top 5):*"]
    for _, row in sectors.head(5).iterrows():
        s.append(f"  {row['rank']}. {row['etf']} {row['sector']} — {row['raw_score']}/3 "
                 f"(1W {row['1W_vs_SPY']:+.1f}% vs SPY)"
                 + (f" ⚠{row['halal_note']}" if row['halal_note'] else ""))
    s.append("")
    if regime.mode == "NO_TRADE":
        s.append("🚫 *WATCHLIST-ONLY DAY* — regime ≤1/4. List below is for watching, not entering.")
        s.append("")
    s.append(f"*Top {len(top)} candidates:*" if top else "*No candidates passed the gates today — жоқ жерден сетап жасамаймыз.*")
    for i, r in enumerate(top, 1):
        s.append(_fmt_stock(i, r, deposit, risk_pct, regime.size_multiplier))
        s.append("")
    if rejected:
        s.append("_Rejected at gates:_ " + ", ".join(f"{t} ({w})" for t, w in rejected[:8]))
    s.append("")
    s.append("_Скринер — фильтр, шешім — қолмен. Капитал — бірінші орында._")
    s.append("_Zoya-да халал статусты растаңыз. Educational tool, not financial advice._")
    return "\n".join(x for x in s if x is not None)


def save_html(text: str) -> Path:
    body = text.replace("*", "").replace("\n", "<br>\n")
    html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>Swing Agent — {date.today()}</title><style>
body{{background:#0a1628;color:#e8e2d0;font-family:'Segoe UI',sans-serif;
max-width:860px;margin:2rem auto;padding:0 1rem;line-height:1.55}}
h1{{color:#d4af37;border-bottom:1px solid #d4af37;padding-bottom:.4rem}}
</style></head><body><h1>VIP ӘДІС — Daily Swing Agent</h1><p>{body}</p></body></html>"""
    p = OUT / f"report_{date.today()}.html"
    p.write_text(html)
    return p


def send_telegram(text: str, chart_paths: list[Path] | None = None) -> bool:
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("[report] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — skipping Telegram")
        return False
    base = f"https://api.telegram.org/bot{token}"
    for chunk_start in range(0, len(text), 3900):
        requests.post(f"{base}/sendMessage", data={
            "chat_id": chat, "text": text[chunk_start:chunk_start + 3900],
            "parse_mode": "Markdown"}, timeout=30)
    for p in (chart_paths or []):
        with open(p, "rb") as f:
            requests.post(f"{base}/sendPhoto", data={"chat_id": chat, "caption": p.stem},
                          files={"photo": f}, timeout=60)
    return True
