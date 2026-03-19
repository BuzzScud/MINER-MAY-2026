import { Panel } from '../../../components/common/Panel';

/**
 * Right sidebar: list of saved checklist runs with progress bar, load and delete actions.
 */
export function ChecklistHistory({
  historyDates,
  history,
  historyMeta,
  allItemsForStats,
  selectedDate,
  onLoadRun,
  onOpenDeleteModal,
}) {
  return (
    <Panel title="History">
      {historyDates.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400 m-0">
          No archived days yet. Complete your checklist and save to build history.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700 text-sm space-y-2">
          {historyDates.map((iso) => {
            const completed = history[iso] || [];
            const meta = historyMeta[iso] || {};
            const totalItems = allItemsForStats.length;
            const pct =
              totalItems > 0 ? completed.length / totalItems : 0;
            const pctLabel = `${Math.round(pct * 100)}%`;
            const isSelected = iso === selectedDate;

            return (
              <li key={iso} className="pt-2 first:pt-0">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                  <div className="p-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <button
                        type="button"
                        onClick={() => onLoadRun(iso)}
                        className={`flex-1 flex flex-col items-start gap-0.5 text-left rounded px-2 py-1.5 min-w-0 ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-800'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/70'
                        }`}
                      >
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate w-full">
                          {meta.title || iso}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {completed.length} of {totalItems} items · {iso}
                        </span>
                      </button>
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0">
                        {pctLabel}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden transition-all duration-300">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        type="button"
                        onClick={() => onLoadRun(iso)}
                        className="flex-1 px-2 py-1 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDeleteModal(iso)}
                        className="px-2 py-1 rounded text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        aria-label={`Delete saved checklist ${iso}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
