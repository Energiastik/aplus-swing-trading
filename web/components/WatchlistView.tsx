"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
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
  const [rows, setRows] = useState(initialRows);
  const [ticker, setTicker] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [open, setOpen] = useState<WatchlistRow | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const clean = ticker.trim().toUpperCase();
    if (!clean) return;
    setChecking(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: clean }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error === "invalid_ticker" ? t("watchlist_error_invalid") : `${t("watchlist_error_failed")}: ${data.message ?? data.error ?? ""}`);
        return;
      }
      const v = data.verdict;
      setTicker("");

      // This tab only lists WAIT (things worth still watching) -- a BUY/PASS
      // result was already sent to Telegram, so surface it as a one-line
      // confirmation here instead of adding a row the table would then hide.
      if (v.verdict !== "WAIT") {
        setInfo(`${v.ticker}: ${v.verdict} — ${v.reason} (sent to Telegram)`);
        return;
      }
      const newRow: WatchlistRow = {
        id: -Date.now(), // client-only placeholder id until the next real fetch
        chat_id: "", ticker: v.ticker, verdict: v.verdict, reason: v.reason,
        conviction: v.conviction, rr_band: v.rr_band, trigger_type: v.trigger,
        aplus_score: v.aplus_score, regime_score: v.regime_score, regime_mode: v.regime_mode,
        sector: v.sector, price: v.price, entry: v.entry, stop: v.stop, target: v.target, rr: v.rr,
        confluence_count: v.confluence_count, chart_grade: v.chart_grade,
        earnings_trading_days: v.earnings_trading_days, checked_at: new Date().toISOString(),
        raw: v,
      };
      // Re-checking a ticker already on the list replaces it (latest wins),
      // matching getWatchlist()'s DISTINCT ON dedupe server-side.
      setRows((prev) => [newRow, ...prev.filter((r) => r.ticker !== newRow.ticker)]);
    } catch (e) {
      setError(t("watchlist_error_failed"));
    } finally {
      setChecking(false);
    }
  }

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

        <form onSubmit={handleAdd} style={{ display: "flex", gap: "0.6rem", margin: "1rem 0", flexWrap: "wrap" }}>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder={t("watchlist_ticker_placeholder")}
            maxLength={10}
            disabled={checking}
            style={{
              background: "var(--surface-2)", border: "1px solid var(--border-soft)",
              borderRadius: 8, padding: "0.5rem 0.8rem", color: "var(--text-primary)",
              fontFamily: "var(--font-mono)", fontSize: "0.95rem", width: 180,
            }}
          />
          <button
            type="submit"
            disabled={checking || !ticker.trim()}
            style={{
              background: "var(--gold-soft)", border: "1px solid var(--gold)", borderRadius: 8,
              padding: "0.5rem 1rem", color: "var(--gold)", cursor: checking ? "default" : "pointer",
              fontWeight: 600, opacity: checking ? 0.6 : 1,
            }}
          >
            {checking ? t("watchlist_checking") : t("watchlist_add_button")}
          </button>
        </form>
        {error && <p className="meta-line" style={{ color: "var(--status-critical)" }}>{error}</p>}
        {info && <p className="meta-line" style={{ color: "var(--text-secondary)" }}>{info}</p>}

        {dbError ? (
          <p className="empty-state">{t("watchlist_no_db")}</p>
        ) : rows.length === 0 ? (
          <p className="empty-state">{t("watchlist_empty")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("th_ticker")}</th>
                <th>{t("th_verdict")}</th>
                <th>{t("entry")}</th>
                <th>{t("stop")}</th>
                <th>{t("target")}</th>
                <th>R/R</th>
                <th>A+</th>
                <th>{t("th_conviction")}</th>
                <th>{t("th_checked")}</th>
                <th>{t("th_chart")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.ticker}</b>
                  </td>
                  <td>
                    <VerdictBadge verdict={r.verdict} />
                  </td>
                  <td>{r.entry != null ? `$${r.entry.toFixed(2)}` : "—"}</td>
                  <td>{r.stop != null ? `$${r.stop.toFixed(2)}` : "—"}</td>
                  <td>{r.target != null ? `$${r.target.toFixed(2)}` : "—"}</td>
                  <td>{r.rr != null ? r.rr.toFixed(2) : "—"}</td>
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
              ))}
            </tbody>
          </table>
        )}
      </section>
      {open && <WatchlistChartModal row={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
