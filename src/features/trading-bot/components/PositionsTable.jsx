import { fmtPrice, fmtPnl } from '../utils/formatters';

export function PositionsTable({ positions, prices }) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 py-2">No open positions</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-left">
            <th className="py-1.5 pr-2 font-semibold">Symbol</th>
            <th className="py-1.5 pr-2 font-semibold">Side</th>
            <th className="py-1.5 pr-2 font-semibold">Entry</th>
            <th className="py-1.5 pr-2 font-semibold">Current</th>
            <th className="py-1.5 pr-2 font-semibold text-right">P&L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, i) => {
            const currentPrice = prices?.[pos.symbol];
            const pnl = pos.pnl ?? (currentPrice != null && pos.entry_price != null
              ? (pos.side === 'long' ? 1 : -1) * (currentPrice - pos.entry_price) * (pos.quantity ?? 1)
              : null);
            return (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-2 font-medium text-gray-900 dark:text-white">{pos.symbol}</td>
                <td className="py-1.5 pr-2 capitalize text-gray-700 dark:text-gray-300">{pos.side || '—'}</td>
                <td className="py-1.5 pr-2 text-gray-700 dark:text-gray-300">{fmtPrice(pos.entry_price)}</td>
                <td className="py-1.5 pr-2 text-gray-700 dark:text-gray-300">{fmtPrice(currentPrice)}</td>
                <td className={`py-1.5 text-right font-medium ${pnl != null && pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {pnl != null ? fmtPnl(pnl) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
