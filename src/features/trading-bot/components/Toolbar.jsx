import { useState, useEffect } from 'react';
import * as api from '../api/tradingBotApi';
import { getCandleCountdown, CANDLE_DURATIONS } from '../utils/formatters';

const TIMEFRAMES = ['15m', '30m', '1h', '4h', '1d'];
const FEED_PROVIDERS = [
  { id: 'yahoo', label: 'Yahoo' },
  { id: 'finnhub', label: 'Finnhub' },
  { id: 'massive', label: 'Massive' },
];

export function Toolbar({
  chartInterval,
  setChartInterval,
  feedProvider,
  setFeedProvider,
  symbols,
  refetchState,
  showToast,
}) {
  const [symbolInput, setSymbolInput] = useState('');
  const [timeframeLoading, setTimeframeLoading] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [symbolLoading, setSymbolLoading] = useState(false);
  const [countdown, setCountdown] = useState(() =>
    CANDLE_DURATIONS[chartInterval] ? getCandleCountdown(chartInterval) : { countdownStr: '', progress: 0 }
  );

  useEffect(() => {
    if (!CANDLE_DURATIONS[chartInterval]) return;
    const interval = setInterval(() => setCountdown(getCandleCountdown(chartInterval)), 1000);
    return () => clearInterval(interval);
  }, [chartInterval]);

  const handleTimeframe = async (tf) => {
    if (tf === chartInterval) return;
    setTimeframeLoading(true);
    try {
      const data = await api.setTimeframe(tf);
      if (data?.ok) {
        setChartInterval(tf);
        if (data.bars && refetchState) refetchState();
      } else showToast(data?.error || 'Failed to set timeframe', true);
    } catch (err) {
      showToast(err?.data?.error || err?.message || 'Failed to set timeframe', true);
    } finally {
      setTimeframeLoading(false);
    }
  };

  const handleFeed = async (provider) => {
    if (provider === feedProvider) return;
    setFeedLoading(true);
    try {
      const data = await api.setFeed(provider);
      if (data?.ok) {
        setFeedProvider(provider);
        if (data.bars && refetchState) refetchState();
      } else showToast(data?.error || 'Failed to set feed', true);
    } catch (err) {
      showToast(err?.data?.error || err?.message || 'Failed to set feed', true);
    } finally {
      setFeedLoading(false);
    }
  };

  const handleAddSymbol = async (e) => {
    e?.preventDefault();
    const sym = symbolInput.trim().toUpperCase();
    if (!sym) return;
    if (symbols.includes(sym)) {
      showToast('Symbol already added', true);
      return;
    }
    setSymbolLoading(true);
    try {
      const data = await api.symbolsAction('add', sym);
      if (data?.ok) {
        setSymbolInput('');
        refetchState?.();
      } else showToast(data?.message || data?.error || 'Add failed', true);
    } catch (err) {
      showToast(err?.data?.error || err?.message || 'Add symbol failed', true);
    } finally {
      setSymbolLoading(false);
    }
  };

  const handleRemoveSymbol = async (sym) => {
    if (symbols.length <= 1) {
      showToast('Keep at least one symbol', true);
      return;
    }
    setSymbolLoading(true);
    try {
      const data = await api.symbolsAction('remove', sym);
      if (data?.ok) refetchState?.();
      else showToast(data?.message || data?.error || 'Remove failed', true);
    } catch (err) {
      showToast(err?.data?.error || err?.message || 'Remove symbol failed', true);
    } finally {
      setSymbolLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 py-2 px-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex-shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Timeframe</span>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            disabled={timeframeLoading}
            onClick={() => handleTimeframe(tf)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
              chartInterval === tf
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Feed</span>
        {FEED_PROVIDERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={feedLoading}
            onClick={() => handleFeed(id)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
              feedProvider === id
                ? 'bg-sky-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {CANDLE_DURATIONS[chartInterval] && (
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span>Next candle: {countdown.countdownStr}</span>
          <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <div
              className="h-full bg-sky-500"
              style={{ width: `${(1 - countdown.progress) * 100}%` }}
            />
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <form onSubmit={handleAddSymbol} className="flex gap-1">
          <input
            type="text"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            placeholder="Add symbol"
            className="w-28 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={symbolLoading || !symbolInput.trim()}
            className="px-2 py-1 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </form>
        {symbols.map((sym) => (
          <span
            key={sym}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs"
          >
            {sym}
            <button
              type="button"
              disabled={symbols.length <= 1 || symbolLoading}
              onClick={() => handleRemoveSymbol(sym)}
              className="text-gray-500 hover:text-red-600 disabled:opacity-50"
              aria-label={`Remove ${sym}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
