import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

const PROJECTION_LOAD_AS_NEW_KEY = 'projectionLoadAsNewTicker';

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
      data.push({
        date: historicalDates[i],
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

function SavedProjectionChart({ chartData, hasChart, fibLevelsDict, phiExtensionLevels, ticker, directionUp }) {
  const phiLevels = Array.isArray(phiExtensionLevels) ? phiExtensionLevels : [];
  const [baseYMin, baseYMax] = hasChart ? computeYDomain(chartData, fibLevelsDict) : [0, 100];

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

  const clampedData = hasChart
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
      allRefLines.push({ key: `phi-b-${ratio}`, price: bullish, stroke: '#22c55e', dash: '3 3', width: 1, opacity: 0.5, label: `${tag} ↑`, labelFill: '#22c55e', priority: 0 });
    }
    if (Number.isFinite(bearish) && bearish >= yMin && bearish <= yMax) {
      allRefLines.push({ key: `phi-r-${ratio}`, price: bearish, stroke: '#ef4444', dash: '3 3', width: 1, opacity: 0.5, label: `${tag} ↓`, labelFill: '#ef4444', priority: 0 });
    }
  }

  const visibleRefLines = dedupeRefLabels(allRefLines, labelMinGap);

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 mb-6 flex-shrink-0" aria-label="Saved projection chart">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Historical & Forecast
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
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{ticker || '—'}</span>
        </div>
      </div>
      <div className="h-80" ref={chartContainerRef}>
        {hasChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={clampedData} margin={{ top: 8, right: 80, left: 8, bottom: 24 }}>
              <defs>
                <linearGradient id="savedHistGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={histColor} stopOpacity={0.12} />
                  <stop offset="80%" stopColor={histColor} stopOpacity={0.02} />
                  <stop offset="100%" stopColor={histColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} minTickGap={60} tickFormatter={shortenDateLabel} />
              <YAxis domain={[yMin, yMax]} allowDataOverflow tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => v != null && Number.isFinite(v) ? `$${v.toFixed(2)}` : ''} width={72} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.85)', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}
                formatter={(v, name) => {
                  if (v == null) return [null, null];
                  const label = name === 'historical' ? 'Price' : name === 'predicted' ? 'Forecast' : name === 'upperClamped' ? 'Upper band' : name === 'lowerClamped' ? 'Lower band' : name;
                  return [formatCurrency(v), label];
                }}
                labelFormatter={(label) => label}
              />
              {visibleRefLines.map((line) => (
                <ReferenceLine key={line.key} y={line.price} stroke={line.stroke} strokeDasharray={line.dash} strokeWidth={line.width} strokeOpacity={line.opacity} label={{ value: line.label, position: 'right', fontSize: 8, fill: line.labelFill }} />
              ))}
              <Area type="monotone" dataKey="upperClamped" stroke="transparent" fill="rgba(251, 191, 36, 0.08)" activeDot={false} dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="lowerClamped" stroke="transparent" fill="rgba(251, 191, 36, 0.08)" activeDot={false} dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="historical" stroke={histColor} strokeWidth={2} fill="url(#savedHistGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: histColor }} isAnimationActive={false} />
              <Area type="monotone" dataKey="predicted" stroke="#f97316" strokeWidth={2.5} strokeDasharray="6 4" fill="transparent" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#f97316' }} isAnimationActive={false} />
              <Brush dataKey="date" height={10} stroke="#6366f1" fill="rgba(99,102,241,0.03)" tickFormatter={shortenDateLabel} travellerWidth={6} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-200 dark:border-gray-600">
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-4">
              Chart data not available for this saved projection.
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-500">
        Read-only snapshot · All dates shown in Eastern Time (America/New_York).
      </p>
    </section>
  );
}

