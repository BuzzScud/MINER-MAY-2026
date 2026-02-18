/**
 * Status dot + label (up / degraded / down). Matches mempool live indicator style.
 */
export function StatusBadge({ status, label }) {
  const isUp = status === 'up';
  const isDegraded = status === 'degraded';
  const isDown = status === 'down';

  const dotClass = isUp
    ? 'bg-green-500'
    : isDegraded
      ? 'bg-amber-500'
      : 'bg-red-500';

  const textClass = isUp
    ? 'text-green-600 dark:text-green-400'
    : isDegraded
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400';

  const displayLabel = label ?? (isUp ? 'Up' : isDegraded ? 'Degraded' : 'Down');

  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${dotClass} ${isDown ? '' : ''} ${isDegraded ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      <span className={`text-xs font-medium ${textClass}`}>{displayLabel}</span>
    </div>
  );
}
