"use client";

import { useEffect, useMemo, useState } from "react";
import type { RRGPoint } from "@/lib/db";
import { useLanguage } from "@/lib/i18n";

// Quadrant tints -- reuse the existing status/sequential palette tokens so
// this reads as part of the same design system, not a bolted-on chart lib.
const QUADRANT_FILL = {
  improving: "rgba(57, 135, 229, 0.09)",
  leading: "rgba(12, 163, 12, 0.09)",
  lagging: "rgba(230, 103, 103, 0.09)",
  weakening: "rgba(250, 178, 25, 0.09)",
};

// Categorical palette for up to 25 series -- avoids the brand gold (reserved
// for accents/verdicts elsewhere) and the fixed status colors (good/warning/
// critical already mean something specific in this dashboard).
const PALETTE = [
  "#4fc3f7", "#f06292", "#81c784", "#ffb74d", "#ba68c8", "#4db6ac",
  "#e57373", "#7986cb", "#dce775", "#a1887f", "#4dd0e1", "#f8bbd0",
  "#aed581", "#ff8a65", "#9575cd", "#64b5f6", "#fff176", "#90a4ae",
  "#ec407a", "#26c6da", "#d4e157", "#ff8a80", "#7e57c2", "#26a69a", "#c0ca33",
];

const W = 720;
const H = 520;
const M = 44;
// Trailing points shown per series at any scrub position. Daily data is
// noisier and needs more points to read as a tail; weekly stays compact.
const WINDOW_LEN = { W: 8, D: 15 } as const;
const TRANSITION = "cx 0.35s ease, cy 0.35s ease, x1 0.35s ease, y1 0.35s ease, x2 0.35s ease, y2 0.35s ease, opacity 0.25s ease";

type Period = "W" | "D";

interface SeriesInfo {
  name: string;
  kind: string | null;
  etf: string;
  color: string;
  points: RRGPoint[]; // this series' own points (matching the active period), sorted by date
}

// Names whose MOST RECENT point (within the given point set) sits in the
// improving or leading quadrant (rs_momentum >= 100, i.e. still
// accelerating) -- these are what a swing trader actually wants to see by
// default. Lagging/weakening names are real data, just visual noise until
// the user asks for them.
function defaultVisibleNames(points: RRGPoint[]): Set<string> {
  const latest = new Map<string, RRGPoint>();
  for (const p of points) {
    if (p.rs_ratio == null || p.rs_momentum == null) continue;
    const cur = latest.get(p.name);
    if (!cur || p.week_date > cur.week_date) latest.set(p.name, p);
  }
  const visible = new Set<string>();
  for (const [name, p] of latest) {
    if ((p.rs_momentum as number) >= 100) visible.add(name);
  }
  return visible;
}

