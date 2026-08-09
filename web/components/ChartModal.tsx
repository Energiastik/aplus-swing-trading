"use client";

import { useEffect, useState } from "react";
import TradingViewWidget from "./TradingViewWidget";
import type { Top10Row } from "@/lib/db";

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  const pct = v * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function fmtNum(v: number | null, digits = 2): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

function fmtNewsDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

type Tab = "chart" | "fundamentals" | "news";

export default function ChartModal({ row, onClose }: { row: Top10Row; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("chart");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const news = row.news ?? [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--gold)",
          borderRadius: 14,
          padding: "1.25rem",
          width: "100%",
          maxWidth: 900,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--gold)" }}>
            {row.ticker}
          </span>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--border-soft)",
              borderRadius: 8,
              color: "var(--text-primary)",
              width: 32,
              height: 32,
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            ×
          </button>
        </div>

        <div className="modal-tabs">
          {([
            ["chart", "График"],
            ["fundamentals", "Фундаментал"],
            ["news", "Новости"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`modal-tab ${tab === key ? "modal-tab-active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "chart" && (
          <TradingViewWidget symbol={row.tv_symbol} height={520} config={{ range: "6M" }} />
        )}

        {tab === "fundamentals" && (
          <div>
            <div className="stat-grid" style={{ marginTop: 0 }}>
              <div className="stat-tile">
                <div className="stat-label">P/E</div>
                <div className="stat-value">{fmtNum(row.pe_ratio, 1)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Forward P/E</div>
                <div className="stat-value">{fmtNum(row.forward_pe, 1)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">EPS</div>
                <div className="stat-value">{fmtNum(row.eps)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Рост EPS</div>
                <div className="stat-value">{fmtPct(row.eps_growth)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Выручка</div>
                <div className="stat-value">{fmtUsd(row.revenue_usd)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Рост выручки</div>
                <div className="stat-value">{fmtPct(row.revenue_growth)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Долг / Капитал</div>
                <div className="stat-value">{fmtNum(row.debt_to_equity)}</div>
              </div>
            </div>
            {row.business_summary ? (
              <p className="verdict-reasoning" style={{ marginTop: "1rem" }}>
                {row.business_summary}
              </p>
            ) : (
              <p className="empty-state">Описание компании недоступно за этот запуск.</p>
            )}
          </div>
        )}

        {tab === "news" && (
          <div>
            {news.length === 0 ? (
              <p className="empty-state">Новости недоступны за этот запуск.</p>
            ) : (
              news.slice(0, 3).map((n, i) => (
                <div key={i} className="news-item">
                  <div className="news-item-header">
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noopener noreferrer">
                        {n.title}
                      </a>
                    ) : (
                      <span>{n.title}</span>
                    )}
                    {n.published_at && (
                      <span className="news-item-date">{fmtNewsDate(n.published_at)}</span>
                    )}
                  </div>
                  {n.summary && <p className="news-item-summary">{n.summary}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
