"use client";

import { useLanguage, pickText, type DictKey } from "@/lib/i18n";
import type { RunData } from "@/lib/db";
import { RegimeModeBadge } from "@/components/Badges";
import TradingViewWidget from "@/components/TradingViewWidget";
import MarketOverview from "@/components/MarketOverview";
import SectorComparison from "@/components/SectorComparison";
import Top10Table from "@/components/Top10Table";
import ThemeGrid from "@/components/ThemeGrid";
import RRGChart from "@/components/RRGChart";
import LogoutButton from "@/components/LogoutButton";
import LangToggle from "@/components/LangToggle";
import { StageHeader, StageConnector } from "@/components/FunnelStage";
import { RadarAccent, SonarAccent, OrbitAccent, ScanAccent, LockAccent } from "@/components/Accents";

// Maps the exact English check-name strings agent/market_regime.py writes
// into runs.regime_checks (JSONB, not itself translated) to a dictionary
// key -- same lookup-map pattern as Badges.tsx's STAGE_KEY/REGIME_KEY.
// regime_check_qqq_high covers older rows from before the breadth check
// replaced it; unmatched labels still render as-is rather than disappear.
const REGIME_CHECK_KEY: Record<string, DictKey> = {
  "SPY > EMA200": "regime_check_spy_ema200",
  "Breadth: RSP keeping pace with SPY (20d)": "regime_check_breadth",
  "VIX < 20": "regime_check_vix",
  "SPY up on week": "regime_check_spy_week",
  "QQQ 4-week high (last 5d)": "regime_check_qqq_high",
};

