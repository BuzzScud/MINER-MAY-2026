import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

const PanelCollapseContext = createContext(null);

function slugifyTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function PanelCollapseProvider({ children }) {
  const registryRef = useRef(new Set());
  const [panelCount, setPanelCount] = useState(0);

  const register = useCallback((controls) => {
    registryRef.current.add(controls);
    setPanelCount(registryRef.current.size);
    return () => {
      registryRef.current.delete(controls);
      setPanelCount(registryRef.current.size);
    };
  }, []);

  const collapseAll = useCallback(() => {
    registryRef.current.forEach((controls) => controls.collapse());
  }, []);

  const expandAll = useCallback(() => {
    registryRef.current.forEach((controls) => controls.expand());
  }, []);

  const value = useMemo(
    () => ({ register, collapseAll, expandAll, panelCount }),
    [register, collapseAll, expandAll, panelCount],
  );

  return (
    <PanelCollapseContext.Provider value={value}>
      {children}
    </PanelCollapseContext.Provider>
  );
}

export function PanelCollapseControls({ className = '' }) {
  const ctx = useContext(PanelCollapseContext);
  if (!ctx || ctx.panelCount === 0) return null;

  const { collapseAll, expandAll } = ctx;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={expandAll}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        title="Expand all cards"
        aria-label="Expand all cards"
      >
        <ChevronsDownUp className="h-3 w-3" aria-hidden />
        Expand all
      </button>
      <button
        type="button"
        onClick={collapseAll}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        title="Collapse all cards"
        aria-label="Collapse all cards"
      >
        <ChevronsUpDown className="h-3 w-3" aria-hidden />
        Collapse all
      </button>
    </div>
  );
}

/**
 * Shared panel wrapper for consistent card layout across features (api-monitor, mempool, etc.).
 * When wrapped in PanelCollapseProvider, panels with a title get a collapse toggle in the header.
 */
export function Panel({ title, children, collapsible = true, panelId: panelIdProp, defaultCollapsed = false }) {
  const ctx = useContext(PanelCollapseContext);
  const panelId = panelIdProp ?? (title ? slugifyTitle(title) : undefined);
  const canCollapse = Boolean(collapsible && title && ctx);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const controlsRef = useRef({
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
  });

  useEffect(() => {
    controlsRef.current.collapse = () => setCollapsed(true);
    controlsRef.current.expand = () => setCollapsed(false);
  });

  useEffect(() => {
    if (!canCollapse) return undefined;
    return ctx.register(controlsRef.current);
  }, [canCollapse, ctx?.register]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5" data-panel-id={panelId}>
      {title && (
        <div className={`flex items-center justify-between gap-2 ${collapsed && canCollapse ? 'mb-0' : 'mb-2'}`}>
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {title}
          </h2>
          {canCollapse && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-controls={panelId ? `${panelId}-body` : undefined}
              aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden />}
            </button>
          )}
        </div>
      )}
      {(!canCollapse || !collapsed) && (
        <div id={panelId ? `${panelId}-body` : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
