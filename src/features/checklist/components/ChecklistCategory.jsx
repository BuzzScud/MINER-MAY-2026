import { Pencil } from 'lucide-react';
import { ChecklistItem } from './ChecklistItem';

export function ChecklistCategory({
  category,
  categoryItemIds,
  selectedCompleted,
  customItemsInCategory,
  labelOverrides,
  displayLabel,
  isEditingHeader,
  editingCategoryLabel,
  setEditingCategoryLabel,
  editingItemId,
  editingLabel,
  setEditingLabel,
  onToggleItem,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onRemoveCustom,
  onToggleCategoryAll,
  onStartEditCategory,
  onCancelEditCategory,
  onCommitEditCategory,
  onDeleteCategory,
}) {
  const completedCount = selectedCompleted.filter((id) =>
    categoryItemIds.includes(id),
  ).length;
  const totalCount = categoryItemIds.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allChecked =
    totalCount > 0 && categoryItemIds.every((id) => selectedCompleted.includes(id));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          {isEditingHeader ? (
            <input
              type="text"
              value={editingCategoryLabel}
              onChange={(e) => setEditingCategoryLabel(e.target.value)}
              onBlur={() => onCommitEditCategory(category.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCommitEditCategory(category.id);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelEditCategory();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              maxLength={100}
              className="block w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              autoFocus
              aria-label="Edit category title"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-400">
                {displayLabel}
              </h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                pct === 100
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                  : pct > 0
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}>
                {completedCount}/{totalCount}
              </span>
            </div>
          )}
        </div>
        {!isEditingHeader && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onStartEditCategory(category.id, displayLabel)}
              className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Edit category title"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {onDeleteCategory && (
              <button
                type="button"
                onClick={() => onDeleteCategory(category.id)}
                className="text-[11px] font-medium text-red-500 hover:text-red-400 transition-colors"
                aria-label="Delete category"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1 mb-3">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">Completion</p>
          <p className="text-xs font-semibold text-gray-900 dark:text-white">{pct}%</p>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              pct === 100
                ? 'bg-green-500'
                : 'bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
          <span>
            Done: <span className="font-semibold text-gray-700 dark:text-gray-200">{completedCount}</span>
          </span>
          <span>
            Remaining: <span className="font-semibold text-gray-700 dark:text-gray-200">{totalCount - completedCount}</span>
          </span>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => onToggleCategoryAll(category.id)}
            className="text-xs font-medium text-sky-500 hover:text-sky-400 transition-colors"
          >
            {allChecked ? 'Uncheck all' : 'Check all'}
          </button>
        </div>
      )}

      <div className="border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1.5">
        {category.items.map((item) => {
          const checked = selectedCompleted.includes(item.id);
          const itemLabel = labelOverrides[item.id]?.trim() || item.label;
          return (
            <ChecklistItem
              key={item.id}
              itemId={item.id}
              label={itemLabel}
              checked={checked}
              isEditing={editingItemId === item.id}
              editingLabel={editingLabel}
              isCustom={false}
              onToggle={onToggleItem}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onCommitEdit={onCommitEdit}
              setEditingLabel={setEditingLabel}
            />
          );
        })}
        {customItemsInCategory.map((item) => {
          const checked = selectedCompleted.includes(item.id);
          return (
            <ChecklistItem
              key={item.id}
              itemId={item.id}
              label={item.label}
              checked={checked}
              isEditing={editingItemId === item.id}
              editingLabel={editingLabel}
              isCustom
              onToggle={onToggleItem}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onCommitEdit={onCommitEdit}
              setEditingLabel={setEditingLabel}
              onRemove={onRemoveCustom}
            />
          );
        })}
        {totalCount === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
            No items in this category yet.
          </p>
        )}
      </div>
    </div>
  );
}
