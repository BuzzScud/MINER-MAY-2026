import React, { useEffect, useState, useCallback, useRef } from 'react';
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

const API_BASE = '/api/composite';

const SERVICE_UNAVAILABLE_MSG =
  'Sentiment service unavailable. Run ./scripts/setup-sentiment.sh, then ./scripts/run-dev.sh. See archive/source-projects/SENTIMENT INDICATOR - 2026/README.md for DB setup.';

const REFETCH_INTERVAL_MS = 60 * 1000;

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

const INDEX_CARDS = [
  { key: 'cnn_fear_greed', label: 'CNN Fear & Greed' },
  { key: 'crypto_fear_greed', label: 'Crypto Fear & Greed' },
  { key: 'aaii_sentiment', label: 'AAII Sentiment' },
  {
    key: 'funding_rate_btc',
    label: 'Funding rate (BTC)',
    rawLabel: 'Positive = long bias',
  },
  { key: 'vix', label: 'VIX', rawLabel: 'High = fear' },
  { key: 'put_call_ratio', label: 'Put/Call ratio' },
  {
    key: 'news_polarity',
    label: 'News polarity',
    rawLabel: 'From text sentiment',
  },
];

function IndexCard({ label, value, rawLabel }) {
  const hasValue = value != null && Number.isFinite(Number(value));
  return (
    <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-700 min-w-[120px]">
      <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </div>
      <div className="text-base font-semibold text-gray-900 dark:text-white">
        {hasValue ? Number(value).toFixed(3) : '— No data'}
      </div>
      {rawLabel && hasValue && (
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
          {rawLabel}
        </div>
      )}
    </div>
  );
}

function useCompositeData() {
  const [current, setCurrent] = useState(null);
  const currentRef = useRef(null);
  currentRef.current = current;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const refetch = useCallback(() => {
    setError(null);
    const hasData = currentRef.current !== null;
    if (!hasData) setLoading(true);
    else setRefreshing(true);
    Promise.all([
      fetch(`${API_BASE}/current`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_BASE}/history?limit=200`).then((r) =>
        r.ok ? r.json() : []
      ),
    ])
      .then(([cur, hist]) => {
        setCurrent(cur || null);
        setHistory(Array.isArray(hist) ? hist : []);
      })
      .catch((e) =>
        setError(
          isNetworkOrUnavailableError(e) ? SERVICE_UNAVAILABLE_MSG : e.message
        )
      )
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const id = setInterval(refetch, REFETCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  return { current, history, loading, refreshing, error, refetch };
}

const cardSectionClass =
  'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 w-full';

export default function CompositeIndicesView({ embedded = false }) {
  const { current, history, loading, refreshing, error, refetch } = useCompositeData();

  if (error) {
    return (
      <div className={`space-y-6 pb-6 ${embedded ? 'w-full' : 'max-w-[720px] mx-auto'}`}>
        <section aria-label="Composite error" className={cardSectionClass}>
          <h2 className="m-0 mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            Composite & Indices
          </h2>
          <p role="alert" className="text-red-500 dark:text-red-400 text-sm m-0 mb-4">
            Error: {error}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Try again
          </button>
        </section>
      </div>
    );
  }

  const compositeScore = current?.composite ?? null;
  const compositeTs = current?.timestamp ?? null;
  const indices = current?.indices ?? {};
  const components = current?.composite_components ?? null;

  return (
    <div className={`space-y-6 pb-6 ${embedded ? 'w-full' : 'max-w-[720px] mx-auto'}`}>
      <section
        className={cardSectionClass}
        aria-label="Composite score and history"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="m-0 text-lg font-semibold text-gray-900 dark:text-white">
            Composite Score
          </h2>
          <div className="flex items-center gap-2">
            {(loading || refreshing) && current && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Updating…
              </span>
            )}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={loading && !current}
              className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Refresh
            </button>
          </div>
        </div>
        {loading && !current ? (
          <p className="m-0 text-gray-600 dark:text-gray-400 text-sm">
            Loading…
          </p>
        ) : compositeScore != null && Number.isFinite(compositeScore) ? (
          <>
            <Gauge score={compositeScore} />
            <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-600">
              <p className="m-0 text-xs text-gray-500 dark:text-gray-400">
                Last updated:{' '}
                {compositeTs
                  ? new Date(compositeTs).toLocaleString()
                  : '—'}
              </p>
            </div>
            {!loading && history?.length > 0 && (
              <>
                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-7 mb-3">
                  Score over time
                </h3>
                <div className="h-[220px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={history.map((d) => ({
                        ...d,
                        time: d.timestamp,
                        score: Number.isFinite(Number(d.score))
                          ? Number(d.score)
                          : 0,
                      }))}
                      margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgb(39 39 42)"
                        className="dark:stroke-gray-600"
                      />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(v) =>
                          v != null ? new Date(v).toLocaleDateString() : ''
                        }
                        stroke="#71717a"
                        fontSize={11}
                      />
                      <YAxis
                        domain={[-1, 1]}
                        stroke="#71717a"
                        fontSize={11}
                        tickFormatter={(v) =>
                          Number.isFinite(Number(v))
                            ? Number(v).toFixed(1)
                            : ''
                        }
                      />
                      <Tooltip
                        labelFormatter={(v) =>
                          v != null ? new Date(v).toLocaleString() : ''
                        }
                        formatter={(value) => {
                          const num = Number(value);
                          return [
                            Number.isFinite(num) ? num.toFixed(3) : '—',
                            'Score',
                          ];
                        }}
                        contentStyle={{
                          background: 'rgb(39 39 42)',
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
                </div>
              </>
            )}
          </>
        ) : (
          <p className="m-0 text-gray-600 dark:text-gray-400 text-sm">
            No composite data yet. Data is updated periodically.
          </p>
        )}
      </section>

      <section
        className={cardSectionClass}
        aria-label="Indices and breakdown"
      >
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
          Indices & breakdown
        </h3>
        <div className="grid grid-cols-3 gap-3 items-stretch">
          {INDEX_CARDS.map(({ key, label, rawLabel }) => (
            <IndexCard
              key={key}
              label={label}
              value={indices[key]}
              rawLabel={rawLabel}
            />
          ))}
          <div className="col-span-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400 min-h-0">
            <div className="mb-1.5 font-semibold text-gray-900 dark:text-white">
              Composite components
            </div>
            {['text', 'funding', 'on_chain', 'fear_greed', 'google_trends'].map(
              (k) => {
                const v =
                  components && typeof components === 'object'
                    ? components[k]
                    : undefined;
                return (
                  <div key={k} className="mb-0.5">
                    {k}: {Number.isFinite(Number(v)) ? Number(v).toFixed(3) : '—'}
                  </div>
                );
              }
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
