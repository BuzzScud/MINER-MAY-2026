import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { ChecklistItem } from './ChecklistItem';

/**
 * Accordion card for one checklist category: header with progress bar and expand/collapse, inline items when expanded.
 */
export function ChecklistCategory({
  category,
  categoryItemIds,
  selectedCompleted,
  customItemsInCategory,
  labelOverrides,
  displayLabel,
  isExpanded,
  onToggleExpand,
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
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden transition-shadow hover:shadow-sm">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 p-4 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset rounded-t-lg"
      >
        <span className="text-gray-500 dark:text-gray-400 shrink-0" aria-hidden>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>
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
              className="block w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              autoFocus
              aria-label="Edit category title"
            />
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-200 truncate">
                {displayLabel}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {completedCount} of {totalCount} complete
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden transition-all duration-300">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          )}
        </div>
        {!isEditingHeader && (
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartEditCategory(category.id, displayLabel);
              }}
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Edit category title"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {onDeleteCategory && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteCategory(category.id);
                }}
                className="p-1.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium"
                aria-label="Delete category"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 pt-3 space-y-2">
            <div className="flex justify-between items-center mb-1">
              {totalCount > 0 && (
                <button
                  type="button"
                  onClick={() => onToggleCategoryAll(category.id)}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  {allChecked ? 'Uncheck all' : 'Check all'}
                </button>
              )}
            </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
