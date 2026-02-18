import { useEffect, useRef, useMemo } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';

export function EquityChart({ equityCurve }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const chartData = useMemo(() => {
    if (!Array.isArray(equityCurve) || equityCurve.length === 0) return [];
    const out = [];
    for (let i = 0; i < equityCurve.length; i++) {
      const p = equityCurve[i];
      const t = p.time;
      let sec;
      if (typeof t === 'number') sec = t;
      else if (typeof t === 'string') sec = Math.floor(new Date(t).getTime() / 1000);
      else continue;
      if (!Number.isNaN(sec) && p.equity != null) out.push({ time: sec, value: Number(p.equity) });
    }
    out.sort((a, b) => a.time - b.time);
    return out;
  }, [equityCurve]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isDark ? '#111827' : '#ffffff';
    const textColor = isDark ? '#e5e7eb' : '#374151';
    const gridColor = isDark ? '#374151' : '#e5e7eb';

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { color: bgColor }, textColor },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      rightPriceScale: { borderColor: gridColor },
      timeScale: { borderColor: gridColor, timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(LineSeries, { color: '#3fb950', lineWidth: 2 });
    chartRef.current = chart;
    seriesRef.current = series;

    resizeObserverRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect && chartRef.current) {
        chartRef.current.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.unobserve(container);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || !containerRef.current) return;
    if (chartData.length > 0) {
      seriesRef.current.setData(chartData);
      chartRef.current.timeScale().fitContent();
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w > 0 && h > 0) chartRef.current.applyOptions({ width: w, height: h });
    }
  }, [chartData]);

  const hasData = chartData.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 min-h-0 h-full">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Equity Curve
        </h2>
      </div>
      <div className="flex-1 min-h-[200px] relative">
        <div ref={containerRef} className="w-full h-full min-h-[200px]" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 text-sm">
            No equity data yet. Start the bot or wait for updates.
          </div>
        )}
      </div>
    </div>
  );
}