function ReadOnlyProjectionViewer({ projection, savedDateLabel, onBack, onDelete }) {
  const navigate = useNavigate();
  const ticker = String(projection.ticker || '').toUpperCase();

  const savedCurrent = Number(projection.currentPrice);
  const savedTarget = Number(projection.firstTargetPrice);
  const directionUp =
    Number.isFinite(savedCurrent) && Number.isFinite(savedTarget)
      ? savedTarget >= savedCurrent
      : Number(projection.percentToTarget) >= 0;

  const displayPctToTarget =
    Number.isFinite(savedCurrent) && savedCurrent !== 0 && Number.isFinite(savedTarget)
      ? (savedTarget - savedCurrent) / savedCurrent
      : Number(projection.percentToTarget);

  const handleLoadAsNew = () => {
    try {
      if (ticker) sessionStorage.setItem(PROJECTION_LOAD_AS_NEW_KEY, ticker);
    } catch { /* ignore */ }
    navigate('/projection');
  };

  const keyPhiTargets = Array.isArray(projection.keyPhiTargets) ? projection.keyPhiTargets : [];
  const phiExtensionTable = Array.isArray(projection.phiExtensionTable) ? projection.phiExtensionTable : [];

  const chartData = buildChartData(
    projection.chartHistoricalDates,
    projection.chartHistoricalPrices,
    projection.chartPredictedDates,
    projection.chartPredictedPrices,
    projection.chartUpperBand,
    projection.chartLowerBand,
  );
  const hasChart = chartData.length > 0;

  const fibLevelsDict =
    projection.fibLevelsDict && typeof projection.fibLevelsDict === 'object'
      ? projection.fibLevelsDict
      : null;

  return (
    <div className="w-full max-w-[1800px] mx-auto px-0 flex flex-col h-full min-h-0 overflow-y-auto">

      {/* ─── Action bar ─── */}
      <div className="flex flex-wrap items-center gap-2 mb-6 flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {projection.name || ticker || 'Saved Projection'}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Saved {savedDateLabel} · {ticker}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLoadAsNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold py-2 px-4 transition-colors whitespace-nowrap"
        >
          Run New
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 px-4 transition-colors whitespace-nowrap"
        >
          Delete
        </button>
      </div>

      {/* ─── Stat cards ─── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 flex-shrink-0">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Current Price
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
            {formatCurrency(projection.currentPrice)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            1st Target
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
            {formatCurrency(projection.firstTargetPrice)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {directionUp ? 'Swing High' : 'Swing Low'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            To 1st Target
          </p>
          <p className={`text-xl font-bold tabular-nums flex items-center gap-1.5 ${directionUp ? 'text-emerald-500' : 'text-red-500'}`}>
            <span className="text-base">{directionUp ? '↑' : '↓'}</span>
            <span>{formatPercentFromFraction(displayPctToTarget)}</span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Confidence
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums mb-1.5">
            {projection.confidence != null ? `${projection.confidence}%` : '—'}
          </p>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-700"
              style={{ width: projection.confidence != null ? `${Math.min(100, Number(projection.confidence))}%` : '0%' }}
            />
          </div>
        </div>
      </section>

      {/* ─── Chart ─── */}
      <SavedProjectionChart
        chartData={chartData}
        hasChart={hasChart}
        fibLevelsDict={fibLevelsDict}
        phiExtensionLevels={phiExtensionTable}
        ticker={ticker}
        directionUp={directionUp}
      />

      {/* ─── Key Price Targets ─── */}
      {keyPhiTargets.length > 0 && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 mb-6 flex-shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Key Price Targets — 1H Phi Extensions
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {keyPhiTargets.map((row, idx) => {
              const label = row.label != null ? String(row.label) : `Target ${idx}`;
              const isAnchor = label.includes('Swing');
              return (
                <div
                  key={`${label}-${idx}`}
                  className={`rounded-lg border p-2.5 flex flex-col gap-1 ${
                    isAnchor
                      ? 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60'
                  }`}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${isAnchor ? 'text-sky-500 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {label}
                  </span>
                  <span className="text-sm font-bold text-emerald-500 tabular-nums font-mono">
                    {formatCurrency(row.bullish)}
                  </span>
                  <span className="text-sm font-bold text-red-500 tabular-nums font-mono">
                    {formatCurrency(row.bearish)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Details: Model metrics + Phi table ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 flex-shrink-0">

        {/* Left — Model metrics */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 flex flex-col gap-4 text-xs">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Model Summary
          </h3>

          {/* Crystalline Score */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Crystalline Score</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                {projection.crystallineScore ?? '—'}
                <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500 ml-1">/&nbsp;±4</span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: projection.crystallineScore != null
                    ? `${Math.max(0, Math.min(100, ((Number(projection.crystallineScore) + 4) / 8) * 100))}%`
                    : '50%',
                  background: projection.crystallineScore != null && Number(projection.crystallineScore) < 0 ? '#ef4444' : '#22c55e',
                }}
              />
            </div>
            <div className="flex gap-4 text-[11px] text-gray-500 dark:text-gray-400">
              <span>Trend: <span className="text-gray-800 dark:text-gray-200 font-medium">{projection.crystallineTrend ?? '—'}</span></span>
              <span>Vol: <span className="text-gray-800 dark:text-gray-200 font-medium">{projection.crystallineVol ?? '—'}</span></span>
              <span>Risk: <span className="text-gray-800 dark:text-gray-200 font-medium">{projection.crystallineRisk ?? '—'}</span></span>
            </div>
          </div>

          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Clock Lattice */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Clock Position</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                {projection.clockLatticePosition ?? '—'} <span className="text-[10px] font-normal text-gray-400">/ 11</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Prime</p>
              <p className={`text-sm font-semibold ${projection.onPrime ? 'text-emerald-500' : 'text-gray-400 dark:text-gray-500'}`}>
                {projection.onPrime ? 'Aligned' : 'No'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">π×φ Resonance</p>
              <p className={`text-sm font-semibold ${projection.piPhiResonance ? 'text-emerald-500' : 'text-gray-400 dark:text-gray-500'}`}>
                {projection.piPhiResonance ? 'Active' : 'No'}
              </p>
            </div>
          </div>

          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Risk Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Risk Ratio</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white font-mono tabular-nums">
                {projection.riskRatio != null ? Number(projection.riskRatio).toFixed(4) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Ann. Volatility</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white font-mono tabular-nums">
                {projection.volatilityAnnual != null ? `${(Number(projection.volatilityAnnual) * 100).toFixed(2)}%` : '—'}
              </p>
            </div>
          </div>

          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Fibonacci Levels */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Fibonacci Levels</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {projection.fibAnchorDate || '—'} · {projection.fibAnchorBullish == null ? '—' : projection.fibAnchorBullish ? 'Bullish' : 'Bearish'} anchor
              </span>
            </div>
            <div className="space-y-1">
              {[
                { label: 'Swing High (1.0)', key: '1', fallback: projection.swingHigh, accent: false },
                { label: '0.786 (OTE)', key: '0.786', fallback: null, accent: true },
                { label: '0.618 (OTE)', key: '0.618', fallback: null, accent: true },
                { label: '0.5 (Eq)', key: '0.5', fallback: null, accent: false },
                { label: '0.382', key: '0.382', fallback: null, accent: false },
                { label: 'Swing Low (0.0)', key: '0', fallback: projection.swingLow, accent: false },
              ].map(({ label, key, fallback, accent }) => (
                <div key={key} className="flex items-center justify-between py-0.5">
                  <span className="text-gray-500 dark:text-gray-400">{label}</span>
                  <span className={`font-mono tabular-nums ${accent ? 'text-sky-600 dark:text-sky-400 font-semibold' : 'text-gray-900 dark:text-white'}`}>
                    {fibLevelsDict?.[key] != null
                      ? formatCurrency(fibLevelsDict[key])
                      : fallback != null ? formatCurrency(fallback) : '—'}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
              Confluence: {projection.fibBullConfluence || projection.fibBearConfluence
                ? [projection.fibBullConfluence ? 'Bull' : null, projection.fibBearConfluence ? 'Bear' : null].filter(Boolean).join(' & ')
                : 'None'}
            </p>
          </div>

          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Summary text */}
          <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
            {projection.summary || '—'}
          </p>

          {projection.note ? (
            <>
              <hr className="border-gray-100 dark:border-gray-800" />
              <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                <span className="font-semibold text-gray-500 dark:text-gray-400">Note: </span>
                {String(projection.note)}
              </p>
            </>
          ) : null}
        </div>

        {/* Right — Phi Extension Targets */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 flex flex-col text-xs">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Phi Extension Targets
          </h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">
            0.0 = swing low · 1.0 = swing high
          </p>
          <div className="grid grid-cols-3 gap-x-3 text-[11px] font-mono text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-1.5 mb-1">
            <span className="font-semibold">Ratio</span>
            <span className="text-right font-semibold text-emerald-600 dark:text-emerald-400">↑ Bullish</span>
            <span className="text-right font-semibold text-red-500 dark:text-red-400">↓ Bearish</span>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto">
            {phiExtensionTable.map((row, rowIdx) => {
              const ratio = Number(row.ratio);
              const isKey = [0, 1, 1.382, 2.382, 3.382, 4.24, 5.08].includes(ratio);
              return (
                <div
                  key={`phi-${rowIdx}-${ratio}`}
                  className={`grid grid-cols-3 gap-x-3 text-[11px] font-mono rounded px-1.5 py-0.5 ${
                    isKey ? 'bg-sky-50 dark:bg-sky-900/20 text-sky-900 dark:text-sky-100' : ''
                  }`}
                >
                  <span className={isKey ? 'font-bold' : 'text-gray-500 dark:text-gray-400'}>
                    {Number.isFinite(ratio) ? ratio.toFixed(3) : '—'}
                  </span>
                  <span className="text-right text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(row.bullish)}
                  </span>
                  <span className="text-right text-red-500 dark:text-red-400 tabular-nums">
                    {formatCurrency(row.bearish)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3 border-t border-gray-200 dark:border-gray-700 pt-2">
            Highlighted rows = key targets (1.382, 2.382, 3.382, 4.24, 5.08)
          </p>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center pb-4 flex-shrink-0">
        Not financial advice. For educational and research purposes only.
      </p>
    </div>
  );
}

export default ReadOnlyProjectionViewer;
