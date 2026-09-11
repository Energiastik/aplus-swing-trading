"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage, pickText } from "@/lib/i18n";
import type { WatchlistRow } from "@/lib/db";
import { VerdictBadge } from "@/components/Badges";
import WatchlistChartModal from "@/components/WatchlistChartModal";
import LogoutButton from "@/components/LogoutButton";
import LangToggle from "@/components/LangToggle";

function fmtDateTime(iso: string, lang: "ru" | "en"): string {
  try {
    return new Date(iso).toLocaleString(lang === "en" ? "en-US" : "ru-RU", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncate(s: string | null, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

export default function WatchlistView({
  initialRows,
  dbError,
  sessionLabel,
}: {
  initialRows: WatchlistRow[];
  dbError: boolean;
  sessionLabel: string | null;
}) {
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState<WatchlistRow | null>(null);

  const sessionBar = (
    <div className="session-bar">
      <Link href="/" style={{ color: "var(--gold)", fontSize: "0.85rem", textDecoration: "none" }}>
        {t("nav_dashboard")}
      </Link>
      <LangToggle />
      {sessionLabel}
      <LogoutButton />
    </div>
  );

  return (
    <main className="container">
      {sessionBar}
      <section className="panel">
        <h1 style={{ fontFamily: "var(--font-display)", color: "var(--gold)", fontSize: "1.4rem", margin: "0 0 0.3rem" }}>
          {t("watchlist_title")}
        </h1>
        <p className="meta-line" style={{ margin: "0 0 0.5rem" }}>{t("watchlist_subtitle")}</p>

        {dbError ? (
          <p className="empty-state">{t("watchlist_no_db")}</p>
        ) : initialRows.length === 0 ? (
          <p className="empty-state">{t("watchlist_empty")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("th_ticker")}</th>
                <th>{t("th_verdict")}</th>
                <th>{t("watchlist_justification")}</th>
                <th>A+</th>
                <th>{t("th_conviction")}</th>
                <th>{t("th_checked")}</th>
                <th>{t("th_chart")}</th>
              </tr>
            </thead>
            <tbody>
              {initialRows.map((r) => {
                const raw = r.raw as Record<string, any> | null;
                const justification = pickText(lang, raw?.justification_ru ?? r.reason, raw?.justification_en);
                return (
                  <tr key={r.id}>
                    <td>
                      <b>{r.ticker}</b>
                    </td>
                    <td>
                      <VerdictBadge verdict={r.verdict} />
                    </td>
                    <td style={{ maxWidth: 360 }}>{truncate(justification, 140)}</td>
                    <td>{r.aplus_score != null ? `${r.aplus_score}/9` : "—"}</td>
                    <td>{r.conviction ?? "—"}</td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{fmtDateTime(r.checked_at, lang)}</td>
                    <td>
                      <button
                        onClick={() => setOpen(r)}
                        aria-label={`${t("show_chart_for")} ${r.ticker}`}
                        title={`${t("show_chart_for")} ${r.ticker}`}
                        style={{
                          background: "rgba(212, 175, 55, 0.12)", border: "1px solid var(--border)",
                          borderRadius: 8, color: "var(--gold)", width: 32, height: 32,
                          cursor: "pointer", fontSize: "1rem", lineHeight: 1,
                        }}
                      >
                        📈
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {open && <WatchlistChartModal row={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
