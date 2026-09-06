// Small live motifs tied to what each section actually does (see globals.css
// for the animation defs). Purely decorative -- an <h2> reads fine without
// one, this just gives it a bit of character.

export function RadarAccent() {
  return <span className="accent-radar" aria-hidden="true" />;
}

export function PulseAccent() {
  return <span className="accent-pulse" aria-hidden="true" />;
}

export function SonarAccent() {
  return (
    <span className="accent-sonar" aria-hidden="true">
      <span className="ring" />
      <span className="ring d2" />
      <span className="core" />
    </span>
  );
}

export function OrbitAccent() {
  return (
    <span className="accent-orbit" aria-hidden="true">
      <span className="path" />
      <span className="node" />
      <span className="hub" />
    </span>
  );
}

export function ScanAccent() {
  return <span className="accent-scan" aria-hidden="true" />;
}

export function LockAccent() {
  return (
    <span className="accent-lock" aria-hidden="true">
      <i className="tl" />
      <i className="tr" />
      <i className="bl" />
      <i className="br" />
    </span>
  );
}
