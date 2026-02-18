import { fmtPrice, fmtPnl, fmtTime } from '../utils/formatters';

export function TradesTable({ trades }) {
  const displayTrades = Array.isArray(trades) ? [...trades].reverse().slice(0, 50) : [];

  if (displayTrades.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 py-2">No trades yet</div>
    );
  }

  return (
    <div className="overflow-x-auto max-h-48 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white dark:bg-gray-800">
          <tr className="border-b border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-left">
            <th className="py-1.5 pr-2 font-semibold">Exit Time</th>
            <th className="py-1.5 pr-2 font-semibold">Symbol</th>
            <th className="py-1.5 pr-2 font-semibold">Side</th>
            <th className="py-1.5 pr-2 font-semibold">Entry</th>
            <th className="py-1.5 pr-2 font-semibold">Exit</th>
            <th className="py-1.5 pr-2 font-semibold text-right">P&L</th>
          </tr>
        </thead>
        <tbody>
          {displayTrades.map((t, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
              <td className="py-1 pr-2 text-gray-600 dark:text-gray-400">{fmtTime(t.exit_time)}</td>
              <td className="py-1 pr-2 font-medium text-gray-900 dark:text-white">{t.symbol}</td>
              <td className="py-1 pr-2 capitalize text-gray-700 dark:text-gray-300">{t.side || '—'}</td>
              <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{fmtPrice(t.entry_price)}</td>
              <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{fmtPrice(t.exit_price)}</td>
              <td className={`py-1 text-right font-medium ${t.pnl != null && t.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {t.pnl != null ? fmtPnl(t.pnl) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
