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
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-400">
          History
        </h2>
        {historyDates.length > 0 && (
          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
            {historyDates.length} saved
          </span>
        )}
      </div>

      {historyDates.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
          No archived days yet. Complete your checklist and save to build history.
        </p>
      ) : (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
          {historyDates.map((iso) => {
            const completed = history[iso] || [];
            const meta = historyMeta[iso] || {};
            const totalItems = allItemsForStats.length;
            const pct = totalItems > 0 ? completed.length / totalItems : 0;
            const pctLabel = `${Math.round(pct * 100)}%`;
            const isSelected = iso === selectedDate;

            return (
              <div
                key={iso}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  isSelected
                    ? 'bg-sky-50 dark:bg-sky-900/15'
                    : 'bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div
                  className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                    pct === 1 ? 'bg-green-500' : 'bg-sky-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {meta.title || iso}
                    </p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      pct === 1
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                        : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                    }`}>
                      {pctLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {completed.length} of {totalItems} items &middot; {iso}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onLoadRun(iso)}
                    className="text-[11px] font-medium text-sky-500 hover:text-sky-400 transition-colors"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenDeleteModal(iso)}
                    className="text-[11px] font-medium text-red-500 hover:text-red-400 transition-colors"
                    aria-label={`Delete saved checklist ${iso}`}
                  >
                    Del
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
