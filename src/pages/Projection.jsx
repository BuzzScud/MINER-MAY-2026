import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Save, Eye, EyeOff, ChevronUp, ChevronDown, Trash2, BarChart3, ZoomIn, ZoomOut, Maximize2, MoveVertical } from 'lucide-react';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { saveProjection } from '../services/projectionService';
import SavedProjectionsList from '../components/SavedProjectionsList';
import {
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  ReferenceLine,
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
 * Build merged chart data and metadata from projectionRuns and layers (visible only).
 * Returns { chartData, fibLevelsDict, phiExtensionLevels, primaryRun, directionUp }.
 */
function buildMergedChartData(projectionRuns, layers) {
  const visibleLayers = layers.filter((l) => l.visible);
  const primaryRun = projectionRuns.length > 0 ? projectionRuns[projectionRuns.length - 1] : null;
  if (!primaryRun) {
    return { chartData: [], fibLevelsDict: null, phiExtensionLevels: [], primaryRun: null, directionUp: true };
  }

  const dateSet = new Set();
  const histDates = primaryRun.result.historical_dates || [];
  const histPrices = primaryRun.result.historical_prices || [];
  histDates.forEach((d) => dateSet.add(d));
  (primaryRun.result.predicted_dates || []).forEach((d) => dateSet.add(d));

  const runsById = new Map(projectionRuns.map((r) => [r.id, r]));
  visibleLayers.filter((l) => l.type === 'projection').forEach((layer) => {
    const run = runsById.get(layer.id);
    if (run?.result?.predicted_dates) run.result.predicted_dates.forEach((d) => dateSet.add(d));
  });

  const allDates = Array.from(dateSet).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );

  const primaryHistMap = new Map();
  for (let i = 0; i < histDates.length; i += 1) {
    primaryHistMap.set(histDates[i], histPrices[i]);
  }

  const chartData = allDates.map((date) => {
    const row = { date };
    row.historical = primaryHistMap.get(date) ?? null;
    visibleLayers.forEach((layer) => {
      if (layer.type !== 'projection') return;
      const run = runsById.get(layer.id);
      if (!run?.result) return;
      const r = run.result;
      const predDates = r.predicted_dates || [];
      const predPrices = r.predicted_prices || [];
      const upper = r.upper_band || [];
      const lower = r.lower_band || [];
      const histDatesRun = r.historical_dates || [];
      const histPricesRun = r.historical_prices || [];
      const predIdx = predDates.indexOf(date);
      if (predIdx >= 0) {
        row[layer.id] = predPrices[predIdx] ?? null;
        row[`${layer.id}_upper`] = upper[predIdx] ?? null;
        row[`${layer.id}_lower`] = lower[predIdx] ?? null;
      } else {
        const histIdx = histDatesRun.indexOf(date);
        if (histIdx >= 0) {
          row[layer.id] = histPricesRun[histIdx] ?? null;
          row[`${layer.id}_upper`] = null;
          row[`${layer.id}_lower`] = null;
        }
      }
    });
    return row;
  });

  const firstTargetNum = Number(primaryRun.result.first_target ?? primaryRun.result.predicted_price);
  const currentPriceNum = Number(primaryRun.result.current_price);
  const directionUp =
    Number.isFinite(firstTargetNum) && Number.isFinite(currentPriceNum)
      ? firstTargetNum >= currentPriceNum
      : primaryRun.result.direction === 'bullish';

  return {
    chartData,
    fibLevelsDict: primaryRun.result.fib_levels_dict ?? null,
    phiExtensionLevels: primaryRun.result.phi_extension_levels || [],
    primaryRun,
    directionUp,
  };
}

