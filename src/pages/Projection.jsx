import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
} from 'recharts';

function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) {
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `$${Number(value).toFixed(4)}`;
}

function formatPercentFromFraction(frac) {
  if (frac == null || Number.isNaN(frac)) return '—';
  const pct = frac * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function buildChartData(historicalDates, historicalPrices, predictedDates, predictedPrices, upperBand, lowerBand) {
  const data = [];
  if (historicalDates && historicalPrices) {
    for (let i = 0; i < historicalDates.length; i += 1) {
      const d = historicalDates[i];
      data.push({
        date: d,
        historical: historicalPrices[i],
        predicted: null,
        upper: null,
        lower: null,
      });
    }
  }
  if (predictedDates && predictedPrices) {
    const offset = data.length;
    const lastHist = data.length ? data[data.length - 1].historical : null;
    if (lastHist != null && predictedPrices.length) {
      if (data.length) {
        data[data.length - 1].predicted = lastHist;
        data[data.length - 1].upper = null;
        data[data.length - 1].lower = null;
      }
      for (let i = 0; i < predictedDates.length; i += 1) {
        const idx = offset + i;
        const date = predictedDates[i];
        if (!data[idx]) {
          data[idx] = {
            date,
            historical: null,
            predicted: predictedPrices[i],
            upper: upperBand ? upperBand[i] : null,
            lower: lowerBand ? lowerBand[i] : null,
          };
        } else {
          data[idx].predicted = predictedPrices[i];
          data[idx].upper = upperBand ? upperBand[i] : null;
          data[idx].lower = lowerBand ? lowerBand[i] : null;
        }
      }
    }
  }
  return data;
}

function Projection({ embedded = false }) {
  const { getItem, setItem } = useStorage();
  const [ticker, setTicker] = useState('QQQ');
  const [assetType, setAssetType] = useState('stock');
  const [horizon, setHorizon] = useState('30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const loadStored = useCallback(() => {
    getItem(STORAGE_KEYS.PROJECTION_LAST_SYMBOL)
      .then((saved) => {
        if (saved && typeof saved === 'string') {
          setTicker(saved);
        }
      })
      .catch(() => {});
  }, [getItem]);

  useEffect(() => {
    loadStored();
  }, [loadStored]);

  const runPrediction = useCallback(
    async (symbolArg, assetArg, horizonArg) => {
      const symbol = (symbolArg || ticker || 'QQQ').trim().toUpperCase();
      const asset = assetArg || assetType || 'stock';
      const horiz = horizonArg || horizon || '30';

      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: symbol,
            asset_type: asset,
            horizon: horiz,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setResult(data);
        setItem(STORAGE_KEYS.PROJECTION_LAST_SYMBOL, symbol).catch(() => {});
      } catch (e) {
        setError(e?.message || 'Prediction failed');
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [ticker, assetType, horizon, setItem],
  );

  useEffect(() => {
    runPrediction('QQQ', 'stock', '30');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    runPrediction();
  };

  const chartData = result
    ? buildChartData(
        result.historical_dates,
        result.historical_prices,
        result.predicted_dates,
        result.predicted_prices,
        result.upper_band,
        result.lower_band,
      )
    : [];

  const directionUp = result?.direction === 'bullish';

  const containerCls = embedded
    ? 'w-full max-w-[1800px] mx-auto px-0 flex flex-col h-full min-h-0 overflow-hidden'
    : 'w-full max-w-[1800px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-hidden';

  return (
    <div className={containerCls}>
      {!embedded && (
        <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2 flex-shrink-0">
          <Link
            to="/"
            className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors"
          >
            Dashboard
          </Link>
          <span>/</span>
          <span className="font-medium text-gray-900 dark:text-white">
            Projections
          </span>
        </nav>
      )}

      {!embedded && (
        <header className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              Crystalline Projection
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              Market Oracle-style forecast with clock lattice, Fibonacci, and phi targets.
            </p>
          </div>
        </header>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 flex-shrink-0">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Current
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            {result ? formatCurrency(result.current_price) : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Predicted
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            {result ? formatCurrency(result.predicted_price) : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Change
          </p>
          <p
            className={`text-2xl font-bold tabular-nums flex items-center gap-1.5 ${
              result
                ? directionUp
                  ? 'text-emerald-500'
                  : 'text-red-500'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            <span className="text-lg">
              {result ? (directionUp ? '↑' : '↓') : '—'}
            </span>
            <span>
              {result ? formatPercentFromFraction(result.pct_change) : '—'}
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Confidence
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums mb-2">
            {result && result.confidence != null ? `${result.confidence}%` : '—'}
          </p>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-700"
              style={{
                width: result && result.confidence != null ? `${Math.min(100, result.confidence)}%` : '0%',
              }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 mb-6 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Historical & forecast
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {result ? (result.symbol || ticker.toUpperCase()) : '—'}
          </span>
        </div>
        <div className="h-80">
          {chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-800" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  minTickGap={12}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={(v) => (v != null ? v.toFixed(0) : '')}
                />
                <RechartsTooltip
                  formatter={(v) => (v != null ? formatCurrency(v) : '')}
                  labelFormatter={(label) => label}
                />
                <Area
                  type="monotone"
                  dataKey="lower"
                  stroke="transparent"
                  fill="rgba(245, 158, 11, 0.15)"
                  activeDot={false}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="transparent"
                  fill="rgba(245, 158, 11, 0.15)"
                  activeDot={false}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="historical"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
              {loading ? 'Running prediction…' : 'Run a prediction to see the projection chart.'}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
        <div className="lg:col-span-4 flex">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 w-full h-full flex flex-col">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">
              Run prediction
            </h2>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="ticker"
                  className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5"
                >
                  Ticker
                </label>
                <input
                  id="ticker"
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  maxLength={20}
                  autoComplete="off"
                  className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-sky-400 dark:focus:border-sky-500 outline-none"
                  placeholder="e.g. QQQ, AAPL, BTC"
                />
              </div>
              <div>
                <label
                  htmlFor="assetType"
                  className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5"
                >
                  Asset type
                </label>
                <select
                  id="assetType"
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value)}
                  className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-sky-400 dark:focus:border-sky-500 outline-none"
                >
                  <option value="stock">Stock</option>
                  <option value="crypto">Crypto</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="horizon"
                  className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5"
                >
                  Horizon
                </label>
                <select
                  id="horizon"
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value)}
                  className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-sky-400 dark:focus:border-sky-500 outline-none"
                >
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex justify-center items-center rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-sky-400 text-white text-sm font-semibold py-2.5 px-4 transition-colors"
              >
                {loading ? 'Running…' : 'Run Prediction'}
              </button>
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
        </div>

        <div className="lg:col-span-8 flex">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Summary
            </h2>
            {result ? (
              <div className="grid grid-cols-2 gap-4 text-xs lg:text-sm">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 p-3">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Crystalline Score
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-gray-900 dark:text-white tabular-nums">
                        {result.crystalline_score ?? '—'}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        (range -4 to +4)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width:
                            result.crystalline_score != null
                              ? `${Math.max(
                                  0,
                                  Math.min(100, ((result.crystalline_score + 4) / 8) * 100),
                                )}%`
                              : '50%',
                          background:
                            result.crystalline_score != null && result.crystalline_score < 0
                              ? '#ef4444'
                              : '#22c55e',
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Trend: <span>{result.trend_score ?? '—'}</span> · Vol:{' '}
                      <span>{result.vol_score ?? '—'}</span> · Risk:{' '}
                      <span>{result.risk_score ?? '—'}</span>
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 p-3">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Clock Lattice
                  </p>
                  <div className="flex flex-col gap-1 text-xs">
                    <span>
                      Position:{' '}
                      <strong className="tabular-nums text-gray-900 dark:text-white">
                        {result.clock_position ?? '—'}
                      </strong>{' '}
                      / 11
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {result.on_prime
                        ? 'Prime-aligned (3, 6, 9)'
                        : 'Not prime-aligned'}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {result.pi_phi_resonance ? 'π×φ resonance' : 'No π×φ resonance'}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 p-3">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Fibonacci Levels
                  </p>
                  <div className="space-y-1 text-xs">
                    <div>
                      Swing High:{' '}
                      <span className="font-mono tabular-nums text-gray-900 dark:text-white">
                        {result.swing_high != null
                          ? formatCurrency(result.swing_high)
                          : '—'}
                      </span>
                    </div>
                    <div>
                      Swing Low:{' '}
                      <span className="font-mono tabular-nums text-gray-900 dark:text-white">
                        {result.swing_low != null
                          ? formatCurrency(result.swing_low)
                          : '—'}
                      </span>
                    </div>
                    <div>
                      0.382:{' '}
                      <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
                        {result.fib_levels_dict?.['0.382'] != null
                          ? formatCurrency(result.fib_levels_dict['0.382'])
                          : '—'}
                      </span>
                    </div>
                    <div>
                      0.618 (OTE):{' '}
                      <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
                        {result.fib_levels_dict?.['0.618'] != null
                          ? formatCurrency(result.fib_levels_dict['0.618'])
                          : '—'}
                      </span>
                    </div>
                    <div>
                      0.786:{' '}
                      <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
                        {result.fib_levels_dict?.['0.786'] != null
                          ? formatCurrency(result.fib_levels_dict['0.786'])
                          : '—'}
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 pt-1">
                      Confluence:{' '}
                      {result.fib_bull_confluence || result.fib_bear_confluence
                        ? [
                            result.fib_bull_confluence ? 'Bull confluence' : null,
                            result.fib_bear_confluence ? 'Bear confluence' : null,
                          ]
                            .filter(Boolean)
                            .join('; ')
                        : 'None'}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 p-3">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Risk Metrics
                  </p>
                  <div className="flex flex-col gap-1 text-xs">
                    <span>
                      Risk ratio:{' '}
                      <span className="font-mono tabular-nums text-gray-900 dark:text-white">
                        {result.risk_ratio != null
                          ? Number(result.risk_ratio).toFixed(4)
                          : '—'}
                      </span>
                    </span>
                    <span>
                      Ann. volatility:{' '}
                      <span className="font-mono tabular-nums text-gray-900 dark:text-white">
                        {result.volatility_annual != null
                          ? `${(result.volatility_annual * 100).toFixed(2)}%`
                          : '—'}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 p-3">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Phi Extension Target
                  </p>
                  <p className="text-xs">
                    <span className="font-mono font-semibold tabular-nums text-gray-900 dark:text-white">
                      {result.phi_target != null
                        ? formatCurrency(result.phi_target)
                        : '—'}
                    </span>
                  </p>
                </div>

                <p className="col-span-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                  {result.summary || '—'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Run a prediction to see the Crystalline summary.
              </p>
            )}
            <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-2">
              Not financial advice. For educational and research purposes only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Projection;

