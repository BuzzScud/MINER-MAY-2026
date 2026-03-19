import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts';

const API_BASE_URL = '/api/quote/';

const RETRACEMENT_LEVELS = [
  { ratio: 0, label: '0.0' },
  { ratio: 0.5, label: '0.5' },
  { ratio: 1, label: '1.0' },
  { ratio: 1.382, label: '1.382' },
  { ratio: 1.618, label: '1.618' },
  { ratio: 2, label: '2.0' },
  { ratio: 2.382, label: '2.382' },
  { ratio: 2.618, label: '2.618' },
  { ratio: 3, label: '3.0' },
  { ratio: 3.382, label: '3.382' },
  { ratio: 3.618, label: '3.618' },
  { ratio: 4.24, label: '4.24' },
  { ratio: 5.08, label: '5.08' },
  { ratio: 6.86, label: '6.86' },
  { ratio: 11.01, label: '11.01' },
];

const EXTENSION_LEVELS = [
  { ratio: -11.01, label: '-11.01' },
  { ratio: -6.86, label: '-6.86' },
  { ratio: -5.08, label: '-5.08' },
  { ratio: -4.24, label: '-4.24' },
  { ratio: -3.618, label: '-3.618' },
  { ratio: -3.382, label: '-3.382' },
  { ratio: -3, label: '-3.0' },
  { ratio: -2.618, label: '-2.618' },
  { ratio: -2.382, label: '-2.382' },
  { ratio: -2, label: '-2.0' },
  { ratio: -1.618, label: '-1.618' },
  { ratio: -1.382, label: '-1.382' },
  { ratio: -1, label: '-1.0' },
  { ratio: -0.5, label: '-0.5' },
];

const KEY_POSITIVE_LEVELS = [
  { ratio: 0, label: '0.0' },
  { ratio: 1, label: '1.0' },
  { ratio: 1.618, label: '1.618' },
  { ratio: 2.618, label: '2.618' },
  { ratio: 4.24, label: '4.24' },
];

const KEY_NEGATIVE_LEVELS = [
  { ratio: -0.5, label: '-0.5' },
  { ratio: -1, label: '-1.0' },
  { ratio: -1.618, label: '-1.618' },
  { ratio: -2.618, label: '-2.618' },
  { ratio: -4.24, label: '-4.24' },
  { ratio: -5.08, label: '-5.08' },
  { ratio: -6.86, label: '-6.86' },
  { ratio: -11.01, label: '-11.01' },
];

