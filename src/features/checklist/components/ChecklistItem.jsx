import { Pencil, Trash2 } from 'lucide-react';

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
    <div className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
      checked
        ? 'bg-green-50 dark:bg-green-900/10'
        : 'bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(itemId)}
        aria-label={label}
        className="rounded border-gray-300 dark:border-gray-500 text-sky-500 focus:ring-sky-500 dark:bg-gray-700 dark:focus:ring-sky-400 shrink-0 w-4 h-4"
      />
      <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
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
            className="block w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            autoFocus
            aria-label="Edit item label"
          />
        ) : (
          <>
            <span
              className={`cursor-text flex-1 min-w-0 text-sm font-medium ${
                checked
                  ? 'text-gray-400 dark:text-gray-500 line-through'
                  : 'text-gray-900 dark:text-white'
              }`}
              onDoubleClick={() => onStartEdit(itemId, label)}
            >
              {label}
            </span>
            <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onStartEdit(itemId, label)}
                className="text-[11px] font-medium text-sky-500 hover:text-sky-400 transition-colors"
                aria-label="Edit item"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {isCustom && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(itemId)}
                  className="text-[11px] font-medium text-red-500 hover:text-red-400 transition-colors"
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
