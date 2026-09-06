"use client";

import { useLanguage, type DictKey } from "@/lib/i18n";

export function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="badge badge-neutral">—</span>;
  const cls =
    grade === "A"
      ? "badge-good"
      : grade === "B"
      ? "badge-good"
      : grade === "C"
      ? "badge-warning"
      : grade === "F"
      ? "badge-critical"
      : "badge-neutral";
  return <span className={`badge ${cls}`}>{grade}</span>;
}

const STAGE_KEY: Record<string, DictKey> = {
  Building: "stage_building",
  Emerging: "stage_emerging",
  Leading: "stage_leading",
  Fading: "stage_fading",
  Lagging: "stage_lagging",
  Neutral: "stage_neutral",
};

export function StageBadge({ stage }: { stage: string | null }) {
  const { t } = useLanguage();
  if (!stage) return <span className="badge badge-neutral">—</span>;
  const cls =
    stage === "Building" || stage === "Emerging"
      ? "badge-good"
      : stage === "Leading"
      ? "badge-warning"
      : stage === "Fading" || stage === "Lagging"
      ? "badge-critical"
      : "badge-neutral";
  const key = STAGE_KEY[stage];
  return <span className={`badge ${cls}`}>{key ? t(key) : stage}</span>;
}

const REGIME_KEY: Record<string, DictKey> = {
  AGGRESSIVE: "regime_aggressive",
  CAUTIOUS: "regime_cautious",
  NO_TRADE: "regime_no_trade",
};

export function RegimeModeBadge({ mode }: { mode: string | null }) {
  const { t } = useLanguage();
  const cls =
    mode === "AGGRESSIVE" ? "badge-good" : mode === "CAUTIOUS" ? "badge-warning" : "badge-critical";
  const key = mode ? REGIME_KEY[mode] : undefined;
  return <span className={`badge ${cls}`}>{key ? t(key) : mode ?? "—"}</span>;
}
