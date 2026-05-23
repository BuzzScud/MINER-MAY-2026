import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useChecklist } from '../features/checklist/hooks/useChecklist';
import { ChecklistHeader } from '../features/checklist/components/ChecklistHeader';
import { ChecklistCategory } from '../features/checklist/components/ChecklistCategory';
import { ChecklistHistory } from '../features/checklist/components/ChecklistHistory';
import { CreateCategoryModal } from '../features/checklist/components/CreateCategoryModal';
import { ConfirmModal } from '../features/checklist/components/ConfirmModal';

export default function Checklist() {
  const api = useChecklist();
  const [expandedCategoryId, setExpandedCategoryId] = useState(null);
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
      <div className="w-full max-w-[1400px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-hidden">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-4 flex-shrink-0">
          <span className="font-medium text-gray-900 dark:text-white">Loading checklist…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-hidden">
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-4 flex-shrink-0">
        <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-900 dark:text-white">Checklist</span>
      </nav>

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
        <p className="text-xs text-red-600 dark:text-red-400 mb-2" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  isExpanded={expandedCategoryId === cat.id}
                  onToggleExpand={() =>
                    setExpandedCategoryId((prev) => (prev === cat.id ? null : cat.id))
                  }
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
        </div>
        <div className="w-full lg:w-80 flex-shrink-0 min-h-0 overflow-auto">
          <ChecklistHistory
            historyDates={historyDates}
            history={history}
            historyMeta={historyMeta}
            allItemsForStats={allItemsForStats}
            selectedDate={selectedDate}
            onLoadRun={handleLoadHistoryRun}
            onOpenDeleteModal={handleOpenDeleteModal}
          />
        </div>
      </div>

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
