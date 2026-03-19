function formatCurrency(value) {
  const numberValue = Number(value) || 0;
  return numberValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getMonthMatrix(year, monthIndex) {
  const firstDate = new Date(year, monthIndex, 1);
  const firstDay = firstDate.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const matrix = [];
  let row = new Array(7).fill(null);
  let cursor = 0;

  for (let blankIndex = 0; blankIndex < firstDay; blankIndex += 1) {
    row[cursor] = null;
    cursor += 1;
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    row[cursor] = { day, isoDate };
    cursor += 1;
    if (cursor === 7) {
      matrix.push(row);
      row = new Array(7).fill(null);
      cursor = 0;
    }
  }

  if (cursor !== 0) {
    matrix.push(row);
  }

  return matrix;
}

export function PerformanceCalendar({ performanceData, monthIndex, year, onMonthChange }) {
  const monthDate = new Date(year, monthIndex, 1);
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const monthData = performanceData?.[monthKey] || { totalPL: 0, days: {}, weeks: [] };
  const matrix = getMonthMatrix(year, monthIndex);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {monthDate.toLocaleString('en-US', { month: 'long' })} {year}
          </h3>
          <p className={`text-sm font-semibold ${monthData.totalPL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            Monthly P/L: {formatCurrency(monthData.totalPL)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const previousDate = new Date(year, monthIndex - 1, 1);
              onMonthChange(previousDate.getMonth(), previousDate.getFullYear());
            }}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white transition-colors"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => {
              const nextDate = new Date(year, monthIndex + 1, 1);
              onMonthChange(nextDate.getMonth(), nextDate.getFullYear());
            }}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => (
          <div key={weekday} className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center py-1">
            {weekday}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {matrix.map((weekRow, rowIndex) => (
          <div key={`week-${rowIndex}`} className="grid grid-cols-7 gap-1.5">
            {weekRow.map((dateCell, colIndex) => {
              if (!dateCell) {
                return <div key={`empty-${rowIndex}-${colIndex}`} className="h-[88px] rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/50" />;
              }

              const dayData = monthData.days?.[dateCell.isoDate];
              const isToday = monthData.todayDate && monthData.todayDate === dateCell.isoDate;
              return (
                <div
                  key={dateCell.isoDate}
                  className={`h-[88px] rounded-lg border p-2 ${
                    isToday
                      ? 'border-blue-500 ring-1 ring-blue-500/50 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  }`}
                >
                  <div className="text-xs text-gray-500 dark:text-gray-400">{dateCell.day}</div>
                  {dayData ? (
                    <>
                      <div className={`mt-1 text-xs font-semibold ${dayData.pl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrency(dayData.pl)}
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{dayData.trades} trades</div>
                    </>
                  ) : (
                    <div className="mt-3 text-[10px] text-gray-400 dark:text-gray-600">-</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {monthData.weeks?.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Weekly Totals</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {monthData.weeks.map((weekData) => (
              <div key={`week-total-${weekData.weekNumber}`} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5">
                <p className="text-xs text-gray-500 dark:text-gray-400">Week {weekData.weekNumber}</p>
                <p className={`text-sm font-semibold ${weekData.pl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency(weekData.pl)}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{weekData.trades} trades</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
