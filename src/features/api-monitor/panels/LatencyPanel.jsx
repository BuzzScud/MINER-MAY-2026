import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Panel } from '../../../components/common/Panel';
import { CHECK_ENDPOINTS } from '../api/healthChecks';

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#06b6d4'];

export function LatencyPanel({ endpoints, getHistory }) {
  const endpointIds = useMemo(() => CHECK_ENDPOINTS.map((c) => c.id), []);

  const chartData = useMemo(() => {
    const byTime = new Map();
    endpointIds.forEach((id) => {
      const history = getHistory ? getHistory(id) : [];
      history.forEach((p) => {
        const t = p.timestamp;
        if (!byTime.has(t)) byTime.set(t, { time: t, timeLabel: new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) });
        const row = byTime.get(t);
        const ms = p.status === 'up' || p.status === 'degraded' ? p.latencyMs : null;
        row[id] = ms;
      });
    });
    const sorted = [...byTime.values()].sort((a, b) => a.time - b.time);
    return sorted.slice(-60);
  }, [endpointIds, getHistory, endpoints]);

  const names = useMemo(() => {
    const map = Object.fromEntries(CHECK_ENDPOINTS.map((c) => [c.id, c.name]));
    return map;
  }, []);

  if (chartData.length === 0) {
    return (
      <Panel title="Latency Over Time">
        <div className="h-[220px] flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
          Collecting latency data... Check again in a moment.
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Latency Over Time">
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-600" />
            <XAxis
              dataKey="timeLabel"
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
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v} ms`)}
              unit=" ms"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--tooltip-bg, #fff)',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
              }}
              labelStyle={{ color: '#4b5563' }}
              formatter={(value, name) => [value != null ? `${value} ms` : '—', names[name] ?? name]}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(value) => names[value] ?? value}
            />
            {endpointIds.slice(0, 6).map((id, i) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                name={id}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
