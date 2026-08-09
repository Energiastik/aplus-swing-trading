export function StageHeader({ n, title, subtitle }: { n: number; title: string; subtitle?: string }) {
  return (
    <div className="stage-header">
      <div className="stage-badge">{n}</div>
      <div>
        <div className="stage-title">{title}</div>
        {subtitle && <div className="stage-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}

export function StageConnector() {
  return (
    <div className="stage-connector" aria-hidden="true">
      <svg width="28" height="40" viewBox="0 0 28 40" fill="none">
        <path d="M14 0 V28" stroke="var(--gold)" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M4 22 L14 34 L24 22" stroke="var(--gold)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function FunnelStageWrap({
  n,
  title,
  subtitle,
  width,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  width: string;
  children: React.ReactNode;
}) {
  return (
    <div className="funnel-stage" style={{ maxWidth: width, marginLeft: "auto", marginRight: "auto" }}>
      <StageHeader n={n} title={title} subtitle={subtitle} />
      {children}
    </div>
  );
}
