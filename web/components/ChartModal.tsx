"use client";

import { useEffect } from "react";
import TradingViewWidget from "./TradingViewWidget";

export default function ChartModal({
  ticker,
  tvSymbol,
  onClose,
}: {
  ticker: string;
  tvSymbol: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            {ticker}
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
        <TradingViewWidget symbol={tvSymbol} height={520} config={{ range: "6M" }} />
      </div>
    </div>
  );
}
