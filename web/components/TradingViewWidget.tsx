"use client";

import { useEffect, useRef } from "react";

/**
 * Real TradingView "Advanced Real-Time Chart" embed widget -- their official,
 * free, no-signup embed (https://www.tradingview.com/widget/advanced-chart/).
 * This only works because this page is a plain Vercel-hosted Next.js app with
 * no CSP restriction; the same approach is impossible inside a claude.ai
 * Artifact, which blocks all external-host script loads outright.
 *
 * Each instance gets its own container id and injects its own copy of the
 * embed script -- TradingView's widget is designed to be used this way
 * (independent per-container), so multiple charts on one page don't collide.
 *
 * Known limits of this free embed (verified empirically, not documented
 * anywhere public): intraday `interval` caps at "120" (2h) -- "240"/"4H"/"180"
 * all silently snap back to 2h instead of erroring, so a true 4H chart isn't
 * achievable with this widget. `interval` + `range` together also only work
 * reliably if `interval` is left at daily-or-coarser; for intraday intervals
 * set both explicitly as done here.
 *
 * hide_side_toolbar defaults to false (shown): confirmed via a standalone
 * render that this reveals TradingView's real left-edge drawing tools panel
 * (trend line, horizontal line, and more below the fold) -- it's the actual
 * drawing toolbar, not just decoration. Pass hide_side_toolbar: true on
 * narrow/compact instances (e.g. the market-overview tiles) where that
 * ~32px-wide panel would crowd an already-tight chart.
 */
export interface TVConfigOverrides {
  interval?: string;
  range?: string;
  studies?: unknown[];
  compareSymbols?: { symbol: string; position?: string }[];
  percentage?: boolean;
  withdateranges?: boolean;
  hide_top_toolbar?: boolean;
  hide_side_toolbar?: boolean;
  hide_legend?: boolean;
}

export default function TradingViewWidget({
  symbol,
  height = 540,
  config,
}: {
  symbol: string;
  height?: number;
  config?: TVConfigOverrides;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const configKey = JSON.stringify(config ?? {});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    // TradingView's embed script targets this inner div directly and sizes
    // its iframe off of *it*, not the outer container -- without an explicit
    // height here it collapses to auto (effectively a small default) no
    // matter how tall the outer container is, silently ignoring "autosize".
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      range: "6M",
      timezone: "Asia/Almaty",
      theme: "dark",
      style: "1",
      locale: "ru",
      backgroundColor: "rgba(10, 22, 40, 1)",
      gridColor: "rgba(255, 255, 255, 0.06)",
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      studies: ["MAExp@tv-basicstudies", "Volume@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
      ...config,
    });
    container.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, configKey]);

  // TradingView's script restructures whatever's inside .tradingview-widget-container
  // once it mounts (it does not respect an inline height left on that element) --
  // so the actual height is enforced on this plain outer div instead, which their
  // script has no reason to touch.
  return (
    <div style={{ height, width: "100%" }}>
      <div
        className="tradingview-widget-container"
        ref={containerRef}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
