import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

export function ChecklistHeader({
  selectedDate,
  setSelectedDate,
  getTodayIso,
  streak,
  totalDaysCompleted,
  todayPct,
  canSaveRun,
  onSave,
  onResetConfirmRequest,
  checklistTitle,
  setChecklistTitle,
  checklistNotes,
  setChecklistNotes,
  showSavedFeedback,
  onCreateCategoryClick,
}) {
  const [runDetailsOpen, setRunDetailsOpen] = useState(false);
  const pctValue = Math.round(todayPct * 100);

  return (
    <header className="flex flex-col gap-3 flex-shrink-0 mb-1">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Streak</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{streak} days</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Days Completed</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{totalDaysCompleted}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Today&apos;s Progress</p>
          <p className={`text-lg font-bold ${pctValue === 100 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
            {pctValue}%
          </p>
          <div className="mt-1.5 h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pctValue === 100
                  ? 'bg-green-500'
                  : 'bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400'
              }`}
              style={{ width: `${pctValue}%` }}
            />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Selected Date</p>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value || getTodayIso())}
            className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!canSaveRun) return;
            onSave();
          }}
          disabled={!canSaveRun}
          className="text-xs font-semibold py-1.5 px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Save Day
        </button>
        <button
          type="button"
          onClick={onResetConfirmRequest}
          className="inline-flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-red-600 hover:text-white transition-colors"
          aria-label="Reset checklist for this day"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
        {onCreateCategoryClick && (
          <button
            type="button"
            onClick={onCreateCategoryClick}
            className="text-xs font-medium text-sky-500 hover:text-sky-400 transition-colors"
          >
            + New Category
          </button>
        )}
        {showSavedFeedback && (
          <span className="text-xs font-medium text-green-500 dark:text-green-400">Saved</span>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setRunDetailsOpen((prev) => !prev)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          {runDetailsOpen ? (
            <ChevronDown className="w-4 h-4 shrink-0 text-sky-500" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0 text-sky-500" />
          )}
          <span>Run Details</span>
          {(checklistTitle.trim() || checklistNotes.trim()) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">filled</span>
          )}
        </button>
        {runDetailsOpen && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2.5 space-y-3">
            <div>
              <label htmlFor="run-title" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                Run title
              </label>
              <input
                id="run-title"
                type="text"
                value={checklistTitle}
                onChange={(e) => setChecklistTitle(e.target.value)}
                maxLength={100}
                placeholder="e.g. FOMC day playbook"
                className="block w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label htmlFor="run-notes" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                Run notes
              </label>
              <textarea
                id="run-notes"
                rows={2}
                value={checklistNotes}
                onChange={(e) => setChecklistNotes(e.target.value)}
                placeholder="Optional notes for this checklist run"
                className="block w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
