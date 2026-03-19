import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { useStorage } from '../utils/storage';
import {
  getSavedProjections,
  deleteProjection,
} from '../services/projectionService';
import ReadOnlyProjectionViewer from './ReadOnlyProjectionViewer';

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

function savedProjectionDate(p) {
  const iso = p.timestamp || p.savedAt;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function SavedProjectionsList() {
  const { getItem, setItem } = useStorage();
  const [projections, setProjections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getSavedProjections({ getItem, setItem });
      const sorted = [...list].sort((a, b) => {
        const da = savedProjectionDate(a)?.getTime() ?? 0;
        const db = savedProjectionDate(b)?.getTime() ?? 0;
        return db - da;
      });
      setProjections(sorted);
    } catch {
      setProjections([]);
    } finally {
      setLoading(false);
    }
  }, [getItem, setItem]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDeleteById = useCallback(
    async (id, skipConfirm = false) => {
      if (!id) return;
      if (!skipConfirm && !window.confirm('Delete this saved projection?')) return;
      try {
        await deleteProjection(id, { getItem, setItem });
        await refresh();
        if (selected?.id === id) setSelected(null);
      } catch (e) {
        window.alert(e?.message || 'Delete failed');
      }
    },
    [getItem, setItem, refresh, selected?.id],
  );

  if (selected) {
    const d = savedProjectionDate(selected);
    const savedDateLabel = d
      ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : 'unknown date';
    return (
      <ReadOnlyProjectionViewer
        projection={selected}
        savedDateLabel={savedDateLabel}
        onBack={() => setSelected(null)}
        onDelete={() => handleDeleteById(selected.id, false)}
      />
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto flex flex-col h-full min-h-0">
      {loading ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center text-sm text-gray-500 dark:text-gray-400">
          Loading…
        </div>
      ) : projections.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No saved projections yet.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Switch to <span className="font-medium text-sky-500">New Projection</span>, run a prediction, and click <span className="font-medium text-emerald-500">Save</span>.
          </p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
          {projections.map((p) => {
            const d = savedProjectionDate(p);
            const dateStr = d
              ? d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
              : '—';
            const pctToTarget =
              Number.isFinite(Number(p.currentPrice)) && Number(p.currentPrice) !== 0 && Number.isFinite(Number(p.firstTargetPrice))
                ? ((Number(p.firstTargetPrice) - Number(p.currentPrice)) / Number(p.currentPrice)) * 100
                : null;
            const isUp = pctToTarget != null ? pctToTarget >= 0 : true;
            return (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 px-4 py-3 cursor-pointer transition-colors"
              >
                <div
                  className="w-1 self-stretch rounded-full flex-shrink-0"
                  style={{ backgroundColor: isUp ? '#22c55e' : '#ef4444' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {p.name || p.ticker || '—'}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex-shrink-0">
                      {p.ticker || '—'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {dateStr}
                    {p.confidence != null ? ` · ${p.confidence}% confidence` : ''}
                    {p.crystallineScore != null ? ` · Score: ${p.crystallineScore}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                      {formatCurrency(p.currentPrice)}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">current</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                      {formatCurrency(p.firstTargetPrice)}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">target</p>
                  </div>
                  {pctToTarget != null && (
                    <span className={`text-sm font-bold tabular-nums ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isUp ? '↑' : '↓'}{Math.abs(pctToTarget).toFixed(2)}%
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteById(p.id, false);
                    }}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label="Delete projection"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SavedProjectionsList;
