import { useRef, useEffect } from 'react';
import { fmt, fmtPct } from '../utils/formatters';

const METRICS = [
  { key: 'equity', label: 'Equity', format: (v, m) => (v != null ? '$' + fmt(v, 2) : '—'), getVal: (e) => e?.equity },
  { key: 'sharpe', label: 'Sharpe', format: (v) => (v != null ? fmt(v, 3) : '—'), getVal: (e) => e?.metrics?.sharpe },
  { key: 'sortino', label: 'Sortino', format: (v) => (v != null ? fmt(v, 3) : '—'), getVal: (e) => e?.metrics?.sortino },
  { key: 'calmar', label: 'Calmar', format: (v) => (v != null ? fmt(v, 3) : '—'), getVal: (e) => e?.metrics?.calmar },
  { key: 'max_drawdown', label: 'Max DD', format: (v) => (v != null ? fmtPct(v) : '—'), getVal: (e) => e?.metrics?.max_drawdown },
  { key: 'win_rate', label: 'Win Rate', format: (v) => (v != null ? fmtPct(v) : '—'), getVal: (e) => e?.metrics?.win_rate },
  { key: 'expectancy', label: 'Expectancy', format: (v) => (v != null ? '$' + fmt(v) : '—'), getVal: (e) => e?.metrics?.expectancy },
  { key: 'total_trades', label: 'Trades', format: (v) => (v != null ? String(Math.floor(v)) : '—'), getVal: (e) => e?.metrics?.total_trades },
  { key: 'profit_factor', label: 'Profit Factor', format: (v) => (v != null ? fmt(v) : '—'), getVal: (e) => e?.metrics?.profit_factor },
  { key: 'total_pnl', label: 'Total PnL', format: (v) => (v != null ? '$' + fmt(v) : '—'), getVal: (e) => e?.metrics?.total_pnl },
  { key: 'avg_win', label: 'Avg Win', format: (v) => (v != null ? '$' + fmt(v) : '—'), getVal: (e) => e?.metrics?.avg_win },
  { key: 'avg_loss', label: 'Avg Loss', format: (v) => (v != null ? '$' + fmt(v) : '—'), getVal: (e) => e?.metrics?.avg_loss },
];

function MetricCard({ label, value, prevValue }) {
  const elRef = useRef(null);
  const isNew = prevValue !== undefined && prevValue !== value;

  useEffect(() => {
    if (!isNew || !elRef.current) return;
    elRef.current.classList.add('flash-up');
    const t = setTimeout(() => elRef.current?.classList.remove('flash-up'), 400);
    return () => clearTimeout(t);
  }, [value, isNew]);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 p-2 hover:border-sky-500 dark:hover:border-sky-500 transition-colors">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div ref={elRef} className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums mt-0.5">
        {value}
      </div>
    </div>
  );
}

export function MetricsGrid({ equity }) {
  const prevRef = useRef({});

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {METRICS.map(({ key, label, format, getVal }) => {
        const raw = getVal(equity);
        const value = format(raw, equity?.metrics);
        const prevValue = prevRef.current[key];
        if (prevValue !== value) prevRef.current[key] = value;
        return (
          <MetricCard key={key} label={label} value={value} prevValue={prevValue} />
        );
      })}
    </div>
  );
}
