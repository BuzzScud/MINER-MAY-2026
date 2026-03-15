/**
 * Shared sentiment gauge: score in [-1, 1] shown as arc with Bullish/Neutral/Bearish label.
 */
export function Gauge({ score, stale = false }) {
  const numScore = Number(score);
  const safeScore = Number.isFinite(numScore) ? numScore : 0;
  const clamped = Math.max(-1, Math.min(1, safeScore));
  const pct = ((clamped + 1) / 2) * 100;
  const label =
    safeScore > 0.3 ? 'Bullish' : safeScore < -0.3 ? 'Bearish' : 'Neutral';
  const colorClass =
    safeScore > 0.3
      ? 'text-green-500'
      : safeScore < -0.3
        ? 'text-red-500'
        : 'text-gray-400 dark:text-gray-500';

  return (
    <figure className="m-0 text-center">
      <svg
        viewBox="0 -12 120 72"
        width="100%"
        height={96}
        className="block"
        aria-hidden="true"
      >
        <path
          d="M 10 50 A 50 50 0 0 1 110 50"
          fill="none"
          strokeWidth="8"
          className="stroke-gray-300 dark:stroke-gray-600"
        />
        <path
          d="M 10 50 A 50 50 0 0 1 110 50"
          fill="none"
          stroke={
            safeScore > 0.3
              ? 'rgb(34, 197, 94)'
              : safeScore < -0.3
                ? 'rgb(239, 68, 68)'
                : 'rgb(161, 161, 170)'
          }
          strokeWidth="8"
          strokeDasharray={`${pct * 1.57} 157`}
          strokeLinecap="round"
        />
        <text
          x="60"
          y="42"
          textAnchor="middle"
          className="fill-gray-900 dark:fill-gray-100 text-sm font-semibold"
        >
          {safeScore.toFixed(2)}
        </text>
      </svg>
      <figcaption className={`font-semibold mt-1 ${colorClass}`}>
        {label}
        {stale ? ' (stale)' : ''}
      </figcaption>
    </figure>
  );
}