function fmtDate(iso: string, lang: "ru" | "en") {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(lang === "en" ? "en-US" : "ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Dashboard({
  run,
  dbError,
  sessionLabel,
}: {
  run: RunData | null;
  dbError: boolean;
  sessionLabel: string | null;
}) {
  const { lang, t } = useLanguage();

  const sessionBar = (
    <div className="session-bar">
      <LangToggle />
      {sessionLabel}
      <LogoutButton />
    </div>
  );

  if (dbError) {
    return (
      <main className="container">
        {sessionBar}
        <div className="panel">
          <h2>{t("db_unavailable_title")}</h2>
          <p className="meta-line">{t("db_unavailable_body")}</p>
        </div>
      </main>
    );
  }

  if (!run) {
    return (
      <main className="container">
        {sessionBar}
        <h1>A+ Swing Trading</h1>
        <div className="panel">
          <p className="empty-state">{t("no_runs_yet")}</p>
        </div>
      </main>
    );
  }

  const checks = Object.entries(run.regime_checks || {});
  const sectorHighlights = pickText(lang, run.sector_highlights, run.sector_highlights_en);
  const footerNote = pickText(lang, run.footer_note, run.footer_note_en);
  const vixNote = pickText(lang, run.vix_note, run.vix_note_en);

  return (
    <main className="container">
      {sessionBar}
      <h1>A+ Swing Trading</h1>
      <p className="meta-line">
        {t("scan_for")} {fmtDate(run.date, lang)} · {t("updated")}{" "}
        {new Date(run.created_at).toLocaleString(lang === "en" ? "en-US" : "ru-RU")}
      </p>

      <div className="disclaimer-banner">{t("disclaimer")}</div>

      {(run.macro || (run.geopolitical && run.geopolitical.length > 0)) && (
        <section className="panel">
          <h2>
            <SonarAccent />
            {t("macro_geo_title")}
          </h2>
          {run.macro?.available ? (
            <div className="stat-grid">
              <div className="stat-tile">
                <div className="stat-label">{t("inflation_cpi")}</div>
                <div className="stat-value">{run.macro.inflation_cpi_yoy_pct?.actual ?? "—"}%</div>
                {run.macro.inflation_cpi_yoy_pct?.previous != null && (
                  <div className="meta-line">
                    {t("previous_short")} {run.macro.inflation_cpi_yoy_pct.previous}%
                  </div>
                )}
              </div>
              <div className="stat-tile">
                <div className="stat-label">{t("fed_funds_rate")}</div>
                <div className="stat-value">{run.macro.fed_funds_rate_pct?.actual ?? "—"}%</div>
                {run.macro.fed_funds_rate_pct?.previous != null && (
                  <div className="meta-line">
                    {t("previous_short")} {run.macro.fed_funds_rate_pct.previous}%
                  </div>
                )}
              </div>
              <div className="stat-tile">
                <div className="stat-label">{t("nfp")}</div>
                <div className="stat-value">
                  {run.macro.nonfarm_payrolls_change_k?.actual != null
                    ? `${run.macro.nonfarm_payrolls_change_k.actual > 0 ? "+" : ""}${run.macro.nonfarm_payrolls_change_k.actual}K`
                    : "—"}
                </div>
                {run.macro.nonfarm_payrolls_change_k?.previous != null && (
                  <div className="meta-line">
                    {t("previous_short")} {run.macro.nonfarm_payrolls_change_k.previous > 0 ? "+" : ""}
                    {run.macro.nonfarm_payrolls_change_k.previous}K
                  </div>
                )}
              </div>
              <div className="stat-tile">
                <div className="stat-label">{t("jobless_claims")}</div>
                <div className="stat-value">{run.macro.jobless_claims_k?.actual ?? "—"}K</div>
                {run.macro.jobless_claims_k?.previous != null && (
                  <div className="meta-line">
                    {t("previous_short")} {run.macro.jobless_claims_k.previous}K
                  </div>
                )}
              </div>
              <div className="stat-tile">
                <div className="stat-label">{t("gdp_growth")}</div>
                <div className="stat-value">{run.macro.gdp_growth_pct?.actual ?? "—"}%</div>
                {run.macro.gdp_growth_pct?.previous != null && (
                  <div className="meta-line">
                    {t("previous_short")} {run.macro.gdp_growth_pct.previous}%
                  </div>
                )}
              </div>
            </div>
          ) : (
            run.macro && (
              <p className="meta-line">
                {t("macro_unavailable")}
                {run.macro.error ? ` (${run.macro.error})` : ""}.
              </p>
            )
          )}
          {run.macro?.available && (
            <p className="meta-line" style={{ marginTop: "0.5rem" }}>
              {run.macro.source === "fred" ? t("source_fred") : t("source_web_search")}
            </p>
          )}
          {run.geopolitical && run.geopolitical.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              {run.geopolitical.map((g, i) => (
                <div key={i} style={{ marginBottom: "0.75rem" }}>
                  <b>{pickText(lang, g.headline, g.headline_en)}</b>
                  {g.summary && <p className="meta-line">{pickText(lang, g.summary, g.summary_en)}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <StageHeader n={1} title={t("stage1_title")} subtitle={t("stage1_subtitle")} />
      {/* Regime / market health */}
      <section className="panel">
        <h2>
          <RadarAccent />
          {t("market_regime")} <RegimeModeBadge mode={run.regime_mode} />
        </h2>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-label">{t("regime_score")}</div>
            <div className="stat-value">{run.regime_score ?? "—"}/4</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">VIX</div>
            <div className="stat-value">{run.vix?.toFixed(1) ?? "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">{t("size_multiplier")}</div>
            <div className="stat-value">×{run.size_multiplier ?? "—"}</div>
          </div>
        </div>
        {vixNote && (
          <p className="meta-line" style={{ marginTop: "0.75rem" }}>
            {vixNote}
          </p>
        )}
        <div className="check-row">
          {checks.map(([label, ok]) => {
            const key = REGIME_CHECK_KEY[label];
            return (
              <span key={label} className={ok ? "check-ok" : "check-fail"}>
                {key ? t(key) : label}
              </span>
            );
          })}
        </div>
      </section>

      <div className="stage-connector-wrap">
        <StageConnector />
      </div>

      <StageHeader n={2} title={t("stage2_title")} subtitle={t("stage2_subtitle")} />
      <MarketOverview />

      <div className="stage-connector-wrap">
        <StageConnector />
      </div>

      <StageHeader n={3} title={t("stage3_title")} subtitle={t("stage3_subtitle")} />
      {/* Sector rotation */}
      <section className="panel">
        <h2>
          <OrbitAccent />
          {t("sector_rotation")}
        </h2>
        {run.sector_table.length === 0 ? (
          <p className="empty-state">{t("no_sector_data")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("th_rank")}</th>
                <th>{t("th_etf")}</th>
                <th>{t("th_sector")}</th>
                <th>{t("th_w1")}</th>
                <th>{t("th_w4")}</th>
                <th>{t("th_w12")}</th>
                <th>{t("th_score")}</th>
              </tr>
            </thead>
            <tbody>
              {run.sector_table.map((s) => (
                <tr key={s.etf}>
                  <td>{s.rank}</td>
                  <td>
                    <b>{s.etf}</b>
                  </td>
                  <td>{s.sector}</td>
                  <td>{s.w1}</td>
                  <td>{s.w4}</td>
                  <td>{s.w12}</td>
                  <td>{s.weighted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sectorHighlights && (
          <p className="meta-line" style={{ marginTop: "1rem" }}>
            {sectorHighlights}
          </p>
        )}
      </section>

      {/* Relative Rotation Graph */}
      <section className="panel">
        <h2>
          <OrbitAccent />
          {t("rrg_title")}
        </h2>
        <RRGChart points={run.rrg_points} />
      </section>

      <SectorComparison />

      {/* Theme / sub-theme rotation */}
      <section className="panel">
        <h2>
          <OrbitAccent />
          {t("themes_title")}
        </h2>
        <p className="meta-line" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {t("themes_note")}
        </p>
        <ThemeGrid rows={run.theme_rotation} />
      </section>

      <div className="stage-connector-wrap">
        <StageConnector />
      </div>

      <StageHeader n={4} title={t("stage4_title")} subtitle={t("stage4_subtitle")} />
      {/* All candidates */}
      <section className="panel">
        <h2>
          <ScanAccent />
          {t("all_candidates")} ({run.all_candidates.length})
        </h2>
        {run.all_candidates.length === 0 ? (
          <p className="empty-state">{t("no_candidates")}</p>
        ) : (
          <div>
            {run.all_candidates.map((c) => (
              <span className="candidate-chip" key={c.ticker}>
                <b>{c.ticker}</b>
                {c.sector && <span className="sector"> · {c.sector}</span>}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Top 10 */}
      <section className="panel">
        <h2>{t("top10_title")}</h2>
        <Top10Table rows={run.top10} />
      </section>

      {/* Verdicts */}
      <section className="panel">
        <h2>
          <LockAccent />
          {t("verdicts_title")}
        </h2>
        {run.verdicts.length === 0 ? (
          <p className="empty-state">{t("no_verdicts")}</p>
        ) : (
          run.verdicts.map((v) => (
            <div className="verdict-card" key={v.ticker}>
              <div className="verdict-header">
                <span className="verdict-ticker">{v.ticker}</span>
                <div className="verdict-metrics">
                  <span>
                    {t("entry")} <b>{v.entry}</b>
                  </span>
                  <span>
                    {t("stop")} <b>{v.stop}</b>
                  </span>
                  <span>
                    {t("target")} <b>{v.target}</b>
                  </span>
                  <span>
                    R/R <b>{v.rr}</b>
                  </span>
                  <span>
                    {t("gain")} <b>{v.expected_gain_pct}</b>
                  </span>
                </div>
              </div>
              <div className="tv-frame">
                <span className="tv-sweep" />
                <TradingViewWidget symbol={v.tv_symbol} />
              </div>
              {pickText(lang, v.reasoning, v.reasoning_en) && (
                <p className="verdict-reasoning">{pickText(lang, v.reasoning, v.reasoning_en)}</p>
              )}
            </div>
          ))
        )}
      </section>

      {footerNote && <p className="footer-note">{footerNote}</p>}
    </main>
  );
}
