import { NavLink, Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useStorage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../utils/storageKeys';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import UserProfile from './UserProfile';

const SIDEBAR_NAV_KEY = STORAGE_KEYS.SIDEBAR_NAV;

const ALL_PAGES = [
  { path: '/', label: 'Dashboard' },
  { path: '/accounts', label: 'Accounts' },
  { path: '/calendar', label: 'Economic Calendar' },
  { path: '/trading', label: 'Charts' },
  { path: '/projection', label: 'Projection' },

  { path: '/sentiment', label: 'Sentiment' },
  { path: '/budget-tracker', label: 'Budget Tracker' },
  { path: '/miner', label: 'Miner' },
  { path: '/api-monitor', label: 'API Monitor' },
  { path: '/settings', label: 'Settings' },
];

const ICON_CLASS = 'w-4 h-4 shrink-0';

const PAGE_ICONS = {
  '/': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  '/calendar': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  '/accounts': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a5 5 0 00-10 0v2M5 9h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2z" />
    </svg>
  ),
  '/trading': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  ),
  '/projection': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  '/sentiment': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm-3-7a3 3 0 01-3-3 3 3 0 013-3 3 3 0 013 3 3 3 0 01-3 3zm4-8a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  '/budget-tracker': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6a2 2 0 002 2zm-12-2a2 2 0 002-2V7a2 2 0 012-2h2a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2z" />
    </svg>
  ),
  '/miner': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  '/api-monitor': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  '/settings': (
    <svg className={ICON_CLASS} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 2.31 1.04 1.37 2.573a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-1.04 2.31-2.573 1.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-2.31-1.04-1.37-2.573a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543 1.04-2.31 2.573-1.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

function getDefaultSections() {
  return [
    { id: 'dashboard', label: 'Dashboard', pagePaths: ['/', '/accounts', '/calendar'] },
    { id: 'markets', label: 'Markets', pagePaths: ['/sentiment', '/trading', '/projection'] },
    { id: 'crypto', label: 'Crypto', pagePaths: ['/miner'] },
    { id: 'utilities', label: 'Utilities', pagePaths: ['/budget-tracker'] },
    { id: 'settings', label: 'Settings', pagePaths: ['/api-monitor', '/settings'] },
  ];
}

/** Old saves had only dashboard + uncategorized + settings; new default has markets, crypto, utilities. */
function isLegacySidebarLayout(sections) {
  const ids = new Set(sections.map((s) => s.id));
  return !ids.has('markets') || !ids.has('crypto') || !ids.has('utilities');
}

function parseSections(saved) {
  try {
    if (saved != null) {
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      if (parsed?.sections && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
        const allPaths = new Set(ALL_PAGES.map((p) => p.path));
        const seen = new Set();
        const sections = parsed.sections.map((sec) => ({
          id: sec.id,
          label: sec.label ?? null,
          pagePaths: (sec.pagePaths || [])
            .filter((path) => allPaths.has(path) && !seen.has(path) && (seen.add(path), true)),
        }));
        const uncategorized = sections.find((s) => s.id === 'uncategorized');
        const missing = [...allPaths].filter((p) => !seen.has(p));
        if (missing.length > 0 && uncategorized) {
          uncategorized.pagePaths = [...uncategorized.pagePaths, ...missing];
        }
        const hasUncategorized = sections.some((s) => s.id === 'uncategorized');
        if (!hasUncategorized) {
          const uncatPaths = [...allPaths].filter((p) => !seen.has(p));
          sections.push({ id: 'uncategorized', label: null, pagePaths: uncatPaths });
        }
        if (isLegacySidebarLayout(sections)) {
          return { sections: getDefaultSections(), collapsedSectionIds: [] };
        }
        return { sections, collapsedSectionIds: Array.isArray(parsed.collapsedSectionIds) ? parsed.collapsedSectionIds : [] };
      }
    }
  } catch (error) {
    console.error('Error loading sidebar nav:', error);
  }
  return { sections: getDefaultSections(), collapsedSectionIds: [] };
}

function ensureSettingsLast(sections) {
  const settings = sections.find((s) => s.id === 'settings');
  if (!settings) return sections;
  const rest = sections.filter((s) => s.id !== 'settings');
  return [...rest, settings];
}

function NavItem({ path, label, location, onClose, icon }) {
  const isActive =
    path === '/'
      ? location.pathname === '/' || location.pathname === '/dashboard'
      : location.pathname === path || location.pathname.startsWith(path + '/');
  return (
    <li>
      <NavLink
        to={path}
        onClick={() => {
          if (window.innerWidth < 1024 && onClose) onClose();
        }}
        className={`flex items-center gap-x-2.5 py-2.5 px-3 text-sm rounded-r-md border-l-2 transition-colors ${
          isActive
            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
            : 'border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
      >
        {icon && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
        <span className="truncate">{label}</span>
      </NavLink>
    </li>
  );
}

function SortableNavItem({ path, label, location, onClose, icon }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: path,
  });
  const isActive =
    path === '/'
      ? location.pathname === '/' || location.pathname === '/dashboard'
      : location.pathname === path || location.pathname.startsWith(path + '/');
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li ref={setNodeRef} style={style} className={isDragging ? 'opacity-60' : ''}>
      <div className="flex items-center gap-x-2 rounded-r-md border-l-2 group">
        <span
          className="shrink-0 cursor-grab active:cursor-grabbing touch-none p-1.5 rounded text-gray-400 dark:text-gray-500 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 hover:text-gray-600 dark:hover:text-gray-300 opacity-70 hover:opacity-100 transition-opacity"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zm-6 6h2v2H8v-2zm6 0h2v2h-2v-2zm-6 6h2v2H8v-2zm6 0h2v2h-2v-2z" />
          </svg>
        </span>
        <NavLink
          to={path}
          onClick={() => {
            if (window.innerWidth < 1024 && onClose) onClose();
          }}
          className={`flex-1 min-w-0 flex items-center gap-x-2.5 py-2.5 px-3 text-sm rounded-r-md border-l-2 transition-colors ${
            isActive
              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
              : 'border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          {icon && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
          <span className="truncate">{label}</span>
        </NavLink>
      </div>
    </li>
  );
}

function SectionDroppable({ id, children, className }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'section-' + id });
  return (
    <ul
      ref={setNodeRef}
      className={`${className ?? ''} ${isOver ? 'ring-1 ring-blue-400/80 dark:ring-blue-500/80 rounded-lg bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
    >
      {children}
    </ul>
  );
}

function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { getItem, setItem } = useStorage();

  const [darkMode, setDarkMode] = useState(false);
  const [sections, setSections] = useState(getDefaultSections);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState(() => new Set());
  const [navLoaded, setNavLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryLabel, setEditingCategoryLabel] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    Promise.all([
      getItem(SIDEBAR_NAV_KEY),
      getItem(STORAGE_KEYS.DARK_MODE),
    ])
      .then(([nav, dm]) => {
        if (cancelled) return;
        const parsed = parseSections(nav);
        setSections(ensureSettingsLast(parsed.sections));
        setCollapsedSectionIds(new Set(parsed.collapsedSectionIds || []));
        setDarkMode(dm === true || dm === 'true');
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setNavLoaded(true);
      });
    return () => { cancelled = true; };
  }, [getItem]);

  const saveTimeoutRef = useRef(null);
  useEffect(() => {
    if (!navLoaded) return;
    const SIDEBAR_SAVE_DEBOUNCE_MS = 400;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      setItem(SIDEBAR_NAV_KEY, {
        sections,
        collapsedSectionIds: Array.from(collapsedSectionIds),
      }).catch(() => {});
    }, SIDEBAR_SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [sections, collapsedSectionIds, setItem, navLoaded]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setItem(STORAGE_KEYS.DARK_MODE, darkMode).catch(() => {});
  }, [darkMode, setItem]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const toggleSectionCollapsed = (sectionId) => {
    setHasUserEdited(true);
    setCollapsedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const addCategory = () => {
    const label = (newCategoryName || 'New category').trim();
    if (!label) return;
    setHasUserEdited(true);
    const uncategorizedIndex = sections.findIndex((s) => s.id === 'uncategorized');
    const insertIndex = uncategorizedIndex >= 0 ? uncategorizedIndex : sections.length;
    const newSection = { id: 'cat_' + Date.now(), label, pagePaths: [] };
    setSections((prev) => [
      ...prev.slice(0, insertIndex),
      newSection,
      ...prev.slice(insertIndex),
    ]);
    setNewCategoryName('');
    setShowAddCategory(false);
  };

  const removeCategory = (sectionId) => {
    if (!sectionId.startsWith('cat_')) return;
    setHasUserEdited(true);
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const uncategorized = sections.find((s) => s.id === 'uncategorized');
    if (uncategorized) {
      setSections((prev) =>
        prev
          .filter((s) => s.id !== sectionId)
          .map((s) =>
            s.id === 'uncategorized'
              ? { ...s, pagePaths: [...s.pagePaths, ...section.pagePaths] }
              : s
          )
      );
    } else {
      setSections((prev) => prev.filter((s) => s.id !== sectionId));
    }
  };

  const renameCategory = (sectionId, newLabel) => {
    setHasUserEdited(true);
    const trimmed = (newLabel ?? '').trim() || 'New category';
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, label: trimmed } : s))
    );
    setEditingCategoryId(null);
    setEditingCategoryLabel('');
  };

  const getPageLabel = useCallback((path) => {
    const page = ALL_PAGES.find((p) => p.path === path);
    return page ? page.label : path;
  }, []);

  const handleDoneEditing = () => {
    setIsEditMode(false);
    setShowAddCategory(false);
    setEditingCategoryId(null);
    setShowSavedFeedback(true);
    setTimeout(() => setShowSavedFeedback(false), 2000);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleNavDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    setHasUserEdited(true);
    const path = active.id;
    const overId = String(over.id);
    const sourceSectionIndex = sections.findIndex((s) => s.pagePaths.includes(path));
    if (sourceSectionIndex < 0) return;

    const isSectionDrop = overId.startsWith('section-');
    let targetSectionId;
    let targetIndex;

    if (isSectionDrop) {
      targetSectionId = overId.replace(/^section-/, '');
      targetIndex = undefined;
    } else {
      const targetSection = sections.find((s) => s.pagePaths.includes(overId));
      if (!targetSection) return;
      targetSectionId = targetSection.id;
      targetIndex = targetSection.pagePaths.indexOf(overId);
      if (targetIndex < 0) targetIndex = undefined;
    }

    const targetSectionIndex = sections.findIndex((s) => s.id === targetSectionId);
    if (targetSectionIndex < 0) return;

    setSections((prev) => {
      const sameSection = sourceSectionIndex === targetSectionIndex;
      if (sameSection) {
        const section = prev[sourceSectionIndex];
        const oldIndex = section.pagePaths.indexOf(path);
        if (oldIndex < 0) return prev;
        const newPaths = arrayMove(section.pagePaths, oldIndex, targetIndex ?? oldIndex);
        return prev.map((s, i) =>
          i === sourceSectionIndex ? { ...s, pagePaths: newPaths } : s
        );
      }
      const next = prev.map((s) => ({
        ...s,
        pagePaths: s.pagePaths.filter((p) => p !== path),
      }));
      const target = next[targetSectionIndex];
      const newPaths = [...target.pagePaths];
      if (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= newPaths.length) {
        newPaths.splice(targetIndex, 0, path);
      } else {
        newPaths.push(path);
      }
      next[targetSectionIndex] = { ...target, pagePaths: newPaths };
      return next;
    });
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[59] bg-gray-900 bg-opacity-50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        id="application-sidebar"
        className={`fixed top-0 start-0 bottom-0 z-[60] w-64 bg-white dark:bg-gray-900 border-e border-gray-200 dark:border-gray-700 transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:end-auto lg:bottom-0 lg:z-[60] lg:block lg:border-e-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden pb-[env(safe-area-inset-bottom)]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between gap-2">
              <Link
                className="flex-none text-lg font-semibold text-gray-800 dark:text-white hover:text-gray-600 dark:hover:text-gray-300 transition-colors tracking-tight truncate"
                to="/"
                aria-label="Brand"
              >
                App
              </Link>
              <div className="flex items-center gap-1">
                {showSavedFeedback && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400" role="status">Saved</span>
                )}
                {isEditMode ? (
                  <button
                    type="button"
                    onClick={handleDoneEditing}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                    aria-label="Done editing menu"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditMode(true)}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                    aria-label="Customize menu"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-2a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                  role="switch"
                  aria-checked={darkMode}
                  aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {darkMode ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </button>
              <button
                type="button"
                className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-md"
                onClick={onClose}
                aria-label="Close sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              </div>
            </div>
          </div>

          {/* Scrollable Navigation */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <nav className="flex-1 flex flex-col min-h-0 px-4 w-full" data-hs-accordion-always-open aria-label="Main navigation">
              {(() => {
                const mainSections = sections.filter((s) => s.id !== 'settings');
                const settingsSection = sections.find((s) => s.id === 'settings');

                const renderSection = (section, isEdit) => {
                  const isCollapsed = collapsedSectionIds.has(section.id);
                  const hasLabel = section.label != null;
                  return (
                    <li key={section.id}>
                      {hasLabel && (
                        <button
                          type="button"
                          onClick={() => toggleSectionCollapsed(section.id)}
                          className="flex items-center gap-2 mb-1.5 mt-1 w-full text-left group"
                          aria-expanded={!isCollapsed}
                          aria-label={isCollapsed ? `Expand ${section.label}` : `Collapse ${section.label}`}
                        >
                          <svg
                            className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                            fill="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                          </svg>
                          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider shrink-0">
                            {section.label}
                          </span>
                        </button>
                      )}
                      {!hasLabel && <div className="mb-1.5 mt-1" />}
                      {!isCollapsed && (
                        <ul className="space-y-0.5">
                          {section.pagePaths.map((path) => (
                            isEdit ? (
                              <SortableNavItem
                                key={path}
                                path={path}
                                label={getPageLabel(path)}
                                location={location}
                                onClose={onClose}
                                icon={PAGE_ICONS[path]}
                              />
                            ) : (
                              <NavItem
                                key={path}
                                path={path}
                                label={getPageLabel(path)}
                                location={location}
                                onClose={onClose}
                                icon={PAGE_ICONS[path]}
                              />
                            )
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                };

                const renderEditSectionHeader = (section) => {
                  const isCollapsed = collapsedSectionIds.has(section.id);
                  const isUserCategory = section.id.startsWith('cat_');
                  const hasLabel = section.label != null;
                  return (
                    <div className="flex items-center justify-between gap-2 mb-1.5 mt-1 rounded-md bg-gray-100/80 dark:bg-gray-800/80 px-2 py-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleSectionCollapsed(section.id)}
                          className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          aria-expanded={!isCollapsed}
                          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          <svg
                            className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                          </svg>
                        </button>
                        {editingCategoryId === section.id ? (
                          <input
                            type="text"
                            value={editingCategoryLabel}
                            onChange={(e) => setEditingCategoryLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameCategory(section.id, editingCategoryLabel);
                              if (e.key === 'Escape') {
                                setEditingCategoryId(null);
                                setEditingCategoryLabel('');
                              }
                            }}
                            onBlur={() => renameCategory(section.id, editingCategoryLabel)}
                            className="flex-1 min-w-0 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
                            autoFocus
                            aria-label="Category name"
                          />
                        ) : (
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
                            {section.label ?? 'Uncategorized'}
                          </span>
                        )}
                      </div>
                      {hasLabel && editingCategoryId !== section.id && (
                        <span className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(section.id);
                              setEditingCategoryLabel(section.label || '');
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            aria-label="Rename category"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          {isUserCategory && (
                            <button
                              type="button"
                              onClick={() => removeCategory(section.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                              aria-label="Remove category"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  );
                };

                return !isEditMode ? (
                  <>
                    <div className="flex-1 overflow-y-auto overscroll-contain py-5">
                      <ul className="space-y-4">
                        {mainSections.map((s) => renderSection(s, false))}
                      </ul>
                    </div>
                    {settingsSection && (
                      <div className="flex-shrink-0 pt-4 mt-auto border-t border-gray-200 dark:border-gray-700">
                        <ul className="space-y-0.5 pb-2">
                          {renderSection(settingsSection, false)}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleNavDragEnd}
                >
                  <div className="mb-3 space-y-3 py-4">
                    <div>
                      {showAddCategory ? (
                        <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 space-y-1.5">
                          <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addCategory();
                              if (e.key === 'Escape') {
                                setShowAddCategory(false);
                                setNewCategoryName('');
                              }
                            }}
                            placeholder="Category name"
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                            autoFocus
                            aria-label="New category name"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={addCategory}
                              className="flex-1 px-2 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddCategory(false);
                                setNewCategoryName('');
                              }}
                              className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAddCategory(true)}
                          className="w-full px-2 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded flex items-center justify-center gap-1.5 border border-blue-200 dark:border-blue-800"
                          aria-label="Add category"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add category
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto overscroll-contain">
                      <ul className="space-y-4 pb-4">
                        {mainSections.map((section) => {
                          const isCollapsed = collapsedSectionIds.has(section.id);
                          return (
                            <li key={section.id}>
                              {(section.label != null || section.id === 'uncategorized') && renderEditSectionHeader(section)}
                              {section.label == null && section.id !== 'uncategorized' && <div className="mb-1.5 mt-1" />}
                              {!isCollapsed && (
                                <SectionDroppable id={section.id} className="space-y-0.5">
                                  <SortableContext items={section.pagePaths} strategy={verticalListSortingStrategy}>
                                    {section.pagePaths.length === 0 ? (
                                      <li className="py-4 px-3 text-xs text-gray-400 dark:text-gray-500 italic rounded-md border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30">
                                        Drop pages here
                                      </li>
                                    ) : (
                                      section.pagePaths.map((path) => (
                                        <SortableNavItem
                                          key={path}
                                          path={path}
                                          label={getPageLabel(path)}
                                          location={location}
                                          onClose={onClose}
                                          icon={PAGE_ICONS[path]}
                                        />
                                      ))
                                    )}
                                  </SortableContext>
                                </SectionDroppable>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    {settingsSection && (
                      <div className="flex-shrink-0 pt-4 mt-auto border-t border-gray-200 dark:border-gray-700">
                        <ul className="space-y-0.5 pb-2">
                          <li>
                            {renderEditSectionHeader(settingsSection)}
                            {!collapsedSectionIds.has(settingsSection.id) && (
                              <SectionDroppable id={settingsSection.id} className="space-y-0.5">
                                <SortableContext items={settingsSection.pagePaths} strategy={verticalListSortingStrategy}>
                                  {settingsSection.pagePaths.length === 0 ? (
                                    <li className="py-4 px-3 text-xs text-gray-400 dark:text-gray-500 italic rounded-md border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30">
                                      Drop pages here
                                    </li>
                                  ) : (
                                    settingsSection.pagePaths.map((path) => (
                                      <SortableNavItem
                                        key={path}
                                        path={path}
                                        label={getPageLabel(path)}
                                        location={location}
                                        onClose={onClose}
                                        icon={PAGE_ICONS[path]}
                                      />
                                    ))
                                  )}
                                </SortableContext>
                              </SectionDroppable>
                            )}
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>
                </DndContext>
              )}
            )()}
            </nav>
          </div>

          {/* Fixed Bottom - Profile widget (includes admin, profile, logout, theme) */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
            <UserProfile user={user} onLogout={logout} />
          </div>
        </div>
      </div>
    </>
  );
}

export default Sidebar;
