import { useEffect, useRef, useCallback, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { toChartBar, dedupBars, getCandleCountdown, CANDLE_DURATIONS } from '../utils/formatters';
import { fmtPrice } from '../utils/formatters';

const CANDLESTICK_OPTIONS = {
  upColor: '#3fb950',
  downColor: '#f85149',
  borderUpColor: '#3fb950',
  borderDownColor: '#f85149',
  wickUpColor: '#3fb950',
  wickDownColor: '#f85149',
  lastValueVisible: false,
  priceLineVisible: false,
};

export function ChartPanel({
  symbols,
  activeChartSymbol,
  setActiveChartSymbol,
  bars,
  prices,
  chartInterval,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const [countdown, setCountdown] = useState(() => getCandleCountdown(chartInterval));

  const chartBars = bars[activeChartSymbol];
  const chartData = Array.isArray(chartBars)
    ? dedupBars(chartBars.map(toChartBar).filter(Boolean))
    : [];

  useEffect(() => {
    const duration = CANDLE_DURATIONS[chartInterval];
    if (!duration) return;
    const interval = setInterval(() => setCountdown(getCandleCountdown(chartInterval)), 1000);
    return () => clearInterval(interval);
  }, [chartInterval]);

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
      rightPriceScale: { borderColor: gridColor, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderColor: gridColor,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, CANDLESTICK_OPTIONS);
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
    if (!seriesRef.current || !chartRef.current) return;
    if (chartData.length > 0) {
      seriesRef.current.setData(chartData);
      chartRef.current.timeScale().fitContent();
    }
  }, [activeChartSymbol, chartData]);

  const currentPrice = prices[activeChartSymbol];
  const hasCountdown = CANDLE_DURATIONS[chartInterval];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {symbols.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => setActiveChartSymbol(sym)}
              className={`px-2.5 py-1 rounded text-sm font-medium transition-colors ${
                activeChartSymbol === sym
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {currentPrice != null && (
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {activeChartSymbol} {fmtPrice(currentPrice)}
            </span>
          )}
          {hasCountdown && countdown.countdownStr && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Next candle: {countdown.countdownStr}
            </span>
          )}
        </div>
      </div>
      <div className="relative flex-1 min-h-[300px]">
        <div ref={containerRef} className="w-full h-full" />
        {hasCountdown && countdown.countdownStr && (
          <div
            className="absolute top-2 right-2 px-2 py-1 rounded bg-gray-900/80 text-white text-xs font-mono"
            style={{ left: '50%', transform: 'translateX(-50%)', top: 8 }}
          >
            <div className="flex items-center gap-2">
              <span>{countdown.countdownStr}</span>
              <div className="w-16 h-1 bg-gray-700 rounded overflow-hidden">
                <div
                  className="h-full bg-sky-500"
                  style={{ width: `${(1 - countdown.progress) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
