/**
 * Shared panel wrapper for consistent card layout across features (api-monitor, mempool, etc.).
 */
export function Panel({ title, children }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5">
      {title && (
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
