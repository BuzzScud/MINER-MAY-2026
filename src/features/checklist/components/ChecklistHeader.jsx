import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

/**
 * Top bar: title, date picker, stats (streak, days completed, today %), save/reset, collapsible run details (title + notes).
 */
export function ChecklistHeader({
  selectedDate,
  setSelectedDate,
  getTodayIso,
  streak,
  totalDaysCompleted,
  todayPct,
  canSaveRun,
  onSave,
  onReset,
  onResetConfirmRequest,
  checklistTitle,
  setChecklistTitle,
  checklistNotes,
  setChecklistNotes,
  showSavedFeedback,
  onCreateCategoryClick,
}) {
  const [runDetailsOpen, setRunDetailsOpen] = useState(false);

  return (
    <header className="mb-4 flex flex-col gap-3 flex-shrink-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
            Market Checklist
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Track your daily market routine with editable checklists and archived days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <span className="font-semibold text-gray-900 dark:text-white">{streak}</span>{' '}
            <span className="text-gray-600 dark:text-gray-400">day streak</span>
          </div>
          <div className="px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <span className="font-semibold text-gray-900 dark:text-white">
              {totalDaysCompleted}
            </span>{' '}
            <span className="text-gray-600 dark:text-gray-400">days completed</span>
          </div>
          <div className="px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <span className="font-semibold text-gray-900 dark:text-white">
              {Math.round(todayPct * 100)}%
            </span>{' '}
            <span className="text-gray-600 dark:text-gray-400">today complete</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="checklist-date" className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Date
          </label>
          <input
            id="checklist-date"
            type="date"
            value={selectedDate}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedDate(v || getTodayIso());
            }}
            className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!canSaveRun) return;
            onSave();
          }}
          disabled={!canSaveRun}
          className="inline-flex items-center justify-center px-3 py-2 rounded-md text-sm font-semibold bg-indigo-600 text-white border border-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:border-indigo-500 dark:hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onResetConfirmRequest}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold bg-white text-red-700 border border-red-200 hover:bg-red-50 dark:bg-gray-900 dark:text-red-300 dark:border-red-900/40 dark:hover:bg-red-900/20"
          aria-label="Reset checklist for this day"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        {onCreateCategoryClick && (
          <button
            type="button"
            onClick={onCreateCategoryClick}
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-lg font-medium border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-500 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-400 transition-colors"
            aria-label="Create new checklist category"
          >
            +
          </button>
        )}
        {showSavedFeedback && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Saved</span>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setRunDetailsOpen((prev) => !prev)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          {runDetailsOpen ? (
            <ChevronDown className="w-4 h-4 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" />
          )}
          <span>Run details</span>
          {(checklistTitle.trim() || checklistNotes.trim()) && (
            <span className="text-xs text-gray-500 dark:text-gray-400">(filled)</span>
          )}
        </button>
        {runDetailsOpen && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-3">
            <div>
              <label
                htmlFor="run-title"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
              >
                Run title
              </label>
              <input
                id="run-title"
                type="text"
                value={checklistTitle}
                onChange={(e) => setChecklistTitle(e.target.value)}
                maxLength={100}
                placeholder="e.g. FOMC day playbook"
                className="block w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              />
            </div>
            <div>
              <label
                htmlFor="run-notes"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
              >
                Run notes
              </label>
              <textarea
                id="run-notes"
                rows={2}
                value={checklistNotes}
                onChange={(e) => setChecklistNotes(e.target.value)}
                placeholder="Optional notes for this checklist run"
                className="block w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 resize-none"
              />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
