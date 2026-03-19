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
      ? d.toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
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
    <div className="w-full max-w-[1800px] mx-auto px-0 flex flex-col h-full min-h-0 overflow-hidden">
      <div className="mb-4 flex-shrink-0">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Saved projections
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
          Open a row to view the full snapshot. Delete from the list or while viewing.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden flex-1 min-h-0 flex flex-col">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading…
          </div>
        ) : projections.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No saved projections yet. Run a prediction on the Projection tab and click{' '}
            <strong className="text-emerald-600 dark:text-emerald-400">Save Projection</strong>.
          </div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm text-left">
              <thead className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 sticky top-0">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Ticker</th>
                  <th className="px-4 py-3 text-right tabular-nums">Current</th>
                  <th className="px-4 py-3 text-right tabular-nums">1st target</th>
                  <th className="px-4 py-3 text-right tabular-nums">Confidence</th>
                  <th className="px-4 py-3 text-right tabular-nums">Crystalline</th>
                  <th className="px-4 py-3 w-12" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {projections.map((p) => {
                  const d = savedProjectionDate(p);
                  const dateStr = d
                    ? d.toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : '—';
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() => setSelected(p)}
                    >
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">
                        {p.name || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-800 dark:text-gray-200">
                        {p.ticker || '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(p.currentPrice)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-white">
                        {formatCurrency(p.firstTargetPrice)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {p.confidence != null ? `${p.confidence}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {p.crystallineScore ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteById(p.id, false);
                          }}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          aria-label="Delete projection"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default SavedProjectionsList;
