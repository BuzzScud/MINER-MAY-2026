import { useState } from 'react';
import * as api from '../api/tradingBotApi';
import { fmt, fmtPct } from '../utils/formatters';
import { EquityChart } from './EquityChart';

const DEFAULT_PARAMS = {
  symbol: 'NQ',
  interval: '15m',
  period: '14d',
  initial_equity: 100_000,
  rsi_period: 14,
  rsi_oversold: 30,
  rsi_overbought: 70,
  z_long_threshold: -2,
  z_short_threshold: 2,
  bb_period: 20,
  bb_std: 2,
  atr_period: 14,
  profit_atr_mult: 1.5,
  stop_atr_mult: 1,
  max_hold_minutes: 30,
  volume_filter: true,
};

export function BacktestPanel({ backtestProgress, backtestResult, setBacktestResult, runBacktest, showToast }) {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [running, setRunning] = useState(false);

  const updateParam = (key, value) => setParams((p) => ({ ...p, [key]: value }));

  const handleRun = async () => {
    setRunning(true);
    setBacktestResult?.(null);
    try {
      await runBacktest(params);
    } catch (err) {
      showToast?.(err?.message || 'Backtest failed', true);
    } finally {
      setRunning(false);
    }
  };

  const result = backtestResult;
  const metrics = result?.metrics || {};
  const tradeDetails = result?.trade_details || [];
  const equityChartData = result?.equity_chart_data || [];
  const paramsUsed = result?.params || {};

  return (
    <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 overflow-hidden">
      <div className="lg:w-72 flex-shrink-0 overflow-y-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Backtest Config
          </h2>
          <div className="space-y-2 text-sm">
            {['symbol', 'interval', 'period'].map((key) => (
              <div key={key}>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{key}</label>
                <input
                  type={key === 'period' ? 'text' : 'text'}
                  value={params[key]}
                  onChange={(e) => updateParam(key, e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 text-sm"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Initial Equity</label>
              <input
                type="number"
                value={params.initial_equity}
                onChange={(e) => updateParam('initial_equity', Number(e.target.value))}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="w-full mt-2 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
            >
              {running ? 'Running…' : 'Run Backtest'}
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
        {backtestProgress?.show && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{backtestProgress.text}</div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${backtestProgress.pct}%` }} />
            </div>
          </div>
        )}
        {result && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Sharpe', value: metrics.sharpe, fmt: (v) => fmt(v, 3) },
                { label: 'Sortino', value: metrics.sortino, fmt: (v) => fmt(v, 3) },
                { label: 'Max DD', value: metrics.max_drawdown, fmt: fmtPct },
                { label: 'Win Rate', value: metrics.win_rate, fmt: fmtPct },
                { label: 'Total PnL', value: result.total_pnl, fmt: (v) => (v != null ? '$' + fmt(v) : '—') },
                { label: 'Trades', value: result.trade_details?.length ?? tradeDetails.length, fmt: String },
              ].map(({ label, value, fmt: f }) => (
                <div key={label} className="rounded border border-gray-200 dark:border-gray-600 p-2 bg-gray-50 dark:bg-gray-900/50">
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">{label}</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{value != null ? f(value) : '—'}</div>
                </div>
              ))}
            </div>
            {equityChartData.length > 0 && (
              <div className="flex-1 min-h-[200px]">
                <EquityChart equityCurve={equityChartData.map((d) => ({ time: d.time, equity: d.value }))} />
              </div>
            )}
            {tradeDetails.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  Trade Log
                </h3>
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-left">
                        <th className="py-1.5 px-2 font-semibold">#</th>
                        <th className="py-1.5 px-2 font-semibold">Side</th>
                        <th className="py-1.5 px-2 font-semibold">Entry</th>
                        <th className="py-1.5 px-2 font-semibold">Exit</th>
                        <th className="py-1.5 px-2 font-semibold text-right">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeDetails.slice(0, 50).map((t, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-1 px-2">{i + 1}</td>
                          <td className="py-1 px-2 capitalize">{t.side ?? '—'}</td>
                          <td className="py-1 px-2">{t.entry_price != null ? fmt(t.entry_price) : '—'}</td>
                          <td className="py-1 px-2">{t.exit_price != null ? fmt(t.exit_price) : '—'}</td>
                          <td className={`py-1 px-2 text-right font-medium ${t.pnl != null && t.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {t.pnl != null ? (t.pnl >= 0 ? '+' : '') + fmt(t.pnl) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        {!result && !backtestProgress?.show && (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
            Configure and run a backtest to see results.
          </div>
        )}
      </div>
    </div>
  );
}
