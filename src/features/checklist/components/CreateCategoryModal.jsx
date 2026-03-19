import { useEffect } from 'react';

/**
 * Modal to create a new checklist category with a title and multiple items.
 */
export function CreateCategoryModal({
  open,
  onClose,
  title,
  setTitle,
  items,
  itemInput,
  setItemInput,
  onAddItem,
  onRemoveItem,
  onCreate,
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const canCreate = title.trim().length > 0 && items.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-category-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            id="create-category-modal-title"
            className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100"
          >
            Create new checklist
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="create-category-title"
              className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
            >
              Checklist title
            </label>
            <input
              id="create-category-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Options playbook"
              className="block w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
            />
          </div>

          <div>
            <label
              htmlFor="create-category-item"
              className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
            >
              Add items
            </label>
            <div className="flex gap-3">
              <input
                id="create-category-item"
                type="text"
                value={itemInput}
                onChange={(e) => setItemInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onAddItem();
                  }
                }}
                maxLength={100}
                placeholder="e.g. Check options flow"
                className="block flex-1 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              />
              <button
                type="button"
                onClick={onAddItem}
                disabled={!itemInput.trim()}
                className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                + Add
              </button>
            </div>
          </div>

          {items.length > 0 && (
            <ul className="space-y-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5 max-h-48 overflow-y-auto">
              {items.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="flex items-center gap-3 text-xs text-gray-800 dark:text-gray-100"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{item}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="text-xs font-semibold text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onCreate}
              disabled={!canCreate}
              className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create checklist
            </button>
            {items.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {items.length} item{items.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
