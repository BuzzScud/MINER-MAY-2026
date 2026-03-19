import { useState } from 'react';
import { useChecklist } from '../../checklist/hooks/useChecklist';
import { ChecklistHeader } from '../../checklist/components/ChecklistHeader';
import { ChecklistCategory } from '../../checklist/components/ChecklistCategory';
import { ChecklistHistory } from '../../checklist/components/ChecklistHistory';
import { CreateCategoryModal } from '../../checklist/components/CreateCategoryModal';
import { ConfirmModal } from '../../checklist/components/ConfirmModal';

export function ChecklistTab() {
  const api = useChecklist();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const {
    loading,
    error,
    selectedDate,
    setSelectedDate,
    visibleCategories,
    allItemsForStats,
    customItems,
    labelOverrides,
    categoryLabelOverrides,
    selectedCompleted,
    checklistTitle,
    setChecklistTitle,
    checklistNotes,
    setChecklistNotes,
    todayPct,
    streak,
    totalDaysCompleted,
    historyDates,
    history,
    historyMeta,
    canSaveRun,
    newChecklistTitle,
    setNewChecklistTitle,
    newChecklistItems,
    newChecklistItemInput,
    setNewChecklistItemInput,
    editingItemId,
    editingLabel,
    setEditingLabel,
    editingCategoryId,
    editingCategoryLabel,
    setEditingCategoryLabel,
    showDeleteModal,
    showDeleteCategoryModal,
    showSavedFeedback,
    setShowSavedFeedback,
    handleToggleItem,
    handleToggleCategoryAll,
    handleAddBulletItem,
    handleRemoveBulletItem,
    handleRemoveCustom,
    handleStartEdit,
    handleCancelEdit,
    handleCommitEdit,
    handleStartEditCategory,
    handleCancelEditCategory,
    handleCommitEditCategory,
    handleSaveDay,
    handleResetDay,
    handleOpenDeleteModal,
    handleLoadHistoryRun,
    handleCloseDeleteModal,
    handleConfirmDeleteChecklist,
    handleOpenDeleteCategoryModal,
    handleCloseDeleteCategoryModal,
    handleConfirmDeleteCategory,
    handleCreateNewChecklist,
    getTodayIso,
  } = api;

  const handleSaveWithFeedback = () => {
    handleSaveDay();
    setShowSavedFeedback(true);
  };

  const handleCreateCategory = () => {
    handleCreateNewChecklist();
    setShowCreateModal(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm text-gray-500 dark:text-gray-400">Loading checklist...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
      <ChecklistHeader
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        getTodayIso={getTodayIso}
        streak={streak}
        totalDaysCompleted={totalDaysCompleted}
        todayPct={todayPct}
        canSaveRun={canSaveRun}
        onSave={handleSaveWithFeedback}
        onReset={handleResetDay}
        onResetConfirmRequest={() => setShowResetModal(true)}
        checklistTitle={checklistTitle}
        setChecklistTitle={setChecklistTitle}
        checklistNotes={checklistNotes}
        setChecklistNotes={setChecklistNotes}
        showSavedFeedback={showSavedFeedback}
        onCreateCategoryClick={() => setShowCreateModal(true)}
      />

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2.5">
          <p className="text-xs text-red-800 dark:text-red-300" role="alert">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {visibleCategories.map((cat) => {
          const categoryPresetIds = cat.items.map((i) => i.id);
          const categoryCustomIds = customItems
            .filter((c) => c.category === cat.id)
            .map((c) => c.id);
          const categoryIds = [...categoryPresetIds, ...categoryCustomIds];
          const customItemsInCategory = customItems.filter((c) => c.category === cat.id);
          const displayLabel = categoryLabelOverrides[cat.id]?.trim() || cat.label;

          return (
            <ChecklistCategory
              key={cat.id}
              category={cat}
              categoryItemIds={categoryIds}
              selectedCompleted={selectedCompleted}
              customItemsInCategory={customItemsInCategory}
              labelOverrides={labelOverrides}
              displayLabel={displayLabel}
              isEditingHeader={editingCategoryId === cat.id}
              editingCategoryLabel={editingCategoryLabel}
              setEditingCategoryLabel={setEditingCategoryLabel}
              editingItemId={editingItemId}
              editingLabel={editingLabel}
              setEditingLabel={setEditingLabel}
              onToggleItem={handleToggleItem}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onCommitEdit={handleCommitEdit}
              onRemoveCustom={handleRemoveCustom}
              onToggleCategoryAll={handleToggleCategoryAll}
              onStartEditCategory={handleStartEditCategory}
              onCancelEditCategory={handleCancelEditCategory}
              onCommitEditCategory={handleCommitEditCategory}
              onDeleteCategory={handleOpenDeleteCategoryModal}
            />
          );
        })}
      </div>

      <ChecklistHistory
        historyDates={historyDates}
        history={history}
        historyMeta={historyMeta}
        allItemsForStats={allItemsForStats}
        selectedDate={selectedDate}
        onLoadRun={handleLoadHistoryRun}
        onOpenDeleteModal={handleOpenDeleteModal}
      />

      <CreateCategoryModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={newChecklistTitle}
        setTitle={setNewChecklistTitle}
        items={newChecklistItems}
        itemInput={newChecklistItemInput}
        setItemInput={setNewChecklistItemInput}
        onAddItem={handleAddBulletItem}
        onRemoveItem={handleRemoveBulletItem}
        onCreate={handleCreateCategory}
      />

      <ConfirmModal
        open={showResetModal}
        title="Reset this checklist?"
        description="This will uncheck all items and clear the title and notes for the selected day. Your saved history will not be affected."
        confirmLabel="Reset"
        variant="danger"
        onConfirm={() => {
          handleResetDay();
          setShowResetModal(false);
        }}
        onCancel={() => setShowResetModal(false)}
      />

      <ConfirmModal
        open={showDeleteModal}
        title="Delete saved checklist?"
        description="This will permanently remove the saved checklist from your history. This action cannot be undone."
        confirmLabel="Delete checklist"
        variant="danger"
        onConfirm={handleConfirmDeleteChecklist}
        onCancel={handleCloseDeleteModal}
      />

      <ConfirmModal
        open={showDeleteCategoryModal}
        title="Delete this checklist card?"
        description="This removes the checklist card, its custom items, and related completion history. This action cannot be undone."
        confirmLabel="Delete checklist"
        variant="danger"
        onConfirm={handleConfirmDeleteCategory}
        onCancel={handleCloseDeleteCategoryModal}
      />
    </div>
  );
}
