import { formatVolume } from '../utils/formatters';
import { getSessionInfoClient } from '../utils/formatters';

const VOL_PALETTE = ['#6366f1', '#818cf8', '#a78bfa', '#c4b5fd'];

export function VolumePanel({ marketOverview, activeChartSymbol }) {
  const dataToShow = Array.isArray(marketOverview)
    ? (activeChartSymbol
        ? marketOverview.filter((row) => (row.symbol || '') === activeChartSymbol)
        : marketOverview)
    : [];

  if (dataToShow.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Volume
        </h2>
        <div className="text-xs text-gray-500 dark:text-gray-400">No data</div>
      </div>
    );
  }

  const totalVolume = dataToShow.reduce((s, r) => s + (r.volume || 0), 0);
  const maxVol = Math.max(1, ...dataToShow.map((r) => r.volume || 0));
  const maxRange = Math.max(
    1,
    ...dataToShow.map((r) => Math.max(0, (r.day_high ?? 0) - (r.day_low ?? 0)))
  );
  const activeCount = dataToShow.filter((r) => (r.volume || 0) > 0).length;
  const avgVolume = dataToShow.length > 0 ? Math.round(totalVolume / dataToShow.length) : 0;
  const topRow = dataToShow.reduce((best, r) => ((r.volume || 0) > (best?.volume || 0) ? r : best), dataToShow[0]);
  const topPct = totalVolume > 0 ? ((topRow?.volume || 0) / totalVolume) * 100 : 0;
  const sessionInfo = getSessionInfoClient();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Volume
      </h2>
      {sessionInfo.name && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Session: {sessionInfo.name}</p>
      )}
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
        {dataToShow.length === 1 ? dataToShow[0].symbol : dataToShow.length + ' symbols'}
      </p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded border border-gray-200 dark:border-gray-600 p-1.5 text-center">
          <div className="text-[10px] text-gray-500 dark:text-gray-400">Total</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{formatVolume(totalVolume)}</div>
        </div>
        <div className="rounded border border-gray-200 dark:border-gray-600 p-1.5 text-center">
          <div className="text-[10px] text-gray-500 dark:text-gray-400">Active</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{activeCount}</div>
        </div>
        <div className="rounded border border-gray-200 dark:border-gray-600 p-1.5 text-center">
          <div className="text-[10px] text-gray-500 dark:text-gray-400">Avg</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{formatVolume(avgVolume)}</div>
        </div>
      </div>
      <div className="mb-2">
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
          {topRow?.symbol} leads — {topPct.toFixed(1)}%
        </div>
        <div className="h-2 flex rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
          {dataToShow.map((row, i) => {
            const share = totalVolume > 0 ? ((row.volume || 0) / totalVolume) * 100 : 0;
            return (
              <div
                key={row.symbol || i}
                className="h-full transition-all"
                style={{ width: `${share}%`, backgroundColor: VOL_PALETTE[i % VOL_PALETTE.length] }}
              />
            );
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        {dataToShow.map((row, i) => {
          const vol = row.volume || 0;
          const rangeVal = Math.max(0, (row.day_high ?? 0) - (row.day_low ?? 0));
          const volPct = (vol / maxVol) * 100;
          const rangePct = (rangeVal / maxRange) * 100;
          return (
            <div key={row.symbol || i} className="flex items-end gap-1.5">
              <span className="w-12 text-xs text-gray-500 dark:text-gray-400 shrink-0">{row.symbol}</span>
              <div className="flex-1 flex gap-0.5 items-end min-h-[24px]">
                <div
                  className="flex-1 min-w-[4px] rounded-t bg-indigo-500"
                  style={{ height: `${Math.max(4, volPct)}%` }}
                />
                <div
                  className="flex-1 min-w-[4px] rounded-t bg-gray-600"
                  style={{ height: `${Math.max(4, rangePct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
        {dataToShow.map((row, s) => (
          <div key={row.symbol || s} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: VOL_PALETTE[s % VOL_PALETTE.length] }}
            />
            <span className="text-[10px] text-gray-600 dark:text-gray-400">
              {row.symbol} — {formatVolume(row.volume || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
