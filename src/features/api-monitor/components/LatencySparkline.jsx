/**
 * Tiny inline sparkline for latency history (last N points).
 * Renders an SVG path; no external chart lib.
 */
export function LatencySparkline({ data, width = 64, height = 24, maxPoints = 20 }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <svg width={width} height={height} className="shrink-0 text-gray-300 dark:text-gray-600" aria-hidden>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeWidth="1" strokeDasharray="2" />
      </svg>
    );
  }

  const points = data.slice(-maxPoints);
  const values = points.map((p) => p.latencyMs ?? 0).filter((v) => typeof v === 'number');
  if (values.length === 0) {
    return (
      <svg width={width} height={height} className="shrink-0" aria-hidden>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeWidth="1" strokeDasharray="2" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const stepX = chartWidth / (values.length - 1 || 1);

  const pathD = values
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = padding + chartHeight - ((v - min) / range) * chartHeight;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden>
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
