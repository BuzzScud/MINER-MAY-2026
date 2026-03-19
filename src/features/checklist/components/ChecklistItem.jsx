import { Pencil, Trash2 } from 'lucide-react';

/**
 * Single checklist row: checkbox, label (or inline edit input), pencil edit on hover, optional remove for custom items.
 */
export function ChecklistItem({
  itemId,
  label,
  checked,
  isEditing,
  editingLabel,
  isCustom,
  onToggle,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  setEditingLabel,
  onRemove,
}) {
  return (
    <div className="group flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(itemId)}
        aria-label={label}
        className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 dark:bg-gray-800 dark:focus:ring-indigo-400 shrink-0"
      />
      <div className="flex-1 flex items-start justify-between gap-2 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={editingLabel}
            onChange={(e) => setEditingLabel(e.target.value)}
            onBlur={() => onCommitEdit(itemId, isCustom)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitEdit(itemId, isCustom);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            maxLength={100}
            className="block w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
            autoFocus
            aria-label="Edit item label"
          />
        ) : (
          <>
            <span
              className="cursor-text flex-1 min-w-0 truncate"
              onDoubleClick={() => onStartEdit(itemId, label)}
            >
              {label}
            </span>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onStartEdit(itemId, label)}
                className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Edit item"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {isCustom && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(itemId)}
                  className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  aria-label="Remove item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
