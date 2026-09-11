"use client";

import { useEffect } from "react";
import TradingViewWidget from "./TradingViewWidget";
import { VerdictBadge } from "./Badges";
import type { WatchlistRow } from "@/lib/db";
import { useLanguage, pickText } from "@/lib/i18n";

export default function WatchlistChartModal({ row, onClose }: { row: WatchlistRow; onClose: () => void }) {
  const { lang, t } = useLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const raw = row.raw as Record<string, any> | null;
  const justification = pickText(lang, raw?.justification_ru ?? row.reason, raw?.justification_en);
  const confluenceSignals: string[] = raw?.confluence_signals ?? [];
  const theme: string | null = raw?.theme ?? null;
  const themeConfidence: string | null = raw?.theme_match_confidence ?? null;
  const themeRrg: string | null = raw?.theme_rrg_quadrant ?? null;
  const sectorRrg: string | null = raw?.sector_rrg_quadrant ?? null;
  const sectorBeatsSpy: boolean = raw?.sector_beats_spy ?? false;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.6)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-1)", border: "1px solid var(--gold)", borderRadius: 14,
          padding: "1.25rem", width: "100%", maxWidth: 900, maxHeight: "90vh",
          overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--gold)" }}>{row.ticker}</span>
            <VerdictBadge verdict={row.verdict} />
            {row.conviction && <span className="badge badge-neutral">{row.conviction}</span>}
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-soft)",
              borderRadius: 8, color: "var(--text-primary)", width: 32, height: 32,
              cursor: "pointer", fontSize: "1rem",
            }}
          >
            ×
          </button>
        </div>

        {justification && <p className="verdict-reasoning" style={{ margin: "0 0 0.75rem" }}>{justification}</p>}

        <div className="stat-grid" style={{ marginTop: 0 }}>
          <div className="stat-tile">
            <div className="stat-label">{t("th_grade")}</div>
            <div className="stat-value">{row.chart_grade ?? "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">A+</div>
            <div className="stat-value">{row.aplus_score != null ? `${row.aplus_score}/9` : "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">{t("market_regime")}</div>
            <div className="stat-value">{row.regime_mode ?? "—"} ({row.regime_score ?? "—"}/4)</div>
          </div>
        </div>

        {(row.sector || theme) && (
          <p className="meta-line" style={{ marginTop: "0.75rem" }}>
            {row.sector && <>Sector: {row.sector}{sectorBeatsSpy ? " (beating SPY 4W)" : ""}{sectorRrg ? `, RRG: ${sectorRrg}` : ""}</>}
            {row.sector && theme ? " · " : ""}
            {theme && <>Theme: {theme}{themeConfidence === "approximate" ? " (approx.)" : ""}{themeRrg ? `, RRG: ${themeRrg}` : ""}</>}
          </p>
        )}
        {confluenceSignals.length > 0 && (
          <p className="meta-line">Confluence: {confluenceSignals.join(", ")}</p>
        )}

        <div className="tv-frame" style={{ marginTop: "1rem" }}>
          <span className="tv-sweep" />
          <TradingViewWidget symbol={row.ticker} height={480} config={{ range: "6M" }} />
        </div>
      </div>
    </div>
  );
}
