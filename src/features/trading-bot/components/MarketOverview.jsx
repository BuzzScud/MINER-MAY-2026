import { fmtPrice, fmtPct } from '../utils/formatters';

export function MarketOverview({ marketOverview }) {
  const rows = Array.isArray(marketOverview) ? marketOverview : [];

  if (rows.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 py-2">No market data</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-left">
            <th className="py-1.5 pr-2 font-semibold">Symbol</th>
            <th className="py-1.5 pr-2 font-semibold text-right">Price</th>
            <th className="py-1.5 pr-2 font-semibold text-right">Chg %</th>
            <th className="py-1.5 pr-2 font-semibold text-right">High</th>
            <th className="py-1.5 pr-2 font-semibold text-right">Low</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const chg = row.change_pct ?? row.change_pct_day;
            const isPos = chg != null && chg >= 0;
            return (
              <tr key={row.symbol || i} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-2 font-medium text-gray-900 dark:text-white">{row.symbol}</td>
                <td className="py-1.5 pr-2 text-right text-gray-700 dark:text-gray-300">{fmtPrice(row.price)}</td>
                <td className={`py-1.5 pr-2 text-right font-medium ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {chg != null ? fmtPct(chg) : '—'}
                </td>
                <td className="py-1.5 pr-2 text-right text-gray-600 dark:text-gray-400">{fmtPrice(row.day_high)}</td>
                <td className="py-1.5 pr-2 text-right text-gray-600 dark:text-gray-400">{fmtPrice(row.day_low)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
