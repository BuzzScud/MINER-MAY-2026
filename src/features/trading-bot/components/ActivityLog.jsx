export function ActivityLog({ activityLog }) {
  const entries = Array.isArray(activityLog) ? [...activityLog].reverse().slice(0, 80) : [];

  if (entries.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 py-2">Waiting for activity...</div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-40 text-xs font-mono space-y-0.5 pr-1">
      {entries.map((entry, i) => {
        const line = typeof entry === 'string' ? entry : (entry.message || entry.text || JSON.stringify(entry));
        const level = entry?.level || 'info';
        const color =
          level === 'error' ? 'text-red-600 dark:text-red-400' :
          level === 'warn' ? 'text-amber-600 dark:text-amber-400' :
          'text-gray-600 dark:text-gray-400';
        return (
          <div key={i} className={`py-0.5 break-words ${color}`}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
