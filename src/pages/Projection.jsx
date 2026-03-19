import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Save } from 'lucide-react';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { saveProjection } from '../services/projectionService';
import {
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  ReferenceLine,
  Brush,
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

/**
 * Compute a Y-axis domain [min, max] from historical prices only,
 * then selectively include predicted/fib/band values that don't distort the scale.
 */
function computeYDomain(chartData, fibLevelsDict) {
  const histPrices = [];
  for (const pt of chartData) {
    if (pt.historical != null && Number.isFinite(pt.historical)) histPrices.push(pt.historical);
  }
  if (histPrices.length === 0) return [0, 100];
  let lo = Math.min(...histPrices);
  let hi = Math.max(...histPrices);
  const histRange = hi - lo || 1;

  for (const pt of chartData) {
    if (pt.predicted != null && Number.isFinite(pt.predicted)) {
      if (pt.predicted >= lo - histRange * 0.4 && pt.predicted <= hi + histRange * 0.4) {
        if (pt.predicted < lo) lo = pt.predicted;
        if (pt.predicted > hi) hi = pt.predicted;
      }
    }
  }

  if (fibLevelsDict && typeof fibLevelsDict === 'object') {
    const range = hi - lo || 1;
    for (const price of Object.values(fibLevelsDict)) {
      const p = Number(price);
      if (!Number.isFinite(p)) continue;
      if (p >= lo - range * 0.3 && p <= hi + range * 0.3) {
        if (p < lo) lo = p;
        if (p > hi) hi = p;
      }
    }
  }

  const padding = (hi - lo) * 0.08 || 1;
  return [lo - padding, hi + padding];
}

function shortenDateLabel(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  // "02/23, 14:30" → "02/23"  |  "2026-03-23" → "03/23"
  const commaIdx = dateStr.indexOf(',');
  if (commaIdx > 0) return dateStr.slice(0, commaIdx);
  const isoMatch = dateStr.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}/${isoMatch[2]}`;
  return dateStr;
}

const FIB_RATIO_LABELS = {
  '0': 'Swing Low',
  '0.236': '0.236',
  '0.382': '0.382',
  '0.5': '0.5 (Eq)',
  '0.618': '0.618 (OTE)',
  '0.786': '0.786 (OTE)',
  '1': 'Swing High',
};

const ZOOM_FACTOR = 0.08;
const MIN_Y_RANGE = 0.5;

function dedupeRefLabels(lines, minGap) {
  if (!lines.length) return lines;
  const sorted = [...lines].sort((a, b) => a.price - b.price);
  const kept = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].price - kept[kept.length - 1].price >= minGap) {
      kept.push(sorted[i]);
    }
  }
  return kept;
}

function ProjectionChart({ chartData, fibLevelsDict, phiExtensionLevels, ticker, loading, directionUp }) {
  const hasData = chartData && chartData.length > 0;
  const phiLevels = Array.isArray(phiExtensionLevels) ? phiExtensionLevels : [];
  const [baseYMin, baseYMax] = hasData ? computeYDomain(chartData, fibLevelsDict) : [0, 100];

  const [yDomain, setYDomain] = useState([baseYMin, baseYMax]);
  const [isZoomed, setIsZoomed] = useState(false);
  const chartContainerRef = useRef(null);

  useEffect(() => {
    setYDomain([baseYMin, baseYMax]);
    setIsZoomed(false);
  }, [baseYMin, baseYMax]);

  const [yMin, yMax] = yDomain;

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const delta = e.deltaY;
      const range = yMax - yMin;
      if (range < MIN_Y_RANGE && delta < 0) return;

      if (e.shiftKey) {
        const panAmt = range * 0.04 * (delta > 0 ? 1 : -1);
        setYDomain([yMin + panAmt, yMax + panAmt]);
      } else {
        const zoomAmt = range * ZOOM_FACTOR * (delta > 0 ? 1 : -1);
        const mid = (yMin + yMax) / 2;
        const newMin = mid - (range - zoomAmt) / 2;
        const newMax = mid + (range - zoomAmt) / 2;
        if (newMax - newMin < MIN_Y_RANGE) return;
        setYDomain([newMin, newMax]);
      }
      setIsZoomed(true);
    },
    [yMin, yMax],
  );

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleResetZoom = useCallback(() => {
    setYDomain([baseYMin, baseYMax]);
    setIsZoomed(false);
  }, [baseYMin, baseYMax]);

  const clampedData = hasData
    ? chartData.map((pt) => ({
        ...pt,
        predicted:
          pt.predicted != null && Number.isFinite(pt.predicted)
            ? Math.min(Math.max(pt.predicted, yMin), yMax)
            : pt.predicted,
        upperClamped:
          pt.upper != null && Number.isFinite(pt.upper)
            ? Math.min(Math.max(pt.upper, yMin), yMax)
            : null,
        lowerClamped:
          pt.lower != null && Number.isFinite(pt.lower)
            ? Math.min(Math.max(pt.lower, yMin), yMax)
            : null,
      }))
    : [];

  const histColor = directionUp ? '#22c55e' : '#ef4444';

  const visibleRange = yMax - yMin;
  const labelMinGap = visibleRange * 0.018;

  const allRefLines = [];
  if (fibLevelsDict) {
    for (const [ratioStr, price] of Object.entries(fibLevelsDict)) {
      const p = Number(price);
      if (!Number.isFinite(p) || p < yMin || p > yMax) continue;
      const r = Number(ratioStr);
      const isAnchor = r === 0 || r === 1;
      const isOte = r === 0.618 || r === 0.786;
      allRefLines.push({
        key: `fib-${ratioStr}`,
        price: p,
        stroke: isAnchor ? '#0ea5e9' : isOte ? '#38bdf8' : '#cbd5e1',
        dash: isAnchor ? '0' : isOte ? '4 4' : '6 4',
        width: isAnchor ? 1.5 : 1,
        opacity: 1,
        label: FIB_RATIO_LABELS[ratioStr] || ratioStr,
        labelFill: '#94a3b8',
        priority: isAnchor ? 2 : isOte ? 1 : 0,
      });
    }
  }
  for (const row of phiLevels) {
    const ratio = Number(row.ratio);
    if (!Number.isFinite(ratio)) continue;
    const tag = ratio === 0 ? 'Low' : ratio === 1 ? 'High' : ratio.toFixed(3);
    const bullish = Number(row.bullish);
    const bearish = Number(row.bearish);
    if (Number.isFinite(bullish) && bullish >= yMin && bullish <= yMax) {
      allRefLines.push({
        key: `phi-b-${ratio}`,
        price: bullish,
        stroke: '#22c55e',
        dash: '3 3',
        width: 1,
        opacity: 0.5,
        label: `${tag} ↑`,
        labelFill: '#22c55e',
        priority: 0,
      });
    }
    if (Number.isFinite(bearish) && bearish >= yMin && bearish <= yMax) {
      allRefLines.push({
        key: `phi-r-${ratio}`,
        price: bearish,
        stroke: '#ef4444',
        dash: '3 3',
        width: 1,
        opacity: 0.5,
        label: `${tag} ↓`,
        labelFill: '#ef4444',
        priority: 0,
      });
    }
  }

  const visibleRefLines = dedupeRefLabels(allRefLines, labelMinGap);

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 mb-6 flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Historical & forecast
        </h2>
        <div className="flex items-center gap-3">
          {isZoomed && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="text-[10px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Reset zoom
            </button>
          )}
          <span className="text-[10px] text-gray-400 dark:text-gray-500 hidden sm:inline">
            Scroll to zoom · Shift+scroll to pan
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {ticker || '—'}
          </span>
        </div>
      </div>
      <div className="h-80" ref={chartContainerRef}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={clampedData} margin={{ top: 8, right: 80, left: 8, bottom: 24 }}>
              <defs>
                <linearGradient id="projHistGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={histColor} stopOpacity={0.12} />
                  <stop offset="80%" stopColor={histColor} stopOpacity={0.02} />
                  <stop offset="100%" stopColor={histColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                minTickGap={60}
                tickFormatter={shortenDateLabel}
              />
              <YAxis
                domain={[yMin, yMax]}
                allowDataOverflow
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  v != null && Number.isFinite(v) ? `$${v.toFixed(2)}` : ''
                }
                width={72}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: 'rgba(0,0,0,0.85)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}
                formatter={(v, name) => {
                  if (v == null) return [null, null];
                  const label =
                    name === 'historical'
                      ? 'Price'
                      : name === 'predicted'
                        ? 'Forecast'
                        : name === 'upperClamped'
                          ? 'Upper band'
                          : name === 'lowerClamped'
                            ? 'Lower band'
                            : name;
                  return [formatCurrency(v), label];
                }}
                labelFormatter={(label) => label}
              />
              {visibleRefLines.map((line) => (
                <ReferenceLine
                  key={line.key}
                  y={line.price}
                  stroke={line.stroke}
                  strokeDasharray={line.dash}
                  strokeWidth={line.width}
                  strokeOpacity={line.opacity}
                  label={{
                    value: line.label,
                    position: 'right',
                    fontSize: 8,
                    fill: line.labelFill,
                  }}
                />
              ))}
              <Area
                type="monotone"
                dataKey="upperClamped"
                stroke="transparent"
                fill="rgba(251, 191, 36, 0.08)"
                activeDot={false}
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="lowerClamped"
                stroke="transparent"
                fill="rgba(251, 191, 36, 0.08)"
                activeDot={false}
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="historical"
                stroke={histColor}
                strokeWidth={2}
                fill="url(#projHistGrad)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: histColor }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="predicted"
                stroke="#f97316"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                fill="transparent"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#f97316' }}
                isAnimationActive={false}
              />
              <Brush
                dataKey="date"
                height={10}
                stroke="#6366f1"
                fill="rgba(99,102,241,0.03)"
                tickFormatter={shortenDateLabel}
                travellerWidth={6}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
            {loading ? 'Running prediction…' : 'Run a prediction to see the projection chart.'}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-500">
        All dates shown in Eastern Time (America/New_York).
      </p>
    </section>
  );
}

const PROJECTION_LOAD_AS_NEW_KEY = 'projectionLoadAsNewTicker';

function Projection({ embedded = false }) {
  const { getItem, setItem } = useStorage();
  const storageAdapter = useRef({ getItem, setItem });
  storageAdapter.current = { getItem, setItem };
  const [ticker, setTicker] = useState('QQQ');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [saveSubmitting, setSaveSubmitting] = useState(false);
  const [saveToast, setSaveToast] = useState({ show: false, message: '', isError: false });

  const runPrediction = useCallback(
    async (symbolArg) => {
      const symbol = (symbolArg || ticker || 'QQQ').trim().toUpperCase();
      const asset = 'stock';

      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: symbol,
            asset_type: asset,
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
    [ticker, setItem],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loadAsNew =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem(PROJECTION_LOAD_AS_NEW_KEY)
            : null;
        if (loadAsNew) {
          sessionStorage.removeItem(PROJECTION_LOAD_AS_NEW_KEY);
          const sym = String(loadAsNew).trim().toUpperCase();
          if (sym) {
            setTicker(sym);
            if (!cancelled) await runPrediction(sym);
            return;
          }
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const saved = await getItem(STORAGE_KEYS.PROJECTION_LAST_SYMBOL);
      const sym =
        saved && typeof saved === 'string' && saved.trim()
          ? saved.trim().toUpperCase()
          : 'QQQ';
      setTicker(sym);
      if (!cancelled) await runPrediction(sym);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const showSaveToast = useCallback((message, isError = false) => {
    setSaveToast({ show: true, message, isError });
    window.setTimeout(() => {
      setSaveToast((prev) => (prev.show ? { ...prev, show: false } : prev));
    }, 3000);
  }, []);

  const openSaveModal = useCallback(() => {
    const sym = (result?.symbol || ticker || 'QQQ').toString().toUpperCase();
    setSaveName(`${sym} Projection - ${new Date().toLocaleDateString()}`);
    setSaveNote('');
    setSaveModalOpen(true);
  }, [result?.symbol, ticker]);

  const handleSaveProjection = useCallback(async () => {
    if (!result) return;
    const sym = (result.symbol || ticker || '').toString().trim().toUpperCase();
    const nameTrimmed = saveName.trim();
    if (!nameTrimmed) {
      showSaveToast('Please enter a name.', true);
      return;
    }
    const swingLowNum =
      result.fib_levels_dict?.['0'] != null
        ? Number(result.fib_levels_dict['0'])
        : result.swing_low != null
          ? Number(result.swing_low)
          : NaN;
    const swingHighNum =
      result.fib_levels_dict?.['1'] != null
        ? Number(result.fib_levels_dict['1'])
        : result.swing_high != null
          ? Number(result.swing_high)
          : NaN;
    const keyPhiTargets = Array.isArray(result.key_phi_targets)
      ? result.key_phi_targets.map(({ ratio, bullish, bearish }) => {
          const label =
            ratio === 0 ? 'Swing Low' : ratio === 1 ? 'Swing High' : `${ratio} ext`;
          return {
            label,
            bullish: Number(bullish),
            bearish: Number(bearish),
          };
        })
      : [];
    const phiExtensionTable = Array.isArray(result.phi_extension_levels)
      ? result.phi_extension_levels.map(({ ratio, bullish, bearish }) => ({
          ratio: Number(ratio),
          bullish: Number(bullish),
          bearish: Number(bearish),
        }))
      : [];
    const savedCurrentPrice = Number(result.current_price);
    const savedFirstTarget = Number(result.first_target ?? result.predicted_price);
    const computedPctToTarget =
      Number.isFinite(savedCurrentPrice) && savedCurrentPrice !== 0 && Number.isFinite(savedFirstTarget)
        ? (savedFirstTarget - savedCurrentPrice) / savedCurrentPrice
        : Number(result.first_target_pct ?? result.pct_change ?? 0);
    const payload = {
      ticker: sym,
      name: nameTrimmed,
      currentPrice: savedCurrentPrice,
      firstTargetPrice: savedFirstTarget,
      percentToTarget: computedPctToTarget,
      confidence: Number(result.confidence ?? 0),
      crystallineScore: Number(result.crystalline_score ?? 0),
      crystallineTrend: Number(result.trend_score ?? 0),
      crystallineVol: Number(result.vol_score ?? 0),
      crystallineRisk: Number(result.risk_score ?? 0),
      clockLatticePosition:
        result.clock_position != null ? String(result.clock_position) : '',
      swingLow: Number.isFinite(swingLowNum) ? swingLowNum : 0,
      swingHigh: Number.isFinite(swingHighNum) ? swingHighNum : 0,
      keyPhiTargets,
      phiExtensionTable,
      note: saveNote.trim() || undefined,
      // Chart snapshot — stored verbatim so the viewer can replay the full chart
      chartHistoricalDates: Array.isArray(result.historical_dates) ? result.historical_dates : [],
      chartHistoricalPrices: Array.isArray(result.historical_prices) ? result.historical_prices : [],
      chartPredictedDates: Array.isArray(result.predicted_dates) ? result.predicted_dates : [],
      chartPredictedPrices: Array.isArray(result.predicted_prices) ? result.predicted_prices : [],
      chartUpperBand: Array.isArray(result.upper_band) ? result.upper_band : null,
      chartLowerBand: Array.isArray(result.lower_band) ? result.lower_band : null,
      fibLevelsDict:
        result.fib_levels_dict && typeof result.fib_levels_dict === 'object'
          ? result.fib_levels_dict
          : null,
      // Extended summary fields
      onPrime: result.on_prime ?? null,
      piPhiResonance: result.pi_phi_resonance ?? null,
      fibAnchorDate: result.fib_anchor_date ?? null,
      fibAnchorBullish: result.fib_anchor_bullish ?? null,
      fibBullConfluence: result.fib_bull_confluence ?? null,
      fibBearConfluence: result.fib_bear_confluence ?? null,
      riskRatio: result.risk_ratio != null ? Number(result.risk_ratio) : null,
      volatilityAnnual: result.volatility_annual != null ? Number(result.volatility_annual) : null,
      summary: result.summary ?? null,
      direction: result.direction ?? null,
    };
    setSaveSubmitting(true);
    try {
      await saveProjection(payload, storageAdapter.current);
      setSaveModalOpen(false);
      showSaveToast('Projection saved successfully');
    } catch (e) {
      showSaveToast(e?.message || 'Could not save projection', true);
    } finally {
      setSaveSubmitting(false);
    }
  }, [result, ticker, saveName, saveNote, showSaveToast]);

  useEffect(() => {
    if (!saveModalOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSaveModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveModalOpen]);

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

  // Derive direction from actual price relationship, not the API direction field.
  // The API `direction` reflects the crystalline model sentiment, but the 1st target
  // price can be above current even when sentiment is bearish. The UI cards must
  // show the target relationship truthfully.
  const firstTargetNum = Number(result?.first_target ?? result?.predicted_price);
  const currentPriceNum = Number(result?.current_price);
  const directionUp =
    Number.isFinite(firstTargetNum) && Number.isFinite(currentPriceNum)
      ? firstTargetNum >= currentPriceNum
      : result?.direction === 'bullish';

  const containerCls = embedded
    ? 'w-full max-w-[1800px] mx-auto px-0 flex flex-col h-full min-h-0 overflow-y-auto'
    : 'w-full max-w-[1800px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-y-auto';

  return (
    <div className={containerCls}>
      {saveToast.show && (
        <div
          className={`fixed top-4 right-4 z-[250] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            saveToast.isError
              ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
              : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
          }`}
          role="status"
        >
          {saveToast.message}
        </div>
      )}
      {saveModalOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-projection-title"
          onClick={(e) => e.target === e.currentTarget && !saveSubmitting && setSaveModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="save-projection-title"
              className="text-lg font-semibold text-gray-900 dark:text-white mb-3"
            >
              Save projection
            </h2>
            <label htmlFor="save-projection-name" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Name
            </label>
            <input
              id="save-projection-name"
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="w-full rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <label htmlFor="save-projection-note" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Note (optional)
            </label>
            <textarea
              id="save-projection-note"
              value={saveNote}
              onChange={(e) => setSaveNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white px-3 py-2 text-sm mb-4 focus:ring-2 focus:ring-emerald-500 outline-none resize-y"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={saveSubmitting}
                onClick={() => setSaveModalOpen(false)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveSubmitting}
                onClick={() => handleSaveProjection()}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-500 text-white text-sm font-semibold px-4 py-2"
              >
                {saveSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
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
              1H weekly projection · clock lattice · Fibonacci · phi targets (Mon–Fri, EST).
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
            1st Target
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            {result ? formatCurrency(result.first_target ?? result.predicted_price) : '—'}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {result ? (directionUp ? 'Swing High' : 'Swing Low') : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            To 1st Target
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
              {result
                ? formatPercentFromFraction(
                    Number.isFinite(currentPriceNum) && currentPriceNum !== 0 && Number.isFinite(firstTargetNum)
                      ? (firstTargetNum - currentPriceNum) / currentPriceNum
                      : (result.first_target_pct ?? result.pct_change)
                  )
                : '—'}
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

      {result?.key_phi_targets && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 mb-4 flex-shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Key Price Targets — 1H Phi Extensions
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {result.key_phi_targets.map(({ ratio, bullish, bearish }) => {
              const isAnchor = ratio === 0 || ratio === 1;
              const label = ratio === 0 ? 'Swing Low' : ratio === 1 ? 'Swing High' : `${ratio} ext`;
              return (
                <div
                  key={ratio}
                  className={`rounded-lg border p-2.5 flex flex-col gap-1 ${
                    isAnchor
                      ? 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60'
                  }`}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                    isAnchor ? 'text-sky-500 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {label}
                  </span>
                  <span className="text-sm font-bold text-emerald-500 tabular-nums font-mono">
                    {formatCurrency(bullish)}
                  </span>
                  <span className="text-sm font-bold text-red-500 tabular-nums font-mono">
                    {formatCurrency(bearish)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-2">
            Swing Low (0.0) and Swing High (1.0) are OHLC anchors · Green = bullish (low + ratio × range) · Red = bearish (low − ratio × range)
          </p>
        </section>
      )}

      <ProjectionChart
        chartData={chartData}
        fibLevelsDict={result?.fib_levels_dict}
        phiExtensionLevels={result?.phi_extension_levels}
        ticker={result ? (result.symbol || ticker.toUpperCase()) : '—'}
        loading={loading}
        directionUp={directionUp}
      />

      <div className="flex-shrink-0">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 w-full flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Summary
            </h2>
            <form className="flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
              <input
                id="ticker"
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                maxLength={20}
                autoComplete="off"
                className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 px-3 py-2 text-sm w-36 focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-sky-400 dark:focus:border-sky-500 outline-none"
                placeholder="e.g. QQQ, AAPL"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-sky-400 text-white text-sm font-semibold py-2 px-4 transition-colors whitespace-nowrap"
              >
                {loading ? 'Running…' : 'Run Prediction'}
              </button>
              <button
                type="button"
                disabled={!result || loading}
                onClick={openSaveModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white text-sm font-semibold py-2 px-4 transition-colors whitespace-nowrap"
              >
                <Save className="w-4 h-4 shrink-0" aria-hidden />
                Save Projection
              </button>
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
            {result ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs flex-1 min-h-0">

                {/* Column 1 — combined model metrics card */}
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 p-3 flex flex-col gap-3">

                  {/* Crystalline Score */}
                  <div>
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      Crystalline Score
                    </p>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-bold text-gray-900 dark:text-white tabular-nums">
                        {result.crystalline_score ?? '—'}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">(range −4 to +4)</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-1">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: result.crystalline_score != null
                            ? `${Math.max(0, Math.min(100, ((result.crystalline_score + 4) / 8) * 100))}%`
                            : '50%',
                          background: result.crystalline_score != null && result.crystalline_score < 0 ? '#ef4444' : '#22c55e',
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Trend: <span className="text-gray-800 dark:text-gray-200">{result.trend_score ?? '—'}</span>
                      {' '}· Vol: <span className="text-gray-800 dark:text-gray-200">{result.vol_score ?? '—'}</span>
                      {' '}· Risk: <span className="text-gray-800 dark:text-gray-200">{result.risk_score ?? '—'}</span>
                    </p>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700" />

                  {/* Clock Lattice */}
                  <div>
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      Clock Lattice
                    </p>
                    <div className="flex flex-col gap-0.5">
                      <span>
                        Position:{' '}
                        <strong className="tabular-nums text-gray-900 dark:text-white">
                          {result.clock_position ?? '—'}
                        </strong>{' '}/ 11
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {result.on_prime ? 'Prime-aligned (3, 6, 9)' : 'Not prime-aligned'}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {result.pi_phi_resonance ? 'π×φ resonance active' : 'No π×φ resonance'}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700" />

                  {/* Fibonacci Levels — yearly first-candle anchor */}
                  <div>
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      Fibonacci Levels
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">
                      Anchor: {result.fib_anchor_date || '—'} ·{' '}
                      {result.fib_anchor_bullish == null
                        ? '—'
                        : result.fib_anchor_bullish
                        ? 'Bullish first candle'
                        : 'Bearish first candle'}
                    </p>
                    <div className="space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Swing High (1.0)</span>
                        <span className="font-mono tabular-nums text-gray-900 dark:text-white">
                          {result.fib_levels_dict?.['1'] != null
                            ? formatCurrency(result.fib_levels_dict['1'])
                            : result.swing_high != null
                            ? formatCurrency(result.swing_high)
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">0.786 (OTE)</span>
                        <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400">
                          {result.fib_levels_dict?.['0.786'] != null
                            ? formatCurrency(result.fib_levels_dict['0.786'])
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">0.618 (OTE)</span>
                        <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400">
                          {result.fib_levels_dict?.['0.618'] != null
                            ? formatCurrency(result.fib_levels_dict['0.618'])
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">0.5 (Eq)</span>
                        <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
                          {result.fib_levels_dict?.['0.5'] != null
                            ? formatCurrency(result.fib_levels_dict['0.5'])
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">0.382</span>
                        <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
                          {result.fib_levels_dict?.['0.382'] != null
                            ? formatCurrency(result.fib_levels_dict['0.382'])
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Swing Low (0.0)</span>
                        <span className="font-mono tabular-nums text-gray-900 dark:text-white">
                          {result.fib_levels_dict?.['0'] != null
                            ? formatCurrency(result.fib_levels_dict['0'])
                            : result.swing_low != null
                            ? formatCurrency(result.swing_low)
                            : '—'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-0.5">
                        Confluence:{' '}
                        {result.fib_bull_confluence || result.fib_bear_confluence
                          ? [
                              result.fib_bull_confluence ? 'Bull' : null,
                              result.fib_bear_confluence ? 'Bear' : null,
                            ].filter(Boolean).join(' & ')
                          : 'None'}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700" />

                  {/* Risk Metrics */}
                  <div>
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      Risk Metrics
                    </p>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Risk ratio</span>
                        <span className="font-mono tabular-nums text-gray-900 dark:text-white">
                          {result.risk_ratio != null ? Number(result.risk_ratio).toFixed(4) : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Ann. volatility</span>
                        <span className="font-mono tabular-nums text-gray-900 dark:text-white">
                          {result.volatility_annual != null
                            ? `${(result.volatility_annual * 100).toFixed(2)}%`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700" />

                  {/* Model summary text */}
                  <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                    {result.summary || '—'}
                  </p>
                </div>

                {/* Column 2 — Phi Extension Targets */}
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80 p-3 flex flex-col">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Phi Extension Targets
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
                    Anchor: 0.0 = swing low · 1.0 = swing high
                  </p>
                  <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] font-mono mb-1 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-1">
                    <span>Ratio</span>
                    <span className="text-right text-emerald-600 dark:text-emerald-400">↑ Bullish</span>
                    <span className="text-right text-red-500 dark:text-red-400">↓ Bearish</span>
                  </div>
                  <div className="flex-1 space-y-0.5">
                    {(result.phi_extension_levels || []).map(({ ratio, bullish, bearish }) => {
                      const isKey = [0, 1, 1.382, 2.382, 3.382, 4.24, 5.08].includes(ratio);
                      return (
                        <div
                          key={ratio}
                          className={`grid grid-cols-3 gap-x-2 text-[11px] font-mono rounded px-1 ${
                            isKey
                              ? 'bg-sky-50 dark:bg-sky-900/20 text-sky-900 dark:text-sky-100'
                              : ''
                          }`}
                        >
                          <span className={isKey ? 'font-bold' : 'text-gray-500 dark:text-gray-400'}>
                            {ratio.toFixed(3)}
                          </span>
                          <span className="text-right text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {formatCurrency(bullish)}
                          </span>
                          <span className="text-right text-red-500 dark:text-red-400 tabular-nums">
                            {formatCurrency(bearish)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-2 border-t border-gray-200 dark:border-gray-700 pt-1.5">
                    Highlighted rows = key targets (1.382, 2.382, 3.382, 4.24, 5.08)
                  </p>
                </div>
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
  );
}

export default Projection;

