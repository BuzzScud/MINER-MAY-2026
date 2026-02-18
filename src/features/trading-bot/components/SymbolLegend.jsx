/**
 * Symbol reference / search legend for the Add symbol box.
 * Explains which symbols to type and how they map per feed (Yahoo, Finnhub, Massive).
 */

const SYMBOL_REFERENCE = [
  {
    symbol: 'NQ',
    yahoo: 'NQ=F',
    aliases: 'NQF, US100, USTECH100',
    finnhub: 'QQQ',
    massive: 'front-month (e.g. NQH25)',
  },
  {
    symbol: 'ES',
    yahoo: 'ES=F',
    aliases: null,
    finnhub: 'SPY',
    massive: 'front-month (e.g. ESH25)',
  },
  {
    symbol: 'GC',
    yahoo: 'GC=F',
    aliases: 'GLD, XAUUSD',
    finnhub: 'GC',
    massive: 'front-month (e.g. GCJ25)',
  },
  {
    symbol: 'SI',
    yahoo: 'SI=F',
    aliases: 'SLV',
    finnhub: 'SI',
    massive: 'front-month (e.g. SIH25)',
  },
  {
    symbol: 'EURUSD',
    yahoo: 'EURUSD=X',
    aliases: null,
    finnhub: 'OANDA:EUR_USD',
    massive: 'C:EURUSD',
  },
  {
    symbol: 'GBPUSD',
    yahoo: 'GBPUSD=X',
    aliases: null,
    finnhub: 'OANDA:GBP_USD',
    massive: 'C:GBPUSD',
  },
];

export function SymbolLegend() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Symbol reference
      </h2>
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
        Use these symbols in the Add symbol box. The bot maps them per feed.
      </p>
      <div className="overflow-x-auto overflow-y-auto max-h-[320px]">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-left">
              <th className="py-1 pr-2 font-semibold">Symbol</th>
              <th className="py-1 pr-2 font-semibold">Yahoo</th>
              <th className="py-1 pr-2 font-semibold">Finnhub</th>
              <th className="py-1 pr-2 font-semibold">Massive</th>
            </tr>
          </thead>
          <tbody className="text-gray-600 dark:text-gray-400">
            {SYMBOL_REFERENCE.map((row) => (
              <tr key={row.symbol} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1 pr-2">
                  <span className="font-medium text-gray-900 dark:text-white">{row.symbol}</span>
                  {row.aliases && (
                    <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">
                      Also: {row.aliases}
                    </div>
                  )}
                </td>
                <td className="py-1 pr-2 font-mono text-[10px]">{row.yahoo}</td>
                <td className="py-1 pr-2 font-mono text-[10px]">{row.finnhub}</td>
                <td className="py-1 pr-2 font-mono text-[10px]">{row.massive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
