import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Gauge } from './Gauge';

const API_BASE = '/api/sentiment';

const SERVICE_UNAVAILABLE_MSG =
  'Sentiment service unavailable. Run ./scripts/setup-sentiment.sh, then ./scripts/run-dev.sh. See archive/source-projects/SENTIMENT INDICATOR - 2026/README.md for DB setup.';

const API_NOT_RUNNING_MSG =
  'Sentiment API is not running. Run ./scripts/run-dev.sh (or npm run sentiment:api) to start it.';

const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;

function isNetworkOrUnavailableError(error) {
  if (!error || typeof error.message !== 'string') return false;
  const msg = error.message.toLowerCase();
  return (
    msg === 'failed to fetch' ||
    msg.includes('network') ||
    msg.includes('connection') ||
    msg.includes('load failed') ||
    error.name === 'TypeError'
  );
}

class ChartErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[220px] flex items-center justify-center text-gray-500 dark:text-gray-400">
          Chart unavailable
        </div>
      );
    }
    return this.props.children;
  }
}

const defaultOptions = {
  useTimeDecay: false,
  aggregationMode: 'mean',
  includeUncertainty: true,
  usePrimeModular: false,
};

export default function SentimentIndicator({
  asset = 'AAPL',
  provider = 'yfinance',
  options: optionsProp,
}) {
  const safeAsset =
    typeof asset === 'string' && asset.trim()
      ? asset.trim().toUpperCase()
      : 'AAPL';
  const safeProvider =
    typeof provider === 'string' && provider.trim()
      ? provider.trim().toLowerCase()
      : 'yfinance';
  const options =
    optionsProp && typeof optionsProp === 'object'
      ? { ...defaultOptions, ...optionsProp }
      : defaultOptions;

  const [current, setCurrent] = useState(null);
  const [historical, setHistorical] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rateLimitUntil, setRateLimitUntil] = useState(null);
  const [, setCooldownTick] = useState(0);
  useEffect(() => {
    if (rateLimitUntil == null || Date.now() >= rateLimitUntil) return;
    const intervalId = setInterval(() => setCooldownTick((t) => t + 1), 1000);
    return () => clearInterval(intervalId);
  }, [rateLimitUntil]);

  const currentUrl = (() => {
    const path = `${API_BASE}/${encodeURIComponent(safeAsset)}`;
    if (!safeProvider) return path;
    const params = new URLSearchParams();
    params.set('provider', safeProvider);
    params.set('use_time_decay', options.useTimeDecay ? 'true' : 'false');
    params.set('decay_half_life_hours', options.useTimeDecay ? '12' : '12');
    params.set('aggregation_mode', options.aggregationMode || 'mean');
    params.set(
      'include_uncertainty',
      options.includeUncertainty !== false ? 'true' : 'false'
    );
    params.set('use_prime_modular', options.usePrimeModular ? 'true' : 'false');
    return `${path}?${params.toString()}`;
  })();

  const historicalUrl = `${API_BASE}/historical/${encodeURIComponent(safeAsset)}?limit=200`;

  async function getErrorFromResponse(res) {
    const text = await res.text();
    let msg = res.statusText || 'Request failed';
    let hasDetail = false;
    try {
      const body = JSON.parse(text);
      if (body.detail) {
        hasDetail = true;
        msg =
          typeof body.detail === 'string'
            ? body.detail
            : body.detail.join?.(' ') || msg;
      }
    } catch (_) {}
    if (res.status >= 500) {
      if (res.status === 502 || (res.status === 500 && !hasDetail)) {
        msg = API_NOT_RUNNING_MSG;
      } else {
        msg = msg || SERVICE_UNAVAILABLE_MSG;
      }
    }
    return msg;
  }

  const fetchCurrent = async () => {
    try {
      const res = await fetch(currentUrl);
      if (!res.ok) {
        if (res.status === 404) {
          setCurrent(null);
          setError(null);
          setRateLimitUntil(null);
          return;
        }
        if (res.status === 429) {
          setRateLimitUntil(Date.now() + RATE_LIMIT_COOLDOWN_MS);
        }
        const msg = await getErrorFromResponse(res);
        throw new Error(msg);
      }
      const data = await res.json();
      setCurrent(data);
      setError(null);
      setRateLimitUntil(null);
    } catch (e) {
      setError(
        isNetworkOrUnavailableError(e) ? SERVICE_UNAVAILABLE_MSG : e.message
      );
    }
  };

  const fetchHistorical = async () => {
    try {
      const res = await fetch(historicalUrl);
      if (!res.ok) {
        if (res.status === 404) {
          setHistorical([]);
          return;
        }
        const msg = await getErrorFromResponse(res);
        throw new Error(msg);
      }
      const data = await res.json();
      setHistorical(
        (data || []).map((d) => ({
          ...d,
          time: d.window_end,
          score: d.aggregated_score,
        }))
      );
      setError(null);
    } catch (e) {
      setError(
        isNetworkOrUnavailableError(e) ? SERVICE_UNAVAILABLE_MSG : e.message
      );
    }
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    Promise.all([fetchCurrent(), fetchHistorical()]).finally(() =>
      setLoading(false)
    );
  };

  const optionsKey = `${options.useTimeDecay}-${options.aggregationMode}-${options.includeUncertainty}-${options.usePrimeModular}`;
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCurrent(), fetchHistorical()]).finally(() =>
      setLoading(false)
    );
  }, [safeAsset, safeProvider, optionsKey]);

  const isRateLimited = rateLimitUntil != null && Date.now() < rateLimitUntil;
  const retryInSeconds = isRateLimited
    ? Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000))
    : 0;

  if (error) {
    return (
      <section
        aria-label="Sentiment indicator error"
        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 max-w-[720px] mx-auto"
      >
        <h2 className="m-0 mb-3 text-lg font-semibold text-gray-900 dark:text-white">
          {safeAsset} Sentiment
        </h2>
        <p role="alert" className="text-red-500 dark:text-red-400 text-sm m-0">
          Error: {error}
        </p>
        {(error.toLowerCase().includes('internal server error') ||
          error.toLowerCase().includes('database') ||
          error.toLowerCase().includes('unavailable')) && (
          <p className="text-amber-600 dark:text-amber-400 text-xs mt-2 m-0">
            The API may need DB/env setup. Run ./scripts/setup-sentiment.sh and ensure Postgres is running. See archive/source-projects/SENTIMENT INDICATOR - 2026/README.md.
          </p>
        )}
        {(error.toLowerCase().includes('rate limit') || isRateLimited) && (
          <p className="text-amber-600 dark:text-amber-400 text-xs mt-2 m-0">
            Wait about a minute before trying again to respect API limits.
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={loading || isRateLimited}
            className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Retrying…' : isRateLimited ? `Retry in ${retryInSeconds}s` : 'Retry'}
          </button>
        </div>
      </section>
    );
  }

  const showLoadingHint = loading && !current && historical.length === 0;

  const hasUncertainty =
    current &&
    (Number.isFinite(current.score_std) ||
      (Number.isFinite(current.confidence_lower) &&
        Number.isFinite(current.confidence_upper)));
  const uncertaintyLine = hasUncertainty && (
    <p className="text-gray-500 dark:text-gray-400 text-xs m-0 mt-2">
      {Number.isFinite(current.score_std) &&
        `Std: ${Number(current.score_std).toFixed(3)}`}
      {Number.isFinite(current.score_std) &&
        Number.isFinite(current.confidence_lower) &&
        Number.isFinite(current.confidence_upper) &&
        ' · '}
      {Number.isFinite(current.confidence_lower) &&
        Number.isFinite(current.confidence_upper) && (
          <>
            95% CI: [{Number(current.confidence_lower).toFixed(3)},{' '}
            {Number(current.confidence_upper).toFixed(3)}]
          </>
        )}
    </p>
  );

  const metaLine = current && (
    <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-600">
      {uncertaintyLine}
      <p className="text-gray-500 dark:text-gray-400 text-xs m-0 mt-2">
        {current.signal_count} signal{current.signal_count !== 1 ? 's' : ''}
        {' · '}
        Window end:{' '}
        {current.window_end != null
          ? new Date(current.window_end).toLocaleString()
          : '—'}
      </p>
    </div>
  );

  return (
    <section
      aria-label={
        showLoadingHint ? 'Sentiment indicator loading' : `Sentiment for ${safeAsset}`
      }
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 max-w-[720px] mx-auto"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <h2 className="m-0 text-lg font-semibold text-gray-900 dark:text-white">
          {safeAsset} Sentiment
        </h2>
        {loading && (current || historical.length > 0) && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Updating…
          </span>
        )}
      </div>
      {showLoadingHint ? (
        <p className="m-0 text-gray-600 dark:text-gray-400 text-sm">
          Loading sentiment for {safeAsset}…
        </p>
      ) : current ? (
        <Gauge score={current.aggregated_score} stale={current.stale} />
      ) : (
        <p className="m-0 text-gray-600 dark:text-gray-400 text-sm">
          No sentiment data yet. The job runs every 15 minutes.
        </p>
      )}
      {historical.length > 0 && (
        <div className="h-[220px] mt-7 min-w-0">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
            Score over time
          </h3>
          <ChartErrorBoundary>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={historical.map((d) => ({
                  ...d,
                  time: d.time ?? d.window_end,
                  score: Number.isFinite(Number(d.score)) ? Number(d.score) : 0,
                }))}
                margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-gray-200 dark:stroke-gray-600"
                />
                <XAxis
                  dataKey="time"
                  tickFormatter={(v) =>
                    v != null ? new Date(v).toLocaleDateString() : ''
                  }
                  className="text-gray-500 dark:text-gray-400 text-[11px]"
                />
                <YAxis
                  domain={[-1, 1]}
                  className="text-gray-500 dark:text-gray-400 text-[11px]"
                  tickFormatter={(v) =>
                    Number.isFinite(Number(v)) ? Number(v).toFixed(1) : ''
                  }
                />
                <Tooltip
                  labelFormatter={(v) =>
                    v != null ? new Date(v).toLocaleString() : ''
                  }
                  formatter={(value) => {
                    const score = Array.isArray(value) ? value[0] : value;
                    const num = Number(score);
                    return [
                      Number.isFinite(num) ? num.toFixed(3) : '—',
                      'Score',
                    ];
                  }}
                  contentStyle={{
                    background: 'var(--tw-bg-opacity, 1)',
                    border: '1px solid rgb(63 63 70)',
                    borderRadius: '6px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartErrorBoundary>
        </div>
      )}
      {metaLine}
    </section>
  );
}
