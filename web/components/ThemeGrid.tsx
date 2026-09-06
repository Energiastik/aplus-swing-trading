"use client";

import { useState } from "react";
import TradingViewWidget from "./TradingViewWidget";
import { StageBadge } from "./Badges";
import type { ThemeRow } from "@/lib/db";
import { useLanguage } from "@/lib/i18n";

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
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return <p className="empty-state">{t("no_theme_data")}</p>;
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
      {sorted.map((row) => {
        const isOpen = expanded.has(row.etf);
        return (
          <div key={row.etf} className="theme-card">
            <div className="theme-card-header" onClick={() => toggle(row.etf)}>
              <div>
                <div className="theme-card-name">{row.name}</div>
                <div className="theme-card-etf">
                  {row.etf} · {row.kind === "Theme" ? t("kind_theme") : t("kind_sector")}
                </div>
              </div>
              <StageBadge stage={row.status} />
            </div>
            <div className="theme-card-stats">
              <span>
                {t("srs_label")} <b>{row.srs != null ? row.srs.toFixed(2) : "—"}</b>
              </span>
              <span>
                {t("delta3d_label")}{" "}
                <b>{row.d3d != null ? (row.d3d >= 0 ? "+" : "") + row.d3d.toFixed(2) : "—"}</b>
              </span>
              <span>
                {t("breadth_label")}{" "}
                <b>
                  {row.breadth_pct != null ? `${row.breadth_pct.toFixed(0)}%` : "—"}
                  {row.breadth_trend === "up" ? " ↑" : row.breadth_trend === "down" ? " ↓" : ""}
                </b>
              </span>
            </div>
            {isOpen && (
              <div className="tv-frame" style={{ marginTop: "0.6rem" }}>
                <span className="tv-sweep" />
                <TradingViewWidget
                  symbol={row.tv_symbol || row.etf}
                  height={280}
                  config={{ range: "3M", hide_side_toolbar: true }}
                />
              </div>
            )}
            {!isOpen && (
              <button className="theme-card-expand" onClick={() => toggle(row.etf)}>
                {t("show_chart_3m")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
