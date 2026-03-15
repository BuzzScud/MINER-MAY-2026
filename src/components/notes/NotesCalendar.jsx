import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, isToday, addDays } from 'date-fns';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function safeParseDate(str) {
  if (!str) return null;
  try {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function NotesCalendar({ notes = [], onDateSelect, onNoteClick }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const notesByDate = useMemo(() => {
    const map = new Map();
    notes.forEach((note) => {
      const created = safeParseDate(note.createdAt);
      const updated = safeParseDate(note.updatedAt);
      const dates = [created, updated].filter((d) => d != null);
      dates.forEach((d) => {
        const key = format(d, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        const arr = map.get(key);
        if (!arr.some((n) => n.id === note.id)) arr.push(note);
      });
    });
    return map;
  }, [notes]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const weeks = useMemo(() => {
    const result = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      result.push(week);
    }
    return result;
  }, [calendarStart, calendarEnd]);

  const handlePrevMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const handleNextMonth = () => setCurrentMonth((m) => addMonths(m, 1));
  const handleToday = () => setCurrentMonth(new Date());

  const handleDateClick = (date) => {
    const key = format(date, 'yyyy-MM-dd');
    const dayNotes = notesByDate.get(key) || [];
    onDateSelect?.(date, dayNotes);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Calendar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {format(currentMonth, 'MMMM yyyy')}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToday}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Previous month"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Next month"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayNotes = notesByDate.get(key) || [];
              const inMonth = isSameMonth(day, currentMonth);
              const isCurrentDay = isToday(day);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleDateClick(day)}
                  className={`
                    min-h-[80px] p-2 text-left border-r border-gray-100 dark:border-gray-700 last:border-r-0
                    transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50
                    ${!inMonth ? 'text-gray-300 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'}
                    ${isCurrentDay ? 'ring-2 ring-blue-500 ring-inset bg-blue-50 dark:bg-blue-900/20' : ''}
                  `}
                >
                  <span
                    className={`
                      inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
                      ${isCurrentDay ? 'bg-blue-600 text-white' : inMonth ? 'hover:bg-gray-200 dark:hover:bg-gray-600' : ''}
                    `}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayNotes.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {dayNotes.slice(0, 3).map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNoteClick?.(note);
                          }}
                          className={`
                            w-2 h-2 rounded-full flex-shrink-0
                            ${(note.color?.name === 'Blue' && 'bg-blue-500') ||
                            (note.color?.name === 'Green' && 'bg-green-500') ||
                            (note.color?.name === 'Yellow' && 'bg-yellow-500') ||
                            (note.color?.name === 'Purple' && 'bg-purple-500') ||
                            (note.color?.name === 'Pink' && 'bg-pink-500') ||
                            (note.color?.name === 'Indigo' && 'bg-indigo-500') ||
                            'bg-gray-400'}
                          `}
                          title={note.title || 'Untitled'}
                        />
                      ))}
                      {dayNotes.length > 3 && (
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                          +{dayNotes.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default NotesCalendar;