export default function RRGChart({ points }: { points: RRGPoint[] }) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState<Period>("W");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [windowEnd, setWindowEnd] = useState<number | null>(null); // null = latest

  const periodPoints = useMemo(
    () => points.filter((p) => ((p.period as Period | undefined) ?? "W") === period),
    [points, period]
  );

  const defaultHidden = useMemo(() => {
    const visible = defaultVisibleNames(periodPoints);
    const h = new Set<string>();
    for (const p of periodPoints) if (!visible.has(p.name)) h.add(p.name);
    return h;
  }, [periodPoints]);

  const [hidden, setHidden] = useState<Set<string>>(defaultHidden);

  // Switching Daily/Weekly swaps the whole dataset (different quadrant
  // placement, different names may qualify) -- re-apply the "improving/
  // leading only" default for the newly selected period rather than keeping
  // a hidden-set computed for the other one.
  useEffect(() => {
    setHidden(new Set(defaultHidden));
    setWindowEnd(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const allSeries: SeriesInfo[] = useMemo(() => {
    const byName = new Map<string, RRGPoint[]>();
    for (const p of periodPoints) {
      if (p.rs_ratio == null || p.rs_momentum == null) continue;
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name)!.push(p);
    }
    const names = Array.from(byName.keys()).sort((a, b) => a.localeCompare(b));
    return names.map((name, i) => {
      const pts = byName.get(name)!.slice().sort((a, b) => (a.week_date < b.week_date ? -1 : 1));
      return { name, kind: pts[pts.length - 1].kind, etf: pts[pts.length - 1].etf, color: PALETTE[i % PALETTE.length], points: pts };
    });
  }, [periodPoints]);

  // Global time axis: every distinct date seen across the active series set,
  // so the slider scrubs one shared calendar rather than per-series indices.
  const allDates = useMemo(() => {
    const s = new Set<string>();
    for (const series of allSeries) for (const p of series.points) s.add(p.week_date);
    return Array.from(s).sort();
  }, [allSeries]);

  if (allSeries.length === 0 || allDates.length === 0) {
    return <p className="empty-state">{t("rrg_unavailable")}</p>;
  }

  const endIdx = windowEnd ?? allDates.length - 1;
  const asOfDate = allDates[endIdx];
  const windowLen = WINDOW_LEN[period];

  function kindLabel(kind: string | null): string {
    return kind === "Theme" ? t("kind_theme") : t("kind_sector");
  }

  function seriesTitle(s: SeriesInfo): string {
    return `${s.name} (${kindLabel(s.kind)}) — ${s.etf}`;
  }

  // Axis range is fixed to the FULL dataset (not just what's currently
  // visible) so the frame doesn't jump around as you scrub or hide series --
  // only the tails themselves move.
  const allX = allSeries.flatMap((s) => s.points.map((p) => p.rs_ratio as number));
  const allY = allSeries.flatMap((s) => s.points.map((p) => p.rs_momentum as number));
  const pad = 0.6;
  const xMin = Math.min(100 - pad, ...allX) - pad;
  const xMax = Math.max(100 + pad, ...allX) + pad;
  const yMin = Math.min(100 - pad, ...allY) - pad;
  const yMax = Math.max(100 + pad, ...allY) + pad;

  const sx = (x: number) => M + ((x - xMin) / (xMax - xMin)) * (W - 2 * M);
  const sy = (y: number) => H - M - ((y - yMin) / (yMax - yMin)) * (H - 2 * M);
  const midX = sx(100);
  const midY = sy(100);

  const xTicks = niceTicks(xMin, xMax);
  const yTicks = niceTicks(yMin, yMax);

  function toggleHidden(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem", gap: "1rem", flexWrap: "wrap" }}>
        <p className="meta-line" style={{ margin: 0 }}>
          {t("rrg_axes_note")}
        </p>
        <div className="rrg-period-toggle">
          <button
            className={`rrg-period-btn ${period === "W" ? "rrg-period-btn-active" : ""}`}
            aria-pressed={period === "W"}
            onClick={() => setPeriod("W")}
          >
            {t("rrg_period_weekly")}
          </button>
          <button
            className={`rrg-period-btn ${period === "D" ? "rrg-period-btn-active" : ""}`}
            aria-pressed={period === "D"}
            onClick={() => setPeriod("D")}
          >
            {t("rrg_period_daily")}
          </button>
        </div>
      </div>
      <p className="meta-line" style={{ margin: "0 0 0.6rem" }}>
        {t("rrg_default_filter_note")}
      </p>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 600, maxWidth: 820, display: "block" }}>
          <rect x={M} y={M} width={W - 2 * M} height={H - 2 * M} fill="var(--surface-2)" />

          <rect x={M} y={M} width={midX - M} height={midY - M} fill={QUADRANT_FILL.improving} />
          <rect x={midX} y={M} width={W - M - midX} height={midY - M} fill={QUADRANT_FILL.leading} />
          <rect x={M} y={midY} width={midX - M} height={H - M - midY} fill={QUADRANT_FILL.lagging} />
          <rect x={midX} y={midY} width={W - M - midX} height={H - M - midY} fill={QUADRANT_FILL.weakening} />

          {xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={sx(t)} y1={M} x2={sx(t)} y2={H - M} stroke="rgba(255,255,255,0.05)" />
              <text x={sx(t)} y={H - M + 16} fontSize="10" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">
                {t}
              </text>
            </g>
          ))}
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={M} y1={sy(t)} x2={W - M} y2={sy(t)} stroke="rgba(255,255,255,0.05)" />
              <text x={M - 8} y={sy(t) + 3} fontSize="10" textAnchor="end" fill="var(--text-muted)" fontFamily="var(--font-mono)">
                {t}
              </text>
            </g>
          ))}

          <text x={M + 6} y={M + 16} fontSize="10.5" fill="#7fb4f0" fontFamily="var(--font-mono)" letterSpacing="0.05em">
            {t("rrg_quadrant_improving")}
          </text>
          <text x={W - M - 6} y={M + 16} fontSize="10.5" fill="#4ade80" textAnchor="end" fontFamily="var(--font-mono)" letterSpacing="0.05em">
            {t("rrg_quadrant_leading")}
          </text>
          <text x={M + 6} y={H - M - 8} fontSize="10.5" fill="#f87171" fontFamily="var(--font-mono)" letterSpacing="0.05em">
            {t("rrg_quadrant_lagging")}
          </text>
          <text x={W - M - 6} y={H - M - 8} fontSize="10.5" fill="#fbbf24" textAnchor="end" fontFamily="var(--font-mono)" letterSpacing="0.05em">
            {t("rrg_quadrant_weakening")}
          </text>

          <line x1={midX} y1={M} x2={midX} y2={H - M} stroke="rgba(255,255,255,0.16)" strokeDasharray="3 3" />
          <line x1={M} y1={midY} x2={W - M} y2={midY} stroke="rgba(255,255,255,0.16)" strokeDasharray="3 3" />

          {allSeries.map((s) => {
            if (hidden.has(s.name)) return null;
            const dimmed = highlighted !== null && highlighted !== s.name;

            // This series' own points at or before the globally-selected
            // date, most recent last -- its trailing window.
            const upTo = s.points.filter((p) => p.week_date <= asOfDate);
            const windowPts = upTo.slice(Math.max(0, upTo.length - windowLen));
            if (windowPts.length === 0) return null;

            // slot 0 = current/most recent -- keying by slot (not by the
            // underlying data point) keeps each dot's DOM node stable as the
            // window slides, so the CSS transition glides it to its new
            // position instead of popping.
            const slots = windowPts.slice().reverse(); // [current, current-1, ...]

            return (
              <g
                key={s.name}
                opacity={dimmed ? 0.15 : 1}
                onMouseEnter={() => setHighlighted(s.name)}
                onMouseLeave={() => setHighlighted(null)}
                style={{ cursor: "pointer" }}
              >
                <title>{seriesTitle(s)}</title>
                {slots.slice(0, -1).map((p, i) => {
                  const next = slots[i + 1];
                  return (
                    <line
                      key={`${s.name}-seg${i}`}
                      x1={sx(p.rs_ratio as number)}
                      y1={sy(p.rs_momentum as number)}
                      x2={sx(next.rs_ratio as number)}
                      y2={sy(next.rs_momentum as number)}
                      stroke={s.color}
                      strokeWidth={1.6}
                      style={{ transition: TRANSITION }}
                    />
                  );
                })}
                {slots.slice(1).map((p, i) => (
                  <circle
                    key={`${s.name}-slot${i + 1}`}
                    cx={sx(p.rs_ratio as number)}
                    cy={sy(p.rs_momentum as number)}
                    r={2.4}
                    fill={s.color}
                    style={{ transition: TRANSITION }}
                  />
                ))}
                <circle
                  key={`${s.name}-slot0`}
                  cx={sx(slots[0].rs_ratio as number)}
                  cy={sy(slots[0].rs_momentum as number)}
                  r={5}
                  fill={s.color}
                  stroke="var(--page-bg)"
                  strokeWidth={1.5}
                  style={{ transition: TRANSITION }}
                />
                <text
                  x={sx(slots[0].rs_ratio as number) + 7}
                  y={sy(slots[0].rs_momentum as number) + 3.5}
                  fontSize="11"
                  fill={s.color}
                  fontFamily="var(--font-mono)"
                  fontWeight={dimmed ? 400 : 600}
                  style={{ transition: TRANSITION }}
                >
                  {s.etf}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="rrg-slider-row">
        <span className="rrg-slider-label">{period === "D" ? t("rrg_day_label") : t("rrg_week_label")}</span>
        <input
          type="range"
          className="rrg-slider"
          min={0}
          max={allDates.length - 1}
          value={endIdx}
          onChange={(e) => setWindowEnd(Number(e.target.value))}
        />
        <span className="rrg-slider-date">{asOfDate}</span>
        {windowEnd !== null && windowEnd !== allDates.length - 1 && (
          <button className="theme-card-expand" onClick={() => setWindowEnd(null)}>
            {t("rrg_to_current_week")}
          </button>
        )}
      </div>

      <div className="rrg-legend">
        {allSeries.map((s) => {
          const isHidden = hidden.has(s.name);
          return (
            <button
              key={s.name}
              className={`rrg-chip ${isHidden ? "rrg-chip-off" : ""}`}
              onClick={() => toggleHidden(s.name)}
              onMouseEnter={() => setHighlighted(s.name)}
              onMouseLeave={() => setHighlighted(null)}
              title={seriesTitle(s)}
              style={{ borderColor: isHidden ? "var(--border-soft)" : s.color }}
            >
              <span className="rrg-chip-dot" style={{ background: isHidden ? "var(--text-muted)" : s.color }} />
              {s.etf}
            </button>
          );
        })}
        <button className="theme-card-expand" onClick={() => setHidden(new Set(defaultHidden))}>
          {t("rrg_reset_default")}
        </button>
        <button className="theme-card-expand" onClick={() => setHidden(new Set())}>
          {t("rrg_show_all")}
        </button>
        <button className="theme-card-expand" onClick={() => setHidden(new Set(allSeries.map((s) => s.name)))}>
          {t("rrg_hide_all")}
        </button>
      </div>
    </div>
  );
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const range = max - min;
  const rawStep = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max; t += step) {
    ticks.push(Math.round(t * 100) / 100);
  }
  return ticks;
}
