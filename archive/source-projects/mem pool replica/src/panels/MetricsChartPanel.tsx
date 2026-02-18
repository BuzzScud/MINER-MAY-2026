import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Panel } from '../components/Panel';
import { useMempoolWebSocket } from '../hooks/useMempoolWebSocket';
import { useMempoolStats } from '../hooks/useMempoolQueries';

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

export function MetricsChartPanel() {
  const { chartData, mempoolInfo, connected } = useMempoolWebSocket();
  const { data: mempoolStats, isError: mempoolError, refetch: refetchMempool } = useMempoolStats();

  const chartSeries = useMemo(() => {
    if (!chartData.length) return [];
    return chartData.map((p) => ({
      time: formatTime(p.time),
      timestamp: p.time,
      value: p.value,
    }));
  }, [chartData]);

  const minFee = mempoolInfo?.mempoolminfee != null
    ? (mempoolInfo.mempoolminfee * 100_000).toFixed(2)
    : '—';
  const usageBytes = mempoolInfo?.usage ?? mempoolStats?.vsize ?? 0;
  const maxBytes = mempoolInfo?.maxmempool ?? 300_000_000;
  const usageMb = (usageBytes / 1_000_000).toFixed(0);
  const maxMb = (maxBytes / 1_000_000).toFixed(0);
  const usagePercent = maxBytes > 0 ? (usageBytes / maxBytes) * 100 : 0;
  const unconfirmed = mempoolStats?.count ?? mempoolInfo?.size ?? 0;

  if (mempoolError && !mempoolStats) {
    return (
      <Panel title="Incoming Transactions">
        <p className="text-red-400">Data unavailable. mempool.space API could not be reached.</p>
        <button
          type="button"
          onClick={() => refetchMempool()}
          className="mt-2 rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
        >
          Retry
        </button>
      </Panel>
    );
  }

  return (
    <Panel title="Incoming Transactions">
      {connected && (
        <span className="mb-2 inline-block text-xs text-mempool-accent">Live</span>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div>
          <span className="text-sm text-gray-400">Minimum fee:</span>
          <span className="ml-2 text-sm font-medium text-blue-400">{minFee} sat/vB</span>
        </div>
        <div className="flex-1 min-w-[120px]">
          <span className="text-sm text-gray-400">Memory Usage:</span>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-mempool-border">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-500"
                style={{ width: `${Math.min(100, usagePercent)}%` }}
              />
            </div>
            <span className="text-sm text-gray-400">
              {usageMb} MB / {maxMb} MB
            </span>
          </div>
        </div>
        <div>
          <span className="text-sm text-gray-400">Unconfirmed:</span>
          <span className="ml-2 text-sm font-medium text-blue-400">
            {unconfirmed.toLocaleString()} TXs
          </span>
        </div>
      </div>

      <h3 className="mb-2 text-sm font-medium text-blue-400">vB/s (2h)</h3>
      <div className="h-[200px] w-full">
        {!connected && chartSeries.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded bg-mempool-border/30 text-gray-500">
            Connecting to live data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis
                dataKey="time"
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161b22',
                  border: '1px solid #21262d',
                  borderRadius: '6px',
                }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(value: number | undefined) => [
                  value != null ? value.toLocaleString() : '—',
                  'vB/s',
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#22c55e"
                strokeWidth={1.5}
                fill="url(#chartGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
