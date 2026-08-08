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
 */
export default function TradingViewWidget({
  symbol,
  height = 540,
}: {
  symbol: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

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
      hide_legend: false,
      studies: ["MAExp@tv-basicstudies", "Volume@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);
  }, [symbol]);

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
