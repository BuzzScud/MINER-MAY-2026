import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useStorage, saveBatch } from '../../../utils/storage';
import { STORAGE_KEYS } from '../../../utils/storageKeys';
import { CATEGORIES, ALL_PRESET_IDS, getTodayIso } from '../constants';

const BATCH_SAVE_DEBOUNCE_MS = 400;

export function useChecklist() {
  const { getItem, token } = useStorage();
  const [history, setHistory] = useState({});
  const [historyMeta, setHistoryMeta] = useState({});
  const [customItems, setCustomItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getTodayIso());
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newChecklistItems, setNewChecklistItems] = useState([]);
  const [newChecklistItemInput, setNewChecklistItemInput] = useState('');
  const [labelOverrides, setLabelOverrides] = useState({});
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [categoryLabelOverrides, setCategoryLabelOverrides] = useState({});
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryLabel, setEditingCategoryLabel] = useState('');
  const [checklistTitle, setChecklistTitle] = useState('');
  const [checklistNotes, setChecklistNotes] = useState('');
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetIso, setDeleteTargetIso] = useState(null);
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false);
  const [deleteCategoryId, setDeleteCategoryId] = useState(null);
  const [userCategories, setUserCategories] = useState([]);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [workingChecks, setWorkingChecks] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          storedHistory,
          storedCustom,
          storedLabelOverrides,
          storedMeta,
          storedCategoryLabelOverrides,
          storedHiddenCategoryIds,
          storedUserCategories,
        ] = await Promise.all([
          getItem(STORAGE_KEYS.CHECKLIST_HISTORY),
          getItem(STORAGE_KEYS.CHECKLIST_CUSTOM_ITEMS),
          getItem(STORAGE_KEYS.CHECKLIST_LABEL_OVERRIDES),
          getItem(STORAGE_KEYS.CHECKLIST_HISTORY_META),
          getItem(STORAGE_KEYS.CHECKLIST_CATEGORY_LABEL_OVERRIDES),
          getItem(STORAGE_KEYS.CHECKLIST_HIDDEN_CATEGORY_IDS),
          getItem(STORAGE_KEYS.CHECKLIST_USER_CATEGORIES),
        ]);
        if (cancelled) return;
        setHistory(storedHistory && typeof storedHistory === 'object' ? storedHistory : {});
        setCustomItems(Array.isArray(storedCustom) ? storedCustom : []);
        setLabelOverrides(
          storedLabelOverrides && typeof storedLabelOverrides === 'object'
            ? storedLabelOverrides
            : {},
        );
        setHistoryMeta(storedMeta && typeof storedMeta === 'object' ? storedMeta : {});
        setCategoryLabelOverrides(
          storedCategoryLabelOverrides &&
          typeof storedCategoryLabelOverrides === 'object'
            ? storedCategoryLabelOverrides
            : {},
        );
        setHiddenCategoryIds(Array.isArray(storedHiddenCategoryIds) ? storedHiddenCategoryIds : []);
        setUserCategories(
          Array.isArray(storedUserCategories)
            ? storedUserCategories.filter(
                (category) =>
                  category &&
                  typeof category === 'object' &&
                  typeof category.id === 'string' &&
                  typeof category.label === 'string' &&
                  Array.isArray(category.items),
              )
            : [],
        );
        loadedRef.current = true;
      } catch {
        if (!cancelled) setError('Failed to load checklist data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getItem]);

  useEffect(() => {
    if (loading) return;
    setWorkingChecks(Array.isArray(history[selectedDate]) ? [...history[selectedDate]] : []);
  }, [loading, selectedDate, history]);

  useEffect(() => {
    if (!loadedRef.current || loading || !isDirty) return;
    const timeoutId = setTimeout(() => {
      saveBatch(token, {
        [STORAGE_KEYS.CHECKLIST_HISTORY]: history,
        [STORAGE_KEYS.CHECKLIST_CUSTOM_ITEMS]: customItems,
        [STORAGE_KEYS.CHECKLIST_LABEL_OVERRIDES]: labelOverrides,
        [STORAGE_KEYS.CHECKLIST_HISTORY_META]: historyMeta,
        [STORAGE_KEYS.CHECKLIST_CATEGORY_LABEL_OVERRIDES]: categoryLabelOverrides,
        [STORAGE_KEYS.CHECKLIST_HIDDEN_CATEGORY_IDS]: hiddenCategoryIds,
        [STORAGE_KEYS.CHECKLIST_USER_CATEGORIES]: userCategories,
      })
        .then(() => setIsDirty(false))
        .catch(() => {});
    }, BATCH_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [
    loading,
    isDirty,
    token,
    history,
    customItems,
    labelOverrides,
    historyMeta,
    categoryLabelOverrides,
    hiddenCategoryIds,
    userCategories,
  ]);

  useEffect(() => {
    const flush = () => {
      if (!loadedRef.current) return;
      saveBatch(token, {
        [STORAGE_KEYS.CHECKLIST_HISTORY]: history,
        [STORAGE_KEYS.CHECKLIST_CUSTOM_ITEMS]: customItems,
        [STORAGE_KEYS.CHECKLIST_LABEL_OVERRIDES]: labelOverrides,
        [STORAGE_KEYS.CHECKLIST_HISTORY_META]: historyMeta,
        [STORAGE_KEYS.CHECKLIST_CATEGORY_LABEL_OVERRIDES]: categoryLabelOverrides,
        [STORAGE_KEYS.CHECKLIST_HIDDEN_CATEGORY_IDS]: hiddenCategoryIds,
        [STORAGE_KEYS.CHECKLIST_USER_CATEGORIES]: userCategories,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [token, history, customItems, labelOverrides, historyMeta, categoryLabelOverrides, hiddenCategoryIds, userCategories]);

  useEffect(() => {
    if (!showSavedFeedback) return;
    const id = setTimeout(() => setShowSavedFeedback(false), 2000);
    return () => clearTimeout(id);
  }, [showSavedFeedback]);

  useEffect(() => {
    const meta = historyMeta[selectedDate];
    setChecklistTitle(meta?.title || '');
    setChecklistNotes(meta?.notes || '');
  }, [selectedDate, historyMeta]);

  const allCategories = useMemo(
    () => [...CATEGORIES, ...userCategories],
    [userCategories],
  );
  const visibleCategories = useMemo(
    () =>
      allCategories.filter((category) => !hiddenCategoryIds.includes(category.id)),
    [allCategories, hiddenCategoryIds],
  );
  const allItemsForStats = useMemo(
    () => [
      ...visibleCategories.flatMap((category) =>
        category.items.map((item) => item.id),
      ),
      ...customItems
        .filter((item) => !hiddenCategoryIds.includes(item.category))
        .map((item) => item.id),
    ],
    [customItems, hiddenCategoryIds, visibleCategories],
  );

  const itemLabelMap = useMemo(() => {
    const map = {};
    CATEGORIES.forEach((category) => {
      category.items.forEach((item) => {
        const overridden = labelOverrides[item.id];
        map[item.id] =
          typeof overridden === 'string' && overridden.trim()
            ? overridden
            : item.label;
      });
    });
    customItems.forEach((item) => {
      map[item.id] = item.label;
    });
    return map;
  }, [customItems, labelOverrides]);

  const todayIso = getTodayIso();
  const todayCompleted = history[todayIso] || [];
  const todayPct =
    allItemsForStats.length > 0 ? todayCompleted.length / allItemsForStats.length : 0;
  const historyDates = useMemo(
    () =>
      Object.keys(historyMeta)
        .filter((d) => historyMeta[d] && historyMeta[d].saved)
        .sort((a, b) => (a < b ? 1 : -1)),
    [historyMeta],
  );

  const streak = useMemo(() => {
    const completedDates = new Set(
      Object.entries(history)
        .filter(([, arr]) => Array.isArray(arr) && arr.length > 0)
        .map(([d]) => d),
    );
    let count = 0;
    const cursor = new Date(todayIso);
    for (let i = 0; i < 366; i += 1) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const iso = `${y}-${m}-${d}`;
      if (!completedDates.has(iso)) break;
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [history, todayIso]);

  const totalDaysCompleted = useMemo(
    () =>
      Object.values(history).filter(
        (arr) => Array.isArray(arr) && arr.length > 0,
      ).length,
    [history],
  );

  const selectedCompleted = workingChecks;
  const canSaveRun =
    workingChecks.length > 0 ||
    Boolean(checklistTitle.trim()) ||
    Boolean(checklistNotes.trim());

  const handleToggleItem = useCallback((itemId) => {
    setWorkingChecks((prev) => {
      const exists = prev.includes(itemId);
      return exists ? prev.filter((id) => id !== itemId) : [...prev, itemId];
    });
  }, []);

  const handleToggleCategoryAll = useCallback(
    (categoryId) => {
      const presetIds =
        allCategories.find((c) => c.id === categoryId)?.items.map((i) => i.id) || [];
      const customIds = customItems
        .filter((c) => c.category === categoryId)
        .map((c) => c.id);
      const categoryIds = [...presetIds, ...customIds];
      if (categoryIds.length === 0) return;
      setWorkingChecks((prev) => {
        const allChecked = categoryIds.every((id) => prev.includes(id));
        return allChecked
          ? prev.filter((id) => !categoryIds.includes(id))
          : Array.from(new Set([...prev, ...categoryIds]));
      });
    },
    [allCategories, customItems],
  );

  const handleAddBulletItem = useCallback(() => {
    setNewChecklistItems((prev) => {
      const raw = newChecklistItemInput.trim();
      if (!raw) return prev;
      return [...prev, raw.slice(0, 100)];
    });
    setNewChecklistItemInput('');
  }, [newChecklistItemInput]);

  const handleRemoveBulletItem = useCallback((index) => {
    setNewChecklistItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRemoveCustom = useCallback((id) => {
    setCustomItems((prev) => prev.filter((c) => c.id !== id));
    setWorkingChecks((prev) => prev.filter((x) => x !== id));
    setHistory((prev) => {
      const next = {};
      Object.entries(prev).forEach(([day, arr]) => {
        next[day] = Array.isArray(arr) ? arr.filter((x) => x !== id) : [];
      });
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleStartEdit = useCallback((itemId, currentLabel) => {
    setEditingItemId(itemId);
    setEditingLabel(currentLabel);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingItemId(null);
    setEditingLabel('');
  }, []);

  const handleCommitEdit = useCallback(
    (itemId, isCustom) => {
      const raw = editingLabel.trim();
      if (!raw) {
        setEditingItemId(null);
        setEditingLabel('');
        return;
      }
      const label = raw.slice(0, 100);
      if (isCustom) {
        setCustomItems((prev) =>
          prev.map((c) => (c.id === itemId ? { ...c, label } : c)),
        );
      } else {
        setLabelOverrides((prev) => ({
          ...prev,
          [itemId]: label,
        }));
      }
      setIsDirty(true);
      setEditingItemId(null);
      setEditingLabel('');
    },
    [editingLabel],
  );

  const handleStartEditCategory = useCallback((categoryId, currentLabel) => {
    setEditingCategoryId(categoryId);
    setEditingCategoryLabel(currentLabel);
  }, []);

  const handleCancelEditCategory = useCallback(() => {
    setEditingCategoryId(null);
    setEditingCategoryLabel('');
  }, []);

  const handleCommitEditCategory = useCallback(
    (categoryId) => {
      const raw = editingCategoryLabel.trim();
      if (!raw) {
        setEditingCategoryId(null);
        setEditingCategoryLabel('');
        return;
      }
      const label = raw.slice(0, 100);
      setCategoryLabelOverrides((prev) => ({
        ...prev,
        [categoryId]: label,
      }));
      setIsDirty(true);
      setEditingCategoryId(null);
      setEditingCategoryLabel('');
    },
    [editingCategoryLabel],
  );

  const handleSaveDay = useCallback(() => {
    const trimmedTitle = checklistTitle.trim();
    const trimmedNotes = checklistNotes.trim();
    const hasCompletedItems = workingChecks.length > 0;
    const hasMeta = Boolean(trimmedTitle) || Boolean(trimmedNotes);
    if (!hasCompletedItems && !hasMeta) return;

    const nextHistory = { ...history, [selectedDate]: [...workingChecks] };
    const nextMeta = {
      ...historyMeta,
      [selectedDate]: {
        ...(historyMeta[selectedDate] || {}),
        title: trimmedTitle || historyMeta[selectedDate]?.title || selectedDate,
        notes: trimmedNotes,
        saved: true,
      },
    };
    setHistory(nextHistory);
    setHistoryMeta(nextMeta);
    setIsDirty(true);
  }, [
    checklistTitle,
    checklistNotes,
    workingChecks,
    history,
    historyMeta,
    selectedDate,
  ]);

  const handleResetDay = useCallback(() => {
    setWorkingChecks([]);
    setChecklistTitle('');
    setChecklistNotes('');
  }, []);

  const handleDeleteSavedChecklist = useCallback((iso) => {
    setHistoryMeta((prev) => {
      const next = { ...prev };
      delete next[iso];
      return next;
    });
    setHistory((prev) => {
      const next = { ...prev };
      delete next[iso];
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleOpenDeleteModal = useCallback((iso) => {
    setDeleteTargetIso(iso);
    setShowDeleteModal(true);
  }, []);

  const handleLoadHistoryRun = useCallback((iso) => {
    setSelectedDate(iso);
    setWorkingChecks(Array.isArray(history[iso]) ? [...history[iso]] : []);
  }, [history]);

  const handleCloseDeleteModal = useCallback(() => {
    setShowDeleteModal(false);
    setDeleteTargetIso(null);
  }, []);

  const handleConfirmDeleteChecklist = useCallback(() => {
    if (!deleteTargetIso) return;
    handleDeleteSavedChecklist(deleteTargetIso);
    setSelectedDate((prev) => (prev === deleteTargetIso ? getTodayIso() : prev));
    setShowDeleteModal(false);
    setDeleteTargetIso(null);
  }, [deleteTargetIso, handleDeleteSavedChecklist]);

  const handleOpenDeleteCategoryModal = useCallback((categoryId) => {
    setDeleteCategoryId(categoryId);
    setShowDeleteCategoryModal(true);
  }, []);

  const handleCloseDeleteCategoryModal = useCallback(() => {
    setShowDeleteCategoryModal(false);
    setDeleteCategoryId(null);
  }, []);

  const handleConfirmDeleteCategory = useCallback(() => {
    if (!deleteCategoryId) return;
    const targetCategory = allCategories.find(
      (category) => category.id === deleteCategoryId,
    );
    if (!targetCategory) return;
    const presetIds = targetCategory.items.map((item) => item.id);
    const customIds = customItems
      .filter((item) => item.category === deleteCategoryId)
      .map((item) => item.id);
    const categoryItemIds = new Set([...presetIds, ...customIds]);

    setHiddenCategoryIds((prev) =>
      prev.includes(deleteCategoryId) ? prev : [...prev, deleteCategoryId],
    );
    setCustomItems((prev) =>
      prev.filter((item) => item.category !== deleteCategoryId),
    );
    setHistory((prev) => {
      const nextHistory = {};
      Object.entries(prev).forEach(([iso, completedIds]) => {
        nextHistory[iso] = Array.isArray(completedIds)
          ? completedIds.filter((id) => !categoryItemIds.has(id))
          : [];
      });
      return nextHistory;
    });
    setLabelOverrides((prev) => {
      const nextLabelOverrides = { ...prev };
      presetIds.forEach((id) => {
        delete nextLabelOverrides[id];
      });
      return nextLabelOverrides;
    });
    setCategoryLabelOverrides((prev) => {
      const nextCategoryLabelOverrides = { ...prev };
      delete nextCategoryLabelOverrides[deleteCategoryId];
      return nextCategoryLabelOverrides;
    });
    setUserCategories((prev) =>
      prev.filter((category) => category.id !== deleteCategoryId),
    );
    setIsDirty(true);
    setShowDeleteCategoryModal(false);
    setDeleteCategoryId(null);
  }, [deleteCategoryId, allCategories, customItems]);

  const handleCreateNewChecklist = useCallback(() => {
    const raw = newChecklistTitle.trim();
    if (!raw) return;
    if (newChecklistItems.length === 0) return;
    const label = raw.slice(0, 100);
    const baseId = `user-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'checklist'}`;
    const existingCategoryIds = new Set(allCategories.map((category) => category.id));
    let candidateId = baseId;
    let suffix = 1;
    while (existingCategoryIds.has(candidateId)) {
      candidateId = `${baseId}-${suffix++}`;
    }
    const existingItemIds = new Set([
      ...ALL_PRESET_IDS,
      ...customItems.map((c) => c.id),
      ...userCategories.flatMap((cat) => cat.items.map((i) => i.id)),
    ]);
    const items = newChecklistItems.map((itemLabel) => {
      const itemBaseId = `${candidateId}-${itemLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}`.replace(/-+/g, '-');
      let itemId = itemBaseId || `${candidateId}-item`;
      let itemSuffix = 1;
      while (existingItemIds.has(itemId)) {
        itemId = `${itemBaseId}-${itemSuffix++}`;
      }
      existingItemIds.add(itemId);
      return { id: itemId, label: itemLabel };
    });
    const newCategory = {
      id: candidateId,
      label,
      items,
    };
    setUserCategories((prev) => [...prev, newCategory]);
    setHiddenCategoryIds((prev) => prev.filter((id) => id !== candidateId));
    setNewChecklistTitle('');
    setNewChecklistItems([]);
    setNewChecklistItemInput('');
    setIsDirty(true);
  }, [
    newChecklistTitle,
    newChecklistItems,
    allCategories,
    customItems,
    userCategories,
  ]);

  return {
    loading,
    error,
    selectedDate,
    setSelectedDate,
    history,
    historyMeta,
    customItems,
    labelOverrides,
    categoryLabelOverrides,
    visibleCategories,
    allCategories,
    allItemsForStats,
    selectedCompleted,
    checklistTitle,
    setChecklistTitle,
    checklistNotes,
    setChecklistNotes,
    todayPct,
    streak,
    totalDaysCompleted,
    historyDates,
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
    deleteTargetIso,
    showDeleteCategoryModal,
    deleteCategoryId,
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
  };
}
