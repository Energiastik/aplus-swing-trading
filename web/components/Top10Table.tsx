"use client";

import { useState } from "react";
import { GradeBadge, StageBadge } from "./Badges";
import ChartModal from "./ChartModal";
import type { Top10Row } from "@/lib/db";
import { useLanguage, pickText } from "@/lib/i18n";

export default function Top10Table({ rows }: { rows: Top10Row[] }) {
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState<Top10Row | null>(null);

  if (rows.length === 0) {
    return <p className="empty-state">{t("not_enough_for_top10")}</p>;
  }

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>{t("th_rank")}</th>
            <th>{t("th_ticker")}</th>
            <th>{t("th_score")}</th>
            <th>{t("th_grade")}</th>
            <th>{t("th_stage")}</th>
            <th>{t("th_rr")}</th>
            <th>{t("th_earnings")}</th>
            <th>{t("th_explanation")}</th>
            <th>{t("th_chart")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.ticker}>
              <td>{c.rank}</td>
              <td>
                <b>{c.ticker}</b>
              </td>
              <td>{c.composite_score ?? "—"}</td>
              <td>
                <GradeBadge grade={c.chart_grade} />
              </td>
              <td>
                <StageBadge stage={c.sector_stage} />
              </td>
              <td>{c.rr ?? "—"}</td>
              <td>{c.earnings_days ?? "—"}</td>
              <td style={{ maxWidth: 320 }}>{pickText(lang, c.explanation, c.explanation_en)}</td>
              <td>
                <button
                  onClick={() => setOpen(c)}
                  aria-label={`${t("show_chart_for")} ${c.ticker}`}
                  title={`${t("show_chart_for")} ${c.ticker}`}
                  style={{
                    background: "rgba(212, 175, 55, 0.12)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--gold)",
                    width: 32,
                    height: 32,
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                  }}
                >
                  📈
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <ChartModal row={open} onClose={() => setOpen(null)} />}
    </>
  );
}
