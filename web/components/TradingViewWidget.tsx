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
  height = 420,
}: {
  symbol: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "Asia/Almaty",
      theme: "dark",
      style: "1",
      locale: "ru",
      backgroundColor: "rgba(10, 22, 40, 1)",
      gridColor: "rgba(255, 255, 255, 0.06)",
      hide_top_toolbar: false,
      hide_legend: false,
      studies: ["MAExp@tv-basicstudies", "MAExp@tv-basicstudies", "Volume@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);
  }, [symbol]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ height, width: "100%" }}
    />
  );
}