async function fetchMarketData(symbol, period = 'ytd', anchorMode = 'first_day') {
  const url = `${API_BASE_URL}${symbol}?period=${period}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to fetch market data. Please check the symbol and try again.');
  }

  const data = await response.json();

  if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
    throw new Error('No data available for this symbol');
  }

  const result = data.chart.result[0];
  const meta = result.meta;
  const quotes = result.indicators.quote[0];
  const timestamps = result.timestamp;

  let high;
  let low;
  let anchorInfo;

  if (anchorMode === 'first_day') {
    const currentYear = new Date().getFullYear();
    const currentYearCandles = [];
    for (let i = 0; i < timestamps.length; i++) {
      const date = new Date(timestamps[i] * 1000);
      if (date.getFullYear() === currentYear) {
        currentYearCandles.push({
          index: i,
          date,
          timestamp: timestamps[i],
          high: quotes.high[i],
          low: quotes.low[i],
          open: quotes.open[i],
          close: quotes.close[i],
        });
      }
    }

    if (currentYearCandles.length === 0) {
      throw new Error('No data available for current year');
    }

    currentYearCandles.sort((a, b) => a.timestamp - b.timestamp);
    const firstCandle = currentYearCandles[0];

    if (
      firstCandle.high === null ||
      firstCandle.low === null ||
      firstCandle.open === null ||
      firstCandle.close === null
    ) {
      throw new Error('Invalid data for first trading day');
    }

    const isBullish = firstCandle.close > firstCandle.open;
    if (isBullish) {
      high = firstCandle.high;
      low = firstCandle.low;
    } else {
      high = firstCandle.low;
      low = firstCandle.high;
    }

    const firstDayDate = firstCandle.date;
    const candleType = isBullish ? 'BULLISH' : 'BEARISH';
    anchorInfo = `First Trading Day: ${firstDayDate.toLocaleDateString()} (${candleType})`;
  } else {
    const highs = quotes.high.filter((h) => h !== null);
    const lows = quotes.low.filter((l) => l !== null);
    if (highs.length === 0 || lows.length === 0) {
      throw new Error('Insufficient data for this period');
    }
    high = Math.max(...highs);
    low = Math.min(...lows);
    anchorInfo = 'Period High/Low';
  }

  const closes = quotes.close.filter((c) => c !== null);
  const current = closes[closes.length - 1];

  return {
    symbol: meta.symbol,
    current,
    high,
    low,
    currency: meta.currency || 'USD',
    timestamps,
    quotes,
    anchorInfo,
  };
}

function FibStuff({ embedded = false }) {
  const { getItem, setItem } = useStorage();
  const [symbol, setSymbol] = useState('QQQ');
  const [precision, setPrecision] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fibData, setFibData] = useState(null);
  const [fibTab, setFibTab] = useState('positive');
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    Promise.all([
      getItem(STORAGE_KEYS.FIB_SYMBOL),
      getItem(STORAGE_KEYS.FIB_PRECISION),
    ]).then(([s, p]) => {
      if (s && typeof s === 'string' && s.trim()) setSymbol(s.trim().toUpperCase());
      const n = parseInt(p, 10);
      if (n >= 2 && n <= 5) setPrecision(n);
    });
  }, [getItem]);

  useEffect(() => {
    setItem(STORAGE_KEYS.FIB_SYMBOL, symbol).catch(() => {});
  }, [symbol, setItem]);

  useEffect(() => {
    setItem(STORAGE_KEYS.FIB_PRECISION, precision).catch(() => {});
  }, [precision, setItem]);

  const removePriceLines = useCallback(() => {
    if (seriesRef.current && priceLinesRef.current.length > 0) {
      priceLinesRef.current.forEach((line) => {
        try {
          seriesRef.current.removePriceLine(line);
        } catch (e) {
          /* ignore */
        }
      });
      priceLinesRef.current = [];
    }
  }, []);

  const addFibonacciLevelsToChart = useCallback(
    (chartInstance, candlestickSeries, high, low) => {
      removePriceLines();
      if (!chartInstance || !candlestickSeries) return;

      const range = high - low;

      KEY_POSITIVE_LEVELS.forEach((level) => {
        const price = low + range * level.ratio;
        try {
          const line = candlestickSeries.createPriceLine({
            price,
            color: '#3B82F6',
            lineWidth: level.ratio === 0 || level.ratio === 1 ? 2 : 1,
            lineStyle: level.ratio === 0 || level.ratio === 1 ? LineStyle.Solid : LineStyle.Dashed,
            axisLabelVisible: true,
            title: level.label,
          });
          priceLinesRef.current.push(line);
        } catch (e) {
          console.error('Error adding positive level:', e);
        }
      });

      KEY_NEGATIVE_LEVELS.forEach((level) => {
        const price = low + range * level.ratio;
        try {
          const line = candlestickSeries.createPriceLine({
            price,
            color: '#EF4444',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: level.label,
          });
          priceLinesRef.current.push(line);
        } catch (e) {
          console.error('Error adding negative level:', e);
        }
      });

      seriesRef.current = candlestickSeries;
    },
    [removePriceLines]
  );

  const updateChart = useCallback(
    (timestamps, quotes, high, low) => {
      const container = chartContainerRef.current;
      if (!container || !timestamps || !quotes) return;

      const isDark = document.documentElement.classList.contains('dark');
      const bgColor = isDark ? '#111827' : '#ffffff';
      const textColor = isDark ? '#e5e7eb' : '#495057';
      const gridColor = isDark ? '#374151' : '#e0e0e0';

      if (!chartRef.current) {
        const chart = createChart(container, {
          width: container.clientWidth,
          height: container.clientHeight,
          layout: {
            background: { color: bgColor },
            textColor,
          },
          grid: {
            vertLines: { color: gridColor },
            horzLines: { color: gridColor },
          },
          crosshair: { mode: 0 },
          rightPriceScale: { borderColor: gridColor, visible: true },
          timeScale: {
            borderColor: gridColor,
            timeVisible: true,
            secondsVisible: false,
            visible: true,
          },
        });

        const candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#22C55E',
          downColor: '#EF4444',
          borderUpColor: '#22C55E',
          borderDownColor: '#EF4444',
          wickUpColor: '#22C55E',
          wickDownColor: '#EF4444',
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;

        resizeObserverRef.current = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry && chartRef.current) {
            const { width, height } = entry.contentRect;
            chartRef.current.applyOptions({ width, height });
          }
        });
        resizeObserverRef.current.observe(container);
      }

      const chartData = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (
          quotes.open[i] !== null &&
          quotes.high[i] !== null &&
          quotes.low[i] !== null &&
          quotes.close[i] !== null
        ) {
          chartData.push({
            time: timestamps[i],
            open: parseFloat(quotes.open[i]),
            high: parseFloat(quotes.high[i]),
            low: parseFloat(quotes.low[i]),
            close: parseFloat(quotes.close[i]),
          });
        }
      }

      if (chartData.length > 0) {
        seriesRef.current.setData(chartData);
        chartRef.current.timeScale().fitContent();
        addFibonacciLevelsToChart(chartRef.current, seriesRef.current, high, low);
      }
    },
    [addFibonacciLevelsToChart]
  );

  useEffect(() => {
    return () => {
      removePriceLines();
      if (resizeObserverRef.current && chartContainerRef.current) {
        resizeObserverRef.current.unobserve(chartContainerRef.current);
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      seriesRef.current = null;
    };
  }, [removePriceLines]);

  const handleCalculate = async () => {
    const trimmedSymbol = symbol.trim().toUpperCase();
    if (!trimmedSymbol) {
      setError('Please enter a valid symbol');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchMarketData(trimmedSymbol, 'ytd', 'first_day');
      setFibData(data);

      await new Promise((resolve) => setTimeout(resolve, 100));

      if (data.timestamps && data.quotes) {
        updateChart(data.timestamps, data.quotes, data.high, data.low);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch data');
      setFibData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (symbol.trim()) handleCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleCalculate();
  };

  const range = fibData ? fibData.high - fibData.low : 0;
  const rangePercent = fibData && fibData.low > 0 ? ((range / fibData.low) * 100).toFixed(2) : '0';
  const retraceRatio = range !== 0 && fibData ? (fibData.current - fibData.low) / range : null;
  const sentiment = retraceRatio != null
    ? retraceRatio > 0.618
      ? { label: 'Bullish', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' }
      : retraceRatio < 0.382
        ? { label: 'Bearish', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' }
        : { label: 'Neutral', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' }
    : null;

  return (
    <div className={`w-full max-w-[1400px] mx-auto flex flex-col h-full min-h-0 overflow-hidden ${embedded ? '' : 'px-4'}`}>
      {!embedded && (
        <>
          <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2 flex-shrink-0">
            <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="font-medium text-gray-900 dark:text-white">Fib Stuff</span>
          </nav>
          <div className="text-center mb-4 flex-shrink-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
              Fib Stuff
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Fibonacci retracement and extension levels with real-time market data
            </p>
          </div>
        </>
      )}

      {/* Two-column: left panel (controls/data/fib) | right panel (chart) — chart is hero on lg+ */}
      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0 overflow-hidden">
        {/* Left panel: scrollable top + FIB levels flush at bottom */}
        <div className="lg:w-80 flex-shrink-0 lg:flex-shrink-0 flex flex-col min-h-0 order-2 lg:order-1">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 pr-1">
            {/* Controls card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Market Data
              </h2>
              <div className="space-y-2">
                <input
                  id="fib-symbol"
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="Symbol (e.g. AAPL, QQQ)"
                  className="w-full text-xs py-1.5 px-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Precision:</span>
                  <div className="flex gap-0.5 rounded border border-gray-300 dark:border-gray-600 p-0.5 bg-gray-100 dark:bg-gray-700/50">
                    {[2, 3, 4, 5].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPrecision(p)}
                        className={`text-xs font-semibold py-1.5 px-3 rounded-lg transition-all ${
                          precision === p
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCalculate}
                  disabled={loading}
                  className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Calculating...
                    </>
                  ) : (
                    'Calculate'
                  )}
                </button>
              </div>
            </div>

            {/* Current market data */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Current Data
              </h2>
              {error && (
                <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 text-xs rounded">
                  {error}
                </div>
              )}
              {loading && !fibData && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Fetching...</p>
              )}
              {fibData && !error && (
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {fibData.symbol} — {fibData.anchorInfo?.split('(')[0]?.trim() || 'Period H/L'}
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-gray-200 dark:border-gray-600">
                    <span className="text-gray-600 dark:text-gray-400">Current</span>
                    <span className="font-medium text-gray-900 dark:text-white">{fibData.currency} {fibData.current.toFixed(precision)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-gray-200 dark:border-gray-600">
                    <span className="text-gray-600 dark:text-gray-400">High</span>
                    <span className="font-medium text-gray-900 dark:text-white">{fibData.currency} {fibData.high.toFixed(precision)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-gray-200 dark:border-gray-600">
                    <span className="text-gray-600 dark:text-gray-400">Low</span>
                    <span className="font-medium text-gray-900 dark:text-white">{fibData.currency} {fibData.low.toFixed(precision)}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-gray-600 dark:text-gray-400">Range</span>
                    <span className="font-medium text-gray-900 dark:text-white">{fibData.currency} {range.toFixed(precision)} ({rangePercent}%)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sentiment indicator — price vs Fib range (0=low, 1=high) */}
            {fibData && !error && sentiment && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Sentiment Indicator
                </h2>
                <div className={`rounded-lg p-2.5 ${sentiment.bg} border border-gray-200/50 dark:border-gray-600/50`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Price vs range</span>
                    <span className={`text-sm font-semibold ${sentiment.color}`}>{sentiment.label}</span>
                  </div>
                  {retraceRatio != null && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
                      Retracement: {((retraceRatio || 0) * 100).toFixed(1)}% from low (0 = support, 100 = resistance)
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Fibonacci levels — tabbed, fills space between Current Data and bottom (flush with chart) */}
          {fibData && !error && (
            <div className="flex-1 flex flex-col min-h-0 pt-3 pr-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setFibTab('positive')}
                    className={`text-xs py-1.5 px-3 rounded-lg font-medium transition-colors ${fibTab === 'positive' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    Positive
                  </button>
                  <button
                    type="button"
                    onClick={() => setFibTab('negative')}
                    className={`text-xs py-1.5 px-3 rounded-lg font-medium transition-colors ${fibTab === 'negative' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                  >
                    Negative
                  </button>
                </div>
                <div className="p-2 overflow-y-auto flex-1 min-h-0">
                  {fibTab === 'positive' &&
                    RETRACEMENT_LEVELS.map((level) => {
                      const price = fibData.low + range * level.ratio;
                      return (
                        <div
                          key={level.label}
                          className="flex justify-between items-center py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 text-xs"
                        >
                          <span className="font-medium text-sky-500 dark:text-sky-400">{level.label}</span>
                          <span className="font-medium text-gray-900 dark:text-white">{price.toFixed(precision)}</span>
                        </div>
                      );
                    })}
                  {fibTab === 'negative' &&
                    EXTENSION_LEVELS.map((level) => {
                      const price = fibData.low + range * level.ratio;
                      return (
                        <div
                          key={level.label}
                          className="flex justify-between items-center py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 text-xs"
                        >
                          <span className="font-medium text-red-500 dark:text-red-400">{level.label}</span>
                          <span className="font-medium text-gray-900 dark:text-white">{price.toFixed(precision)}</span>
                        </div>
                      );
                    })}
                </div>
                <p className="px-3 py-1.5 text-[10px] text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                  YTD first day anchor. BULLISH: 0=Low, 1=High.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel: price chart — biggest window, full height on lg */}
        <div className="flex-1 min-h-0 flex flex-col order-1 lg:order-2">
          {fibData && !error ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 min-h-0">
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Price Chart — {symbol}
                </h2>
              </div>
              <div className="p-2 flex-1 min-h-[400px] lg:min-h-0">
                <div ref={chartContainerRef} className="w-full h-full" />
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1 min-h-[400px] lg:min-h-0">
              <div className="flex-1 flex items-center justify-center px-3 py-2.5">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                  <p className="text-sm font-medium">Enter a symbol and click Calculate to load the price chart.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FibStuff;
