"use client";

import { useState } from "react";
import { GradeBadge, StageBadge } from "./Badges";
import ChartModal from "./ChartModal";
import type { Top10Row } from "@/lib/db";

export default function Top10Table({ rows }: { rows: Top10Row[] }) {
  const [open, setOpen] = useState<{ ticker: string; tvSymbol: string } | null>(null);

  if (rows.length === 0) {
    return <p className="empty-state">Недостаточно кандидатов для топ-10.</p>;
  }

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Тикер</th>
            <th>Балл</th>
            <th>Оценка</th>
            <th>Стадия</th>
            <th>R/R</th>
            <th>До отчёта</th>
            <th>Пояснение</th>
            <th>График</th>
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
              <td style={{ maxWidth: 320 }}>{c.explanation}</td>
              <td>
                <button
                  onClick={() =>
                    setOpen({ ticker: c.ticker, tvSymbol: c.tv_symbol || c.ticker })
                  }
                  aria-label={`График ${c.ticker}`}
                  title={`Показать график ${c.ticker}`}
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
      {open && (
        <ChartModal
          ticker={open.ticker}
          tvSymbol={open.tvSymbol}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
