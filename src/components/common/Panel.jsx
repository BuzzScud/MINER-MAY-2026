/**
 * Shared panel wrapper for consistent card layout across features (api-monitor, mempool, etc.).
 */
export function Panel({ title, children }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {title && (
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
