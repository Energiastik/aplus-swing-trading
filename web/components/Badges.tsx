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

const STAGE_RU: Record<string, string> = {
  Building: "Building — формируется",
  Emerging: "Emerging — набирает силу",
  Leading: "Leading — лидирует",
  Fading: "Fading — затухает",
  Lagging: "Lagging — отстаёт",
  Neutral: "Neutral",
};

export function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return <span className="badge badge-neutral">—</span>;
  const cls =
    stage === "Building" || stage === "Emerging"
      ? "badge-good"
      : stage === "Leading"
      ? "badge-warning"
      : stage === "Fading" || stage === "Lagging"
      ? "badge-critical"
      : "badge-neutral";
  return <span className={`badge ${cls}`}>{STAGE_RU[stage] ?? stage}</span>;
}

export function RegimeModeBadge({ mode }: { mode: string | null }) {
  const RU: Record<string, string> = {
    AGGRESSIVE: "АГРЕССИВНЫЙ",
    CAUTIOUS: "ОСТОРОЖНО",
    NO_TRADE: "БЕЗ СДЕЛОК",
  };
  const cls =
    mode === "AGGRESSIVE" ? "badge-good" : mode === "CAUTIOUS" ? "badge-warning" : "badge-critical";
  return <span className={`badge ${cls}`}>{(mode && RU[mode]) ?? mode ?? "—"}</span>;
}
