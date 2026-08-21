"use client";

import { useState } from "react";
import TradingViewWidget from "./TradingViewWidget";
import { StageBadge } from "./Badges";
import type { ThemeRow } from "@/lib/db";

// Sort so the actionable ones surface first: Building/Emerging (early --
// what the user is specifically watching for), then Leading, then
// Fading/Lagging (beaten down or losing steam), then Neutral/unclassified.
const STATUS_ORDER: Record<string, number> = {
  Building: 0,
  Emerging: 1,
  Leading: 2,
  Fading: 3,
  Lagging: 4,
  Neutral: 5,
};

function sortThemes(rows: ThemeRow[]): ThemeRow[] {
  return [...rows].sort((a, b) => {
    const oa = STATUS_ORDER[a.status ?? ""] ?? 6;
    const ob = STATUS_ORDER[b.status ?? ""] ?? 6;
    if (oa !== ob) return oa - ob;
    return (b.srs ?? 0) - (a.srs ?? 0);
  });
}

export default function ThemeGrid({ rows }: { rows: ThemeRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return (
      <p className="empty-state">
        Данные по темам за этот запуск недоступны — sector-rotation/pipeline.py не
        вернул результат, или его вывод ещё не прокинут в этот запуск.
      </p>
    );
  }

  const sorted = sortThemes(rows);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "0.85rem",
      }}
    >
      {sorted.map((t) => {
        const isOpen = expanded.has(t.etf);
        return (
          <div key={t.etf} className="theme-card">
            <div className="theme-card-header" onClick={() => toggle(t.etf)}>
              <div>
                <div className="theme-card-name">{t.name}</div>
                <div className="theme-card-etf">
                  {t.etf} · {t.kind === "Theme" ? "тема" : "сектор"}
                </div>
              </div>
              <StageBadge stage={t.status} />
            </div>
            <div className="theme-card-stats">
              <span>
                SRS <b>{t.srs != null ? t.srs.toFixed(2) : "—"}</b>
              </span>
              <span>
                Δ3Д <b>{t.d3d != null ? (t.d3d >= 0 ? "+" : "") + t.d3d.toFixed(2) : "—"}</b>
              </span>
              <span>
                Ширина{" "}
                <b>
                  {t.breadth_pct != null ? `${t.breadth_pct.toFixed(0)}%` : "—"}
                  {t.breadth_trend === "up" ? " ↑" : t.breadth_trend === "down" ? " ↓" : ""}
                </b>
              </span>
            </div>
            {isOpen && (
              <div style={{ marginTop: "0.6rem" }}>
                <TradingViewWidget
                  symbol={t.tv_symbol || t.etf}
                  height={280}
                  config={{ range: "3M", hide_side_toolbar: true }}
                />
              </div>
            )}
            {!isOpen && (
              <button className="theme-card-expand" onClick={() => toggle(t.etf)}>
                Показать график за 3 месяца ▾
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