function computeYDomainFromMerged(chartData, fibLevelsDict, projectionRunIds) {
  const prices = [];
  for (const pt of chartData) {
    if (pt.historical != null && Number.isFinite(pt.historical)) prices.push(pt.historical);
    for (const id of projectionRunIds) {
      const v = pt[id];
      if (v != null && Number.isFinite(v)) prices.push(v);
    }
  }
  if (prices.length === 0) return [0, 100];
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  const range = hi - lo || 1;

  if (fibLevelsDict && typeof fibLevelsDict === 'object') {
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

function formatLayerTime(isoString) {
  if (!isoString || typeof isoString !== 'string') return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
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

const ZOOM_FACTOR = 0.15;
const MIN_Y_RANGE = 0.5;
const X_ZOOM_STEP_FRAC = 0.15;

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

function LayerPanel({ layers, projectionRuns, onMoveUp, onMoveDown, onToggleVisibility, onRemoveLayer }) {
  const runsById = new Map((projectionRuns || []).map((r) => [r.id, r]));

  if (!layers.length) {
    return (
      <section
        className="flex-shrink-0 w-full sm:w-72 p-4 flex items-center justify-center rounded-r-xl border-l border-gray-200 dark:border-gray-700 min-h-[120px]"
        aria-label="Chart layers"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Run a prediction to add layers.
        </p>
      </section>
    );
  }

  const historicalLayers = layers.filter((l) => l.type === 'historical');
  const projectionLayers = layers.filter((l) => l.type === 'projection');

  const layerRow = (layer, index, isFirst, isLast) => {
    const run = runsById.get(layer.id);
    const borderColor = layer.type === 'historical' ? '#64748b' : layer.color || '#f97316';
    return (
      <div
        key={layer.id}
        className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg transition-colors ${
          layer.visible ? 'bg-gray-50/80 dark:bg-gray-800/50' : 'opacity-50'
        } hover:bg-gray-100 dark:hover:bg-gray-800/70`}
      >
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: borderColor }}
        />
        <button
          type="button"
          onClick={() => onToggleVisibility(layer.id)}
          className="p-0.5 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex-shrink-0"
          aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
        >
          {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-60" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-gray-900 dark:text-white whitespace-nowrap">
              {layer.label}
            </span>
            {layer.type === 'projection' && run && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                {run.ticker} · {formatLayerTime(run.timestamp)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0 flex-shrink-0">
          <button
            type="button"
            onClick={() => onMoveUp(layer.id)}
            disabled={isFirst}
            className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 dark:text-gray-500 dark:hover:text-gray-200"
            aria-label="Move layer up"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(layer.id)}
            disabled={isLast}
            className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 dark:text-gray-500 dark:hover:text-gray-200"
            aria-label="Move layer down"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          {layer.type === 'projection' && onRemoveLayer && (
            <button
              type="button"
              onClick={() => onRemoveLayer(layer.id)}
              className="p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 ml-0.5"
              aria-label="Remove layer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section
      className="flex-shrink-0 w-full sm:w-72 flex flex-col border-l border-gray-200 dark:border-gray-700 overflow-hidden rounded-r-xl"
      aria-label="Chart layers"
    >
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Layers
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {historicalLayers.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 px-2 mb-1">
              Real price
            </p>
            {historicalLayers.map((layer, i) =>
              layerRow(layer, i, i === 0, i === historicalLayers.length - 1 && projectionLayers.length === 0),
            )}
          </div>
        )}
        {projectionLayers.length > 0 && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 px-2 mb-1">
              Projections
            </p>
            {projectionLayers.map((layer, i) =>
              layerRow(
                layer,
                historicalLayers.length + i,
                false,
                i === projectionLayers.length - 1,
              ),
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          Bottom → Top: first draws under.
        </p>
      </div>
    </section>
  );
}

const DRAG_THRESHOLD_PX = 3;
const X_ZOOM_MIN_POINTS = 5;
const PAN_Y_STEP = 0.05;

function ProjectionChart({ projectionRuns, layers, ticker, loading }) {
  const merged = buildMergedChartData(projectionRuns, layers);
  const {
    chartData: rawChartData,
    fibLevelsDict,
    phiExtensionLevels,
    primaryRun,
    directionUp,
  } = merged;
  const hasData = rawChartData.length > 0;
  const totalPoints = rawChartData.length;
  const visibleProjectionIds = layers
    .filter((l) => l.visible && l.type === 'projection')
    .map((l) => l.id);
  const visibleProjectionIdsKey = visibleProjectionIds.join(',');
  const [baseYMin, baseYMax] = hasData
    ? computeYDomainFromMerged(rawChartData, fibLevelsDict, visibleProjectionIds)
    : [0, 100];

  const initialXEnd = Math.max(0, totalPoints - 1);
  const [yDomain, setYDomain] = useState([baseYMin, baseYMax]);
  const [xRange, setXRange] = useState([0, initialXEnd]);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipHidden, setTooltipHidden] = useState(false);
  const chartContainerRef = useRef(null);
  const dragRef = useRef(null);
  const dragLatestEventRef = useRef(null);
  const dragMoveRafRef = useRef(null);
  const wheelRafRef = useRef(null);
  const pendingWheelEventRef = useRef(null);

  const xRangeRef = useRef([0, initialXEnd]);
  const yDomainRef = useRef([baseYMin, baseYMax]);
  const totalPointsRef = useRef(totalPoints);
  const yExplicitlyZoomedRef = useRef(false);
  const rawChartDataRef = useRef(rawChartData);
  const fibLevelsDictRef = useRef(fibLevelsDict);
  const visibleProjectionIdsRef = useRef(visibleProjectionIds);

  rawChartDataRef.current = rawChartData;
  fibLevelsDictRef.current = fibLevelsDict;
  visibleProjectionIdsRef.current = visibleProjectionIds;
  totalPointsRef.current = totalPoints;

  const [xStart, xEnd] = xRange;
  const [yMin, yMax] = yDomain;
  const xSpan = xEnd - xStart;
  const isFullRange = xStart === 0 && xEnd >= totalPoints - 1;

  useEffect(() => {
    const yd = [baseYMin, baseYMax];
    const end = Math.max(0, totalPoints - 1);
    const xr = [0, end];
    yExplicitlyZoomedRef.current = false;
    yDomainRef.current = yd;
    xRangeRef.current = xr;
    setYDomain(yd);
    setXRange(xr);
    setIsZoomed(false);
  }, [baseYMin, baseYMax, totalPoints]);

  useEffect(() => {
    if (!hasData || totalPoints < 1) return;
    if (yExplicitlyZoomedRef.current) return;
    const slice = rawChartDataRef.current.slice(xStart, xEnd + 1);
    const [lo, hi] = computeYDomainFromMerged(
      slice,
      fibLevelsDictRef.current,
      visibleProjectionIdsRef.current,
    );
    const [curLo, curHi] = yDomainRef.current;
    if (Math.abs(lo - curLo) < 1e-6 && Math.abs(hi - curHi) < 1e-6) return;
    yDomainRef.current = [lo, hi];
    setYDomain([lo, hi]);
  }, [xStart, xEnd, hasData, totalPoints, visibleProjectionIdsKey]);

  const applyXRange = useCallback((s, e) => {
    const tp = totalPointsRef.current;
    if (tp < 1) return;
    const clamped_s = Math.max(0, Math.round(s));
    const clamped_e = Math.min(tp - 1, Math.round(e));
    const span = clamped_e - clamped_s;
    if (span < X_ZOOM_MIN_POINTS - 1) return;
    const next = [clamped_s, clamped_e];
    xRangeRef.current = next;
    setXRange(next);
  }, []);

  const processWheelEvent = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY;
    const [xrS, xrE] = xRangeRef.current;
    const [ymn, ymx] = yDomainRef.current;
    const tp = totalPointsRef.current;
    const curSpan = xrE - xrS;
    const yRange = ymx - ymn;

    if (e.ctrlKey || e.metaKey) {
      const step = Math.max(1, Math.round(curSpan * X_ZOOM_STEP_FRAC));
      if (delta > 0) {
        const newS = Math.max(0, xrS - step);
        const newE = Math.min(tp - 1, xrE + step);
        applyXRange(newS, newE);
      } else if (curSpan > X_ZOOM_MIN_POINTS) {
        applyXRange(xrS + step, xrE - step);
      }
      setIsZoomed(true);
      return;
    }

    if (e.shiftKey) {
      const step = Math.max(1, Math.round(curSpan * X_ZOOM_STEP_FRAC));
      if (delta > 0) {
        const shift = Math.min(step, tp - 1 - xrE);
        applyXRange(xrS + shift, xrE + shift);
      } else {
        const shift = Math.min(step, xrS);
        applyXRange(xrS - shift, xrE - shift);
      }
      setIsZoomed(true);
      return;
    }

    if (yRange < MIN_Y_RANGE && delta < 0) return;
    yExplicitlyZoomedRef.current = true;
    const rect = chartContainerRef.current?.getBoundingClientRect();
    let cursorFrac = 0.5;
    if (rect && rect.height > 0) {
      cursorFrac = 1 - (e.clientY - rect.top) / rect.height;
      cursorFrac = Math.max(0.05, Math.min(0.95, cursorFrac));
    }
    const anchor = ymn + cursorFrac * yRange;
    const zoomAmt = yRange * ZOOM_FACTOR * (delta > 0 ? 1 : -1);
    const newRange = yRange - zoomAmt;
    if (newRange < MIN_Y_RANGE) return;
    const nextY = [anchor - cursorFrac * newRange, anchor + (1 - cursorFrac) * newRange];
    yDomainRef.current = nextY;
    setYDomain(nextY);
    setIsZoomed(true);
  }, [applyXRange]);

  const wheelHandlerRef = useRef(processWheelEvent);
  wheelHandlerRef.current = processWheelEvent;

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const listener = (ev) => {
      pendingWheelEventRef.current = ev;
      if (wheelRafRef.current != null) return;
      wheelRafRef.current = requestAnimationFrame(() => {
        wheelRafRef.current = null;
        const we = pendingWheelEventRef.current;
        pendingWheelEventRef.current = null;
        if (we) wheelHandlerRef.current(we);
      });
    };
    el.addEventListener('wheel', listener, { passive: false });
    return () => {
      if (wheelRafRef.current != null) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }
      el.removeEventListener('wheel', listener);
    };
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      if (!hasData || e.button !== 0) return;
      const [xs, xe] = xRangeRef.current;
      const [ymn, ymx] = yDomainRef.current;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        yMin: ymn,
        yMax: ymx,
        xStart: xs,
        xEnd: xe,
        activated: false,
      };
    },
    [hasData],
  );

  const runDragFrame = useCallback(() => {
    const e = dragLatestEventRef.current;
    const d = dragRef.current;
    if (!e || !d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.activated && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    d.activated = true;
    yExplicitlyZoomedRef.current = true;
    setIsDragging(true);

    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;

    const yRange = d.yMax - d.yMin;
    const panY = (dy / rect.height) * yRange;
    const nextY = [d.yMin + panY, d.yMax + panY];
    yDomainRef.current = nextY;
    setYDomain(nextY);

    const tp = totalPointsRef.current;
    const currentSpan = d.xEnd - d.xStart;
    const chartWidth = Math.max(1, rect.width - 80);
    const panFrac = -dx / chartWidth;
    const panPoints = panFrac * currentSpan;
    let newS = d.xStart + panPoints;
    let newE = d.xEnd + panPoints;
    if (newS < 0) {
      newE -= newS;
      newS = 0;
    }
    if (newE > tp - 1) {
      newS -= newE - (tp - 1);
      newE = tp - 1;
    }
    const nextX = [Math.max(0, Math.round(newS)), Math.min(tp - 1, Math.round(newE))];
    xRangeRef.current = nextX;
    setXRange(nextX);
    setIsZoomed(true);
  }, []);

  const dragMoveHandlerRef = useRef(runDragFrame);
  dragMoveHandlerRef.current = runDragFrame;

  useEffect(() => {
    const onMove = (ev) => {
      if (!dragRef.current) return;
      dragLatestEventRef.current = ev;
      if (dragMoveRafRef.current != null) return;
      dragMoveRafRef.current = requestAnimationFrame(() => {
        dragMoveRafRef.current = null;
        dragMoveHandlerRef.current();
      });
    };

    const onUp = () => {
      if (dragMoveRafRef.current != null) {
        cancelAnimationFrame(dragMoveRafRef.current);
        dragMoveRafRef.current = null;
      }
      dragLatestEventRef.current = null;
      if (dragRef.current?.activated) setIsDragging(false);
      dragRef.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      if (dragMoveRafRef.current != null) {
        cancelAnimationFrame(dragMoveRafRef.current);
        dragMoveRafRef.current = null;
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleDoubleClick = useCallback(() => {
    yExplicitlyZoomedRef.current = false;
    const end = Math.max(0, totalPointsRef.current - 1);
    const yd = [baseYMin, baseYMax];
    const xr = [0, end];
    yDomainRef.current = yd;
    xRangeRef.current = xr;
    setYDomain(yd);
    setXRange(xr);
    setIsZoomed(false);
  }, [baseYMin, baseYMax]);

  const zoomYIn = useCallback(() => {
    yExplicitlyZoomedRef.current = true;
    setYDomain(([lo, hi]) => {
      const r = hi - lo;
      if (r < MIN_Y_RANGE) return [lo, hi];
      const s = r * ZOOM_FACTOR;
      const m = (lo + hi) / 2;
      const next = [m - (r - s) / 2, m + (r - s) / 2];
      yDomainRef.current = next;
      return next;
    });
    setIsZoomed(true);
  }, []);

  const zoomYOut = useCallback(() => {
    yExplicitlyZoomedRef.current = true;
    setYDomain(([lo, hi]) => {
      const r = hi - lo;
      const g = r * ZOOM_FACTOR;
      const m = (lo + hi) / 2;
      const next = [m - (r + g) / 2, m + (r + g) / 2];
      yDomainRef.current = next;
      return next;
    });
    setIsZoomed(true);
  }, []);

  const zoomXIn = useCallback(() => {
    const [xs, xe] = xRangeRef.current;
    const span = xe - xs;
    if (span <= X_ZOOM_MIN_POINTS) return;
    const step = Math.max(1, Math.round(span * X_ZOOM_STEP_FRAC));
    applyXRange(xs + step, xe - step);
    setIsZoomed(true);
  }, [applyXRange]);

  const zoomXOut = useCallback(() => {
    const [xs, xe] = xRangeRef.current;
    const span = xe - xs;
    const step = Math.max(1, Math.round(span * X_ZOOM_STEP_FRAC));
    applyXRange(xs - step, xe + step);
    setIsZoomed(true);
  }, [applyXRange]);

  const fitAll = useCallback(() => {
    yExplicitlyZoomedRef.current = false;
    const end = Math.max(0, totalPointsRef.current - 1);
    const yd = [baseYMin, baseYMax];
    const xr = [0, end];
    yDomainRef.current = yd;
    xRangeRef.current = xr;
    setYDomain(yd);
    setXRange(xr);
    setIsZoomed(false);
  }, [baseYMin, baseYMax]);

  const slicedData = hasData ? rawChartData.slice(xStart, xEnd + 1) : [];

  const histColor = directionUp ? '#22c55e' : '#ef4444';
  const phiLevels = Array.isArray(phiExtensionLevels) ? phiExtensionLevels : [];
  const visibleLayersOrdered = layers.filter((l) => l.visible);

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
  const cursorClass = isDragging ? 'cursor-grabbing' : hasData ? 'cursor-crosshair' : 'cursor-default';

  const rangeLeftPct = totalPoints > 1 ? (xStart / (totalPoints - 1)) * 100 : 0;
  const rangeWidthPct = totalPoints > 1 ? ((xEnd - xStart) / (totalPoints - 1)) * 100 : 100;

  return (
    <div className="flex flex-col flex-1 min-h-0" aria-label="Projection chart">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Historical & Forecast
        </h2>
        <div className="flex items-center gap-2">
          {hasData && (
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
              <button type="button" onClick={zoomYIn} className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors" aria-label="Zoom in price" title="Zoom in (price)">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={zoomYOut} className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors" aria-label="Zoom out price" title="Zoom out (price)">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
              <button type="button" onClick={zoomXIn} className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors" aria-label="Zoom in time" title="Zoom in (time)">
                <span className="text-[9px] font-bold leading-none">T+</span>
              </button>
              <button type="button" onClick={zoomXOut} className="p-1 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors" aria-label="Zoom out time" title="Zoom out (time)">
                <span className="text-[9px] font-bold leading-none">T−</span>
              </button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
              <button
                type="button"
                onClick={fitAll}
                className={`p-1 rounded transition-colors ${
                  isZoomed
                    ? 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                    : 'text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700'
                }`}
                aria-label="Fit all data"
                title="Fit all"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{ticker || '—'}</span>
        </div>
      </div>

      {hasData && (
        <div className="flex items-center gap-3 mb-1 flex-shrink-0 text-[9px] text-gray-400 dark:text-gray-500 select-none">
          <span>Scroll → zoom price</span>
          <span>Shift+scroll → pan time</span>
          <span>⌘/Ctrl+scroll → zoom time</span>
          <span>Drag → pan</span>
          <span>Double-click → fit all</span>
        </div>
      )}

      <div
        className={`h-[380px] flex-shrink-0 select-none ${cursorClass}`}
        ref={chartContainerRef}
        onMouseDown={hasData ? handleMouseDown : undefined}
        onDoubleClick={hasData ? handleDoubleClick : undefined}
        onMouseLeave={() => setTooltipHidden(true)}
        onMouseEnter={() => setTooltipHidden(false)}
      >
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={slicedData} margin={{ top: 8, right: 60, left: 8, bottom: 8 }}>
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
                wrapperStyle={{
                  visibility: isDragging || tooltipHidden ? 'hidden' : 'visible',
                  pointerEvents: 'none',
                }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}
                formatter={(v, name) => {
                  if (v == null) return [null, null];
                  if (name === 'historical') return [formatCurrency(v), 'Real Price'];
                  if (name.endsWith('_upper') || name.endsWith('_lower')) return [null, null];
                  const layer = layers.find((l) => l.id === name);
                  return [formatCurrency(v), layer?.label ?? name];
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
              {visibleLayersOrdered.map((layer) => {
                if (layer.type === 'historical') {
                  return (
                    <Area
                      key="historical"
                      type="monotone"
                      dataKey="historical"
                      stroke={histColor}
                      strokeWidth={2}
                      fill="url(#projHistGrad)"
                      dot={false}
                      activeDot={!isDragging ? { r: 4, strokeWidth: 0, fill: histColor } : false}
                      isAnimationActive={false}
                    />
                  );
                }
                const runColor = layer.color || '#f97316';
                return (
                  <Fragment key={layer.id}>
                    <Area
                      type="monotone"
                      dataKey={`${layer.id}_upper`}
                      stroke="transparent"
                      fill={`${runColor}14`}
                      activeDot={false}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey={`${layer.id}_lower`}
                      stroke="transparent"
                      fill={`${runColor}14`}
                      activeDot={false}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey={layer.id}
                      stroke={runColor}
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      fill="transparent"
                      dot={false}
                      activeDot={!isDragging ? { r: 4, strokeWidth: 0, fill: runColor } : false}
                      isAnimationActive={false}
                    />
                  </Fragment>
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm gap-3">
            <BarChart3 className="w-12 h-12 opacity-40" aria-hidden />
            <p className="font-medium">
              {loading ? 'Running prediction…' : 'Press Run Prediction to generate a projection.'}
            </p>
          </div>
        )}
      </div>

      {hasData && !isFullRange && (
        <div className="h-1.5 mx-[80px] mr-[60px] mt-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden flex-shrink-0">
          <div
            className="h-full rounded-full bg-gray-300 dark:bg-gray-600 transition-all duration-75"
            style={{ marginLeft: `${rangeLeftPct}%`, width: `${Math.max(2, rangeWidthPct)}%` }}
          />
        </div>
      )}

      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-500 flex-shrink-0">
        All dates shown in Eastern Time (America/New_York).
      </p>
    </div>
  );
}

const PROJECTION_LOAD_AS_NEW_KEY = 'projectionLoadAsNewTicker';
const MAX_PROJECTION_RUNS = 20;
const PROJECTION_COLORS = [
  '#f97316',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f59e0b',
  '#6366f1',
  '#14b8a6',
];

const VIEW_PROJECTION = 'projection';
const VIEW_SAVED = 'saved';

function Projection({ embedded = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const activeView = viewParam === VIEW_SAVED ? VIEW_SAVED : VIEW_PROJECTION;
  const setActiveView = (v) => setSearchParams(v === VIEW_PROJECTION ? {} : { view: v });

  const { getItem, setItem } = useStorage();
  const storageAdapter = useRef({ getItem, setItem });
  storageAdapter.current = { getItem, setItem };
  const [ticker, setTicker] = useState('QQQ');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [projectionRuns, setProjectionRuns] = useState([]);
  const [layers, setLayers] = useState([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [saveSubmitting, setSaveSubmitting] = useState(false);
  const [saveToast, setSaveToast] = useState({ show: false, message: '', isError: false });
  const [pendingRun, setPendingRun] = useState(null);

  const latestRun = projectionRuns.length > 0 ? projectionRuns[projectionRuns.length - 1] : null;
  const result = latestRun?.result ?? null;

  const runPrediction = useCallback(
    async (symbolArg) => {
      const symbol = (symbolArg || ticker || 'QQQ').trim().toUpperCase();
      const asset = 'stock';

      if (projectionRuns.length >= MAX_PROJECTION_RUNS) {
        setError(`Maximum ${MAX_PROJECTION_RUNS} projection runs. Remove some from the layer list or refresh the page.`);
        return;
      }

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
        const runId =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const color = PROJECTION_COLORS[projectionRuns.length % PROJECTION_COLORS.length];
        const newRun = {
          id: runId,
          timestamp: new Date().toISOString(),
          ticker: symbol,
          result: data,
          visible: true,
          color,
        };
        setPendingRun(newRun);
        setItem(STORAGE_KEYS.PROJECTION_LAST_SYMBOL, symbol).catch(() => {});
      } catch (e) {
        setError(e?.message || 'Prediction failed');
      } finally {
        setLoading(false);
      }
    },
    [ticker, setItem, projectionRuns.length],
  );

  const moveLayerUp = useCallback((layerId) => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === layerId);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveLayerDown = useCallback((layerId) => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === layerId);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const toggleLayerVisibility = useCallback((layerId) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
    );
  }, []);

  const confirmAddLayer = useCallback(() => {
    if (!pendingRun) return;
    if (projectionRuns.length >= MAX_PROJECTION_RUNS) {
      setError(`Maximum ${MAX_PROJECTION_RUNS} projection runs. Remove some from the layer list or refresh the page.`);
      setPendingRun(null);
      return;
    }
    const runId = pendingRun.id;
    const symbol = pendingRun.ticker;
    const color = pendingRun.color;
    setProjectionRuns((prev) => {
      const next = [...prev, pendingRun];
      const count = next.length;
      setLayers((layersPrev) => {
        const newLayer = {
          id: runId,
          type: 'projection',
          label: `Run #${count}`,
          visible: true,
          color,
        };
        if (layersPrev.length === 0) {
          return [
            { id: 'historical', type: 'historical', label: `Real Price (${symbol})`, visible: true },
            newLayer,
          ];
        }
        const updatedHist = { ...layersPrev[0], label: `Real Price (${symbol})` };
        return [updatedHist, ...layersPrev.slice(1), newLayer];
      });
      return next;
    });
    setPendingRun(null);
  }, [pendingRun, projectionRuns.length]);

  const discardPendingRun = useCallback(() => {
    setPendingRun(null);
  }, []);

  const removeLayer = useCallback((layerId) => {
    if (layerId === 'historical') return;
    setProjectionRuns((prev) => prev.filter((r) => r.id !== layerId));
    setLayers((prev) => {
      const next = prev.filter((l) => l.id !== layerId);
      const hasProjections = next.some((l) => l.type === 'projection');
      if (!hasProjections) return [];
      return next;
    });
  }, []);

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
          if (sym && !cancelled) {
            setTicker(sym);
          }
          return;
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
      if (!cancelled) setTicker(sym);
    })();
    return () => {
      cancelled = true;
    };
  }, [getItem]);

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
    const savedPredictedPrice = Number(result.predicted_price);
    const savedPctChange = Number(result.pct_change ?? 0);
    const payload = {
      ticker: sym,
      name: nameTrimmed,
      currentPrice: savedCurrentPrice,
      firstTargetPrice: savedPredictedPrice,
      percentToTarget: savedPctChange,
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

  const directionUp = result?.direction === 'bullish';

  const containerCls = embedded
    ? 'w-full max-w-[1400px] mx-auto px-0 flex flex-col h-full min-h-0 overflow-y-auto'
    : 'w-full max-w-[1400px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-y-auto';

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
      {pendingRun && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-layer-title"
          onClick={(e) => e.target === e.currentTarget && discardPendingRun()}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-layer-title" className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Add projection to chart?
            </h2>
            {(() => {
              const r = pendingRun.result;
              const dirUp = r?.direction === 'bullish';
              return (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono text-sm font-semibold px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
                      {pendingRun.ticker}
                    </span>
                    <span className={`text-sm font-medium ${dirUp ? 'text-emerald-500' : 'text-red-500'}`}>
                      {dirUp ? '↑ Bullish' : '↓ Bearish'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                    <div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Price</p>
                      <p className="font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(r?.current_price)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Forecast</p>
                      <p className={`font-bold tabular-nums ${dirUp ? 'text-emerald-500' : 'text-red-500'}`}>
                        {formatCurrency(r?.predicted_price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Move</p>
                      <p className={`font-bold tabular-nums ${dirUp ? 'text-emerald-500' : 'text-red-500'}`}>
                        {formatPercentFromFraction(r?.pct_change)}
                      </p>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                      <span>Confidence</span>
                      <span>{r?.confidence != null ? `${r.confidence}%` : '—'}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all"
                        style={{ width: r?.confidence != null ? `${Math.min(100, r.confidence)}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={discardPendingRun}
                      className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={confirmAddLayer}
                      className="rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-4 py-2"
                    >
                      Add to Chart
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
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

      {/* ─── Breadcrumb ─── */}
      {!embedded && (
        <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2 flex-shrink-0">
          <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <span className="font-medium text-gray-900 dark:text-white">Projections</span>
        </nav>
      )}

      {/* ─── Header ─── */}
      {!embedded && (
        <div className="text-center mb-4 flex-shrink-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            Crystalline Projection
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            1H weekly projection · clock lattice · Fibonacci · phi targets (Mon–Fri, EST).
          </p>
        </div>
      )}

      {/* ─── View toggle ─── */}
      <div className="flex gap-1 mb-4 flex-shrink-0">
        <button
          type="button"
          onClick={() => setActiveView(VIEW_PROJECTION)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            activeView === VIEW_PROJECTION
              ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          New Projection
        </button>
        <button
          type="button"
          onClick={() => setActiveView(VIEW_SAVED)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            activeView === VIEW_SAVED
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Saved Projections
        </button>
      </div>

      {/* ─── Saved Projections view ─── */}
      {activeView === VIEW_SAVED && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <SavedProjectionsList />
        </div>
      )}

      {/* ─── Projection view ─── */}
      {activeView === VIEW_PROJECTION && (
      <>
      {/* ─── Ticker controls ─── */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-2 mb-4 flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5"
      >
        <label htmlFor="ticker" className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mr-0.5">
          Ticker
        </label>
        <input
          id="ticker"
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          maxLength={20}
          autoComplete="off"
          className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 px-2.5 py-1.5 text-xs w-28 focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 focus:border-sky-400 dark:focus:border-sky-500 outline-none"
          placeholder="e.g. QQQ"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-sky-400 text-white text-xs font-semibold py-1.5 px-3 transition-colors whitespace-nowrap"
        >
          {loading ? 'Running…' : 'Run Prediction'}
        </button>
        <button
          type="button"
          disabled={!result || loading}
          onClick={openSaveModal}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white text-xs font-semibold py-1.5 px-3 transition-colors whitespace-nowrap"
        >
          <Save className="w-3.5 h-3.5 shrink-0" aria-hidden />
          Save
        </button>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 ml-1" role="alert">
            {error}
          </p>
        )}
      </form>

      {/* ─── Stat cards ─── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4 flex-shrink-0">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">
            Current Price
          </p>
          <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums leading-tight">
            {result ? formatCurrency(result.current_price) : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">
            Forecast
          </p>
          <p className={`text-lg font-bold tabular-nums leading-tight ${
            result ? (directionUp ? 'text-emerald-500' : 'text-red-500') : 'text-gray-900 dark:text-white'
          }`}>
            {result ? formatCurrency(result.predicted_price) : '—'}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-none">
            {result ? (directionUp ? 'Bullish' : 'Bearish') : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">
            Expected Move
          </p>
          <p
            className={`text-lg font-bold tabular-nums leading-tight flex items-center gap-1 ${
              result
                ? directionUp ? 'text-emerald-500' : 'text-red-500'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            <span className="text-sm">{result ? (directionUp ? '↑' : '↓') : ''}</span>
            <span>
              {result
                ? formatPercentFromFraction(result.pct_change)
                : '—'}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">
            Confidence
          </p>
          <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums leading-tight mb-1">
            {result && result.confidence != null ? `${result.confidence}%` : '—'}
          </p>
          <div className="h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-700"
              style={{ width: result && result.confidence != null ? `${Math.min(100, result.confidence)}%` : '0%' }}
            />
          </div>
        </div>
      </section>

      {/* ─── Chart + Layer panel (unified card) ─── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden mb-4 flex-shrink-0 flex flex-col sm:flex-row">
        <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col min-h-0">
          <ProjectionChart
            projectionRuns={projectionRuns}
            layers={layers}
            ticker={
              projectionRuns.length > 0
                ? (projectionRuns[projectionRuns.length - 1].result?.symbol || ticker).toUpperCase()
                : ticker.toUpperCase()
            }
            loading={loading}
          />
        </div>
        <div className="max-h-[260px] sm:max-h-none sm:min-h-[380px] overflow-hidden border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-700 flex flex-col">
          <LayerPanel
            layers={layers}
            projectionRuns={projectionRuns}
            onMoveUp={moveLayerUp}
            onMoveDown={moveLayerDown}
            onToggleVisibility={toggleLayerVisibility}
            onRemoveLayer={removeLayer}
          />
        </div>
      </div>

      {/* ─── Key Price Targets strip ─── */}
      {result?.key_phi_targets && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 mb-4 flex-shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Key Price Targets — 1H Phi Extensions
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {result.key_phi_targets.map(({ ratio, bullish, bearish }) => {
              const isAnchor = ratio === 0 || ratio === 1;
              const label = ratio === 0 ? 'Swing Low' : ratio === 1 ? 'Swing High' : `${ratio} ext`;
              return (
                <div
                  key={ratio}
                  className={`rounded-md border px-2 py-1.5 flex flex-col gap-0.5 ${
                    isAnchor
                      ? 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60'
                  }`}
                >
                  <span className={`text-[9px] font-semibold uppercase tracking-wider leading-none ${
                    isAnchor ? 'text-sky-500 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {label}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-500 tabular-nums font-mono leading-tight">
                    {formatCurrency(bullish)}
                  </span>
                  <span className="text-[11px] font-bold text-red-500 tabular-nums font-mono leading-tight">
                    {formatCurrency(bearish)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Details: Model metrics + Phi table ─── */}
      {result ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4 flex-shrink-0">

          {/* Left — Model metrics */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 flex flex-col gap-2 text-xs">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Model Summary
            </h3>

            {/* Crystalline Score — single compact row */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Score</span>
              <div className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: result.crystalline_score != null
                      ? `${Math.max(0, Math.min(100, ((result.crystalline_score + 4) / 8) * 100))}%`
                      : '50%',
                    background: result.crystalline_score != null && result.crystalline_score < 0 ? '#ef4444' : '#22c55e',
                  }}
                />
              </div>
              <span className="text-[11px] font-bold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                {result.crystalline_score ?? '—'}<span className="text-[9px] font-normal text-gray-400 ml-0.5">/±4</span>
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                T:{result.trend_score ?? '—'} V:{result.vol_score ?? '—'} R:{result.risk_score ?? '—'}
              </span>
            </div>

            {/* Clock + Prime + Resonance + Risk + Volatility — single row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
              <span className="text-gray-500 dark:text-gray-400">
                Clock <span className="font-bold text-gray-900 dark:text-white">{result.clock_position ?? '—'}</span><span className="text-gray-400">/11</span>
              </span>
              <span className={result.on_prime ? 'text-emerald-500 font-semibold' : 'text-gray-400'}>
                Prime: {result.on_prime ? 'Yes' : 'No'}
              </span>
              <span className={result.pi_phi_resonance ? 'text-emerald-500 font-semibold' : 'text-gray-400'}>
                π×φ: {result.pi_phi_resonance ? 'Active' : 'No'}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                Risk <span className="font-mono font-bold text-gray-900 dark:text-white">{result.risk_ratio != null ? Number(result.risk_ratio).toFixed(4) : '—'}</span>
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                Vol <span className="font-mono font-bold text-gray-900 dark:text-white">{result.volatility_annual != null ? `${(result.volatility_annual * 100).toFixed(2)}%` : '—'}</span>
              </span>
            </div>

            <hr className="border-gray-100 dark:border-gray-800" />

            {/* Fibonacci Levels — compact 2-col grid */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Fibonacci Levels</span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500">
                  {result.fib_anchor_date || '—'} · {result.fib_anchor_bullish == null ? '—' : result.fib_anchor_bullish ? 'Bullish' : 'Bearish'} anchor
                  {' · '}Confluence: {result.fib_bull_confluence || result.fib_bear_confluence
                    ? [result.fib_bull_confluence ? 'Bull' : null, result.fib_bear_confluence ? 'Bear' : null].filter(Boolean).join(' & ')
                    : 'None'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0">
                {[
                  { label: 'High (1.0)', key: '1', fallback: result.swing_high, accent: false },
                  { label: '0.786 OTE', key: '0.786', fallback: null, accent: true },
                  { label: '0.618 OTE', key: '0.618', fallback: null, accent: true },
                  { label: '0.5 Eq', key: '0.5', fallback: null, accent: false },
                  { label: '0.382', key: '0.382', fallback: null, accent: false },
                  { label: 'Low (0.0)', key: '0', fallback: result.swing_low, accent: false },
                ].map(({ label, key, fallback, accent }) => (
                  <div key={key} className="flex items-center justify-between py-px">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>
                    <span className={`text-[10px] font-mono tabular-nums ${accent ? 'text-sky-600 dark:text-sky-400 font-semibold' : 'text-gray-900 dark:text-white'}`}>
                      {result.fib_levels_dict?.[key] != null
                        ? formatCurrency(result.fib_levels_dict[key])
                        : fallback != null ? formatCurrency(fallback) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary text */}
            {result.summary && (
              <>
                <hr className="border-gray-100 dark:border-gray-800" />
                <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-snug">
                  {result.summary}
                </p>
              </>
            )}
          </div>

          {/* Right — Phi Extension Targets */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 flex flex-col text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Phi Extension Targets
              </h3>
              <span className="text-[9px] text-gray-400 dark:text-gray-500">0.0 = low · 1.0 = high</span>
            </div>
            <div className="grid grid-cols-3 gap-x-2 text-[10px] font-mono text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-1 mb-0.5">
              <span className="font-semibold">Ratio</span>
              <span className="text-right font-semibold text-emerald-600 dark:text-emerald-400">↑ Bull</span>
              <span className="text-right font-semibold text-red-500 dark:text-red-400">↓ Bear</span>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[220px]">
              {(result.phi_extension_levels || []).map(({ ratio, bullish, bearish }) => {
                const isKey = [0, 1, 1.382, 2.382, 3.382, 4.24, 5.08].includes(ratio);
                return (
                  <div
                    key={ratio}
                    className={`grid grid-cols-3 gap-x-2 text-[10px] font-mono rounded px-1 py-px ${
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
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 text-center mb-4 flex-shrink-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Run a prediction to see the full Crystalline analysis.
          </p>
        </div>
      )}

      <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center pb-4 flex-shrink-0">
        Not financial advice. For educational and research purposes only.
      </p>
      </>
      )}
    </div>
  );
}

export default Projection;

