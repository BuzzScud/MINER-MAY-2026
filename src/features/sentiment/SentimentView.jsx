import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Panel } from '../../components/common/Panel';
import SentimentIndicator from './SentimentIndicator';
import CompositeIndicesView from './CompositeIndicesView';
import CME from '../../pages/CME';

const TAB_SENTIMENT = 'sentiment';
const TAB_CME = 'cme';

const PROVIDER_OPTIONS = [
  { value: 'massive', label: 'Massive' },
  { value: 'finnhub', label: 'Finnhub' },
  { value: 'alphavantage', label: 'Alpha Vantage' },
  { value: 'yfinance', label: 'Yahoo Finance' },
];

const AGGREGATION_OPTIONS = [
  { value: 'mean', label: 'Mean' },
  { value: 'trimmed_mean', label: 'Trimmed mean' },
  { value: 'median', label: 'Median' },
];

const inputClass =
  'px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm min-w-[120px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400';
const labelClass = 'text-gray-700 dark:text-gray-300 font-medium text-sm';

const sentimentCache = { asset: null, provider: null };

export function SentimentView() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() =>
    tabParam === TAB_CME ? TAB_CME : TAB_SENTIMENT,
  );
  useEffect(() => {
    if (tabParam === TAB_CME) setActiveTab(TAB_CME);
    else setActiveTab(TAB_SENTIMENT);
  }, [tabParam]);
  const [searchInput, setSearchInput] = useState(() => sentimentCache.asset || 'QQQ');
  const [provider, setProvider] = useState(() => sentimentCache.provider || 'yfinance');
  const [submittedAsset, setSubmittedAsset] = useState(() => sentimentCache.asset);
  const [submittedProvider, setSubmittedProvider] = useState(() => sentimentCache.provider);
  const [useTimeDecay, setUseTimeDecay] = useState(false);
  const [aggregationMode, setAggregationMode] = useState('mean');
  const [includeUncertainty, setIncludeUncertainty] = useState(true);
  const [usePrimeModular, setUsePrimeModular] = useState(false);
  const [apiRunning, setApiRunning] = useState(null);
  const [startError, setStartError] = useState(null);

  // Auto-connect: check if Sentiment API (port 8000) is up via its health endpoint; if not, try to start it via main API (port 4000)
  useEffect(() => {
    let cancelled = false;
    setStartError(null);
    // Prefer checking Sentiment API directly (proxied to 8000) so we don't require the main API (4000) when sentiment is already running
    fetch('/api/sentiment/health', { method: 'GET' })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setApiRunning(true);
          return;
        }
        return Promise.resolve(false);
      })
      .catch(() => false)
      .then((alreadyUp) => {
        if (cancelled || alreadyUp === undefined) return;
        if (alreadyUp === true) return;
        if (!token) {
          setStartError('Log in to start the Sentiment API from this page.');
          return;
        }
        return fetch('/api/sentiment-backend/start', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(async (res) => {
            const startData = await res.json().catch(() => ({}));
            if (cancelled) return;
            if (res.ok) {
              setStartError('Sentiment API is starting… waiting for it to come online.');
              const pollHealth = async (retries) => {
                if (cancelled || retries <= 0) return;
                await new Promise((r) => setTimeout(r, 2000));
                try {
                  const h = await fetch('/api/sentiment/health', { method: 'GET' });
                  if (h.ok) { setApiRunning(true); setStartError(null); return; }
                } catch {}
                return pollHealth(retries - 1);
              };
              await pollHealth(10);
              if (!cancelled && !apiRunning) {
                setStartError('Sentiment API did not respond after starting. Run ./scripts/run-dev.sh or npm run sentiment:api manually.');
              }
              return;
            }
            setStartError(
              startData.message || 'Could not start Sentiment API. Run ./scripts/run-dev.sh (or npm run sentiment:api).'
            );
          })
          .catch(() => {
            if (!cancelled) {
              setStartError(
                'Sentiment API is not running. Run ./scripts/run-dev.sh (or npm run sentiment:api) to start it.'
              );
            }
          });
      });
    return () => { cancelled = true; };
  }, [token]);

  // Auto-load default sentiment for QQQ when opening the page on the Sentiment tab
  useEffect(() => {
    if (activeTab !== TAB_SENTIMENT) return;
    if (submittedAsset) return;
    const defaultSymbol = 'QQQ';
    const upper = defaultSymbol.toUpperCase();
    setSearchInput(upper);
    sentimentCache.asset = upper;
    sentimentCache.provider = provider;
    setSubmittedAsset(upper);
    setSubmittedProvider(provider);
  }, [activeTab, submittedAsset, provider]);

  const handleGetSentiment = () => {
    const symbol = searchInput.trim().toUpperCase();
    if (symbol) {
      sentimentCache.asset = symbol;
      sentimentCache.provider = provider;
      setSubmittedAsset(symbol);
      setSubmittedProvider(provider);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleGetSentiment();
  };

  const options = {
    useTimeDecay,
    aggregationMode,
    includeUncertainty,
    usePrimeModular,
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-hidden">
      <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2 flex-shrink-0">
        <Link
          to="/"
          className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors"
        >
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-900 dark:text-white">
          Sentiment
        </span>
      </nav>
      <header className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
            Sentiment
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Market sentiment and composite indices
          </p>
        </div>
        {startError && (
          <p className="text-sm text-red-600 dark:text-red-400 m-0" role="alert">
            {startError}
          </p>
        )}
      </header>

      <div
        role="tablist"
        aria-label="Main tabs"
        className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-4 flex-shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_SENTIMENT}
          aria-controls="tabpanel-sentiment"
          id="tab-sentiment"
          onClick={() => setActiveTab(TAB_SENTIMENT)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === TAB_SENTIMENT
              ? 'border-indigo-600 text-gray-900 dark:text-white'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Market Sentiment
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_CME}
          aria-controls="tabpanel-cme"
          id="tab-cme"
          onClick={() => setActiveTab(TAB_CME)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === TAB_CME
              ? 'border-indigo-600 text-gray-900 dark:text-white'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          CME
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === TAB_CME ? (
          <div
            id="tabpanel-cme"
            role="tabpanel"
            aria-labelledby="tab-cme"
            className="flex-1 min-h-0 overflow-hidden"
          >
            <CME embedded />
          </div>
        ) : (
          <div
            id="tabpanel-sentiment"
            role="tabpanel"
            aria-labelledby="tab-sentiment"
            className="pb-6"
          >
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="space-y-6 max-w-[720px] xl:max-w-none mx-auto xl:mx-0">
                <div>
                  <Panel title="Lookup">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                        <label htmlFor="symbol-search" className={labelClass + ' shrink-0'}>
                          Symbol
                        </label>
                        <input
                          id="symbol-search"
                          type="text"
                          value={searchInput}
                          onChange={(e) => setSearchInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="e.g. AAPL, BTC, TSLA"
                          className={inputClass + ' min-w-0 w-full sm:min-w-[100px] sm:max-w-[180px]'}
                          aria-label="Symbol to look up"
                        />
                        <label htmlFor="provider-select" className={labelClass + ' shrink-0'}>
                          API
                        </label>
                        <select
                          id="provider-select"
                          value={provider}
                          onChange={(e) => setProvider(e.target.value)}
                          className={inputClass + ' min-w-0 sm:min-w-[140px]'}
                          aria-label="API provider"
                        >
                          {PROVIDER_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleGetSentiment}
                          disabled={!searchInput.trim()}
                          aria-label="Get sentiment for the entered symbol"
                          className={`shrink-0 min-w-0 sm:min-w-[140px] px-5 py-2.5 rounded-md text-sm font-semibold transition-colors ${
                            searchInput.trim()
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                              : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          Get sentiment
                        </button>
                      </div>
                    </div>
                  </Panel>
                </div>

                <div>
                  <Panel title="Options">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                      <div className="flex items-center gap-2">
                        <label htmlFor="aggregation-mode" className={labelClass}>
                          Aggregation
                        </label>
                        <select
                          id="aggregation-mode"
                          value={aggregationMode}
                          onChange={(e) => setAggregationMode(e.target.value)}
                          className={inputClass + ' min-w-0 sm:min-w-[140px]'}
                          aria-label="Aggregation mode"
                        >
                          {AGGREGATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="use-time-decay"
                          type="checkbox"
                          checked={useTimeDecay}
                          onChange={(e) => setUseTimeDecay(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                          aria-label="Use time decay"
                        />
                        <label htmlFor="use-time-decay" className={labelClass}>
                          Time decay
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="include-uncertainty"
                          type="checkbox"
                          checked={includeUncertainty}
                          onChange={(e) => setIncludeUncertainty(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                          aria-label="Include uncertainty"
                        />
                        <label htmlFor="include-uncertainty" className={labelClass}>
                          Uncertainty
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="use-prime-modular"
                          type="checkbox"
                          checked={usePrimeModular}
                          onChange={(e) => setUsePrimeModular(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                          aria-label="Use prime-modular"
                        />
                        <label htmlFor="use-prime-modular" className={labelClass}>
                          Prime-modular
                        </label>
                      </div>
                    </div>
                  </Panel>
                </div>

                {submittedAsset ? (
                  <SentimentIndicator
                    key={submittedAsset}
                    asset={submittedAsset}
                    provider={submittedProvider ?? provider}
                    options={options}
                  />
                ) : (
                  <section
                    aria-label="Sentiment placeholder"
                    className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 max-w-[720px] mx-auto xl:mx-0"
                  >
                    <p className="m-0 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                      Enter a symbol, select an API, and click{' '}
                      <strong className="text-gray-700 dark:text-gray-300">Get sentiment</strong> to load data.
                    </p>
                  </section>
                )}
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Composite & Indices
                </h2>
                <CompositeIndicesView embedded />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
