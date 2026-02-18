import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { useStorage } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { loadAll, saveBatch } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'api-keys', label: 'API Keys' },
  { id: 'data', label: 'Data' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'privacy', label: 'Privacy & Data' },
];

/* ── Tiny reusable pieces (match api-monitor/Panel design) ──────────── */

function Panel({ title, children, actions }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4 mb-3">
          {title && (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400">
              {title}
            </h2>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function Toggle({ enabled, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-10 items-center rounded-full shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
        enabled ? 'bg-sky-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function Select({ value, onChange, options, ariaLabel }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent min-w-[140px]"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function SettingRow({ label, description, tag, children }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
          {tag && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded">
              {tag}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function ApiKeyField({ label, value, onChange, visible, onToggleVisibility, hint, linkHref, linkText }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3 space-y-2">
      <label className="block text-sm font-medium text-gray-900 dark:text-white">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all font-mono"
          placeholder={`Enter ${label.toLowerCase()}`}
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label={visible ? 'Hide key' : 'Show key'}
        >
          {visible ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>
      {(linkHref || hint) && (
        <div className="flex items-center gap-2 flex-wrap">
          {linkHref && (
            <a href={linkHref} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-500 hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              {linkText || 'Get key'}
            </a>
          )}
          {hint && <span className="text-[11px] text-gray-500 dark:text-gray-400">{hint}</span>}
        </div>
      )}
    </div>
  );
}

/* ── Tab content components ────────────────────────────────────────── */

function GeneralTab({ showSaveStatus }) {
  const { generalSettings, updateGeneralSetting } = useSettings();
  const GENERAL_ITEMS = [
    { key: 'autoRefresh', label: 'Auto Refresh', desc: 'Refresh data at configured intervals when enabled' },
    { key: 'showTooltips', label: 'Show Tooltips', desc: 'Contextual help throughout the app' },
    { key: 'compactMode', label: 'Compact Mode', desc: 'Denser layout with smaller spacing' },
    { key: 'confirmBeforeLeave', label: 'Confirm Before Leave', desc: 'Warn when leaving a page with unsaved changes' },
    { key: 'sidebarCollapsed', label: 'Sidebar Collapsed', desc: 'Start with sidebar collapsed on desktop' },
  ];

  const handleChange = useCallback((key, value) => {
    updateGeneralSetting(key, value);
    showSaveStatus('Setting updated', 'success');
  }, [updateGeneralSetting, showSaveStatus]);

  return (
    <Panel title="General">
      <div className="space-y-2">
        {GENERAL_ITEMS.map(({ key, label, desc }) => (
          <SettingRow key={key} label={label} description={desc}>
            <Toggle
              enabled={generalSettings[key] ?? true}
              onChange={(v) => handleChange(key, v)}
              label={label}
            />
          </SettingRow>
        ))}
      </div>
    </Panel>
  );
}

function AppearanceTab({ showSaveStatus }) {
  const { getItem, setItem } = useStorage();
  const [darkMode, setDarkMode] = useState(false);
  const [appearance, setAppearance] = useState({ animations: true, fontSize: 'medium' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [dark, app] = await Promise.all([
        getItem(STORAGE_KEYS.DARK_MODE),
        getItem(STORAGE_KEYS.APPEARANCE_SETTINGS),
      ]);
      if (cancelled) return;
      setDarkMode(dark != null ? !!dark : false);
      setAppearance({ animations: true, fontSize: 'medium', ...(typeof app === 'object' && app ? app : {}) });
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [getItem]);

  useEffect(() => {
    if (!loaded) return;
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setItem(STORAGE_KEYS.DARK_MODE, darkMode).catch(() => {});
  }, [darkMode, loaded, setItem]);

  useEffect(() => {
    if (!loaded) return;
    document.documentElement.dataset.fontSize = appearance.fontSize;
    document.documentElement.dataset.animations = appearance.animations ? 'on' : 'off';
    setItem(STORAGE_KEYS.APPEARANCE_SETTINGS, appearance).catch(() => {});
  }, [appearance, loaded, setItem]);

  const handleToggle = useCallback(() => {
    setDarkMode((prev) => !prev);
    showSaveStatus('Theme updated', 'success');
  }, [showSaveStatus]);

  const handleAppearanceChange = useCallback((key, value) => {
    setAppearance((prev) => {
      const next = { ...prev, [key]: value };
      setItem(STORAGE_KEYS.APPEARANCE_SETTINGS, next).catch(() => {});
      return next;
    });
    showSaveStatus('Appearance updated', 'success');
  }, [showSaveStatus, setItem]);

  return (
    <div className="space-y-4">
      <Panel title="Appearance">
        <div className="space-y-2">
          <SettingRow
            label="Dark Mode"
            description="Use dark theme across the entire application"
            tag="Recommended"
          >
            <Toggle enabled={darkMode} onChange={handleToggle} label="Dark mode" />
          </SettingRow>
          <SettingRow
            label="Animations"
            description="Enable transitions and micro-animations"
          >
            <Toggle
              enabled={appearance.animations}
              onChange={(v) => handleAppearanceChange('animations', v)}
              label="Animations"
            />
          </SettingRow>
          <SettingRow label="Font Size" description="Base text size for the app">
            <Select
              value={appearance.fontSize}
              onChange={(v) => handleAppearanceChange('fontSize', v)}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
                { value: 'large', label: 'Large' },
              ]}
              ariaLabel="Font size"
            />
          </SettingRow>
        </div>
      </Panel>
    </div>
  );
}

function ApiKeysTab({ showSaveStatus }) {
  const { getItem, setItem } = useStorage();
  const [apiKeys, setApiKeys] = useState({
    finnhub: 'demo',
    massive: 'qeBvdtjWjffA90rzgWB_HeHtmdpyuGQG',
    fibhub: '',
  });
  const [showApiKeys, setShowApiKeys] = useState({ finnhub: false, massive: false, fibhub: false });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getItem(STORAGE_KEYS.API_KEYS).then((saved) => {
      if (cancelled) return;
      if (saved && typeof saved === 'object') {
        setApiKeys((prev) => ({ ...prev, ...saved }));
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [getItem]);

  const handleApiKeyChange = (key, value) => {
    setApiKeys((prev) => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  };

  const handleSave = useCallback(async () => {
    try {
      await setItem(STORAGE_KEYS.API_KEYS, apiKeys);
      setHasUnsavedChanges(false);
      showSaveStatus('API keys saved', 'success');
    } catch (e) {
      showSaveStatus('Failed to save', 'error');
    }
  }, [apiKeys, showSaveStatus, setItem]);

  return (
    <Panel
      title="API Keys"
      actions={
        hasUnsavedChanges && (
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors"
          >
            Save Keys
          </button>
        )
      }
    >
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Keys are stored locally in your browser. They are never sent to any third-party server.
      </p>
      <div className="space-y-3">
        <ApiKeyField
          label="Finnhub"
          value={apiKeys.finnhub}
          onChange={(v) => handleApiKeyChange('finnhub', v)}
          visible={showApiKeys.finnhub}
          onToggleVisibility={() => setShowApiKeys((p) => ({ ...p, finnhub: !p.finnhub }))}
          linkHref="https://finnhub.io/register"
          linkText="Get free key"
          hint="Free tier: 60 calls/min"
        />
        <ApiKeyField
          label="Massive"
          value={apiKeys.massive}
          onChange={(v) => handleApiKeyChange('massive', v)}
          visible={showApiKeys.massive}
          onToggleVisibility={() => setShowApiKeys((p) => ({ ...p, massive: !p.massive }))}
          hint="Backup data source"
        />
        <ApiKeyField
          label="Fibhub"
          value={apiKeys.fibhub || ''}
          onChange={(v) => handleApiKeyChange('fibhub', v)}
          visible={showApiKeys.fibhub}
          onToggleVisibility={() => setShowApiKeys((p) => ({ ...p, fibhub: !p.fibhub }))}
          hint="Optional — news & additional data"
        />
      </div>
    </Panel>
  );
}

function DataTab({ showSaveStatus }) {
  const { refreshInterval, setRefreshInterval } = useSettings();
  const { getItem, setItem } = useStorage();
  const [defaultSymbols, setDefaultSymbols] = useState(['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN']);
  const [newSymbol, setNewSymbol] = useState('');
  const [dataSettings, setDataSettings] = useState({ preferredApi: 'auto', numberFormat: 'us' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [syms, ds, pref] = await Promise.all([
        getItem(STORAGE_KEYS.DEFAULT_SYMBOLS),
        getItem(STORAGE_KEYS.DATA_SETTINGS),
        getItem(STORAGE_KEYS.PREFERRED_API),
      ]);
      if (cancelled) return;
      if (Array.isArray(syms)) setDefaultSymbols(syms);
      const merged = { preferredApi: pref || 'auto', numberFormat: 'us', ...(typeof ds === 'object' && ds ? ds : {}) };
      setDataSettings(merged);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [getItem]);

  const handleDataSettingChange = useCallback((key, value) => {
    setDataSettings((prev) => {
      const next = { ...prev, [key]: value };
      setItem(STORAGE_KEYS.DATA_SETTINGS, next).catch(() => {});
      if (key === 'preferredApi') setItem(STORAGE_KEYS.PREFERRED_API, value).catch(() => {});
      return next;
    });
    showSaveStatus('Data setting updated', 'success');
  }, [showSaveStatus, setItem]);

  const handleRefreshChange = useCallback((value) => {
    const clamped = Math.max(5, Math.min(300, parseInt(value, 10) || 30));
    setRefreshInterval(clamped);
    showSaveStatus('Refresh interval updated', 'success');
  }, [setRefreshInterval, showSaveStatus]);

  const handleAddSymbol = useCallback(() => {
    const symbol = newSymbol.toUpperCase().trim();
    if (symbol && !defaultSymbols.includes(symbol) && symbol.length <= 10) {
      const updated = [...defaultSymbols, symbol];
      setDefaultSymbols(updated);
      setNewSymbol('');
      setItem(STORAGE_KEYS.DEFAULT_SYMBOLS, updated).catch(() => {});
      showSaveStatus('Symbol added', 'success');
    }
  }, [newSymbol, defaultSymbols, showSaveStatus, setItem]);

  const handleRemoveSymbol = useCallback((symbol) => {
    const updated = defaultSymbols.filter((s) => s !== symbol);
    setDefaultSymbols(updated);
    setItem(STORAGE_KEYS.DEFAULT_SYMBOLS, updated).catch(() => {});
    showSaveStatus('Symbol removed', 'success');
  }, [defaultSymbols, showSaveStatus, setItem]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Panel title="Refresh Interval">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-700 dark:text-gray-300">Poll every</span>
            <span className="text-lg font-bold text-sky-600 dark:text-sky-400 tabular-nums">{refreshInterval}s</span>
          </div>
          <input
            type="range"
            min="5"
            max="300"
            step="5"
            value={refreshInterval}
            onChange={(e) => handleRefreshChange(e.target.value)}
            className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer dark:bg-gray-700 accent-sky-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
            <span>5 s</span>
            <span>150 s</span>
            <span>300 s</span>
          </div>
        </div>
      </Panel>
      <Panel title="Default Symbols">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSymbol()}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="e.g. AAPL"
              maxLength="10"
            />
            <button
              type="button"
              onClick={handleAddSymbol}
              disabled={!newSymbol.trim() || defaultSymbols.includes(newSymbol.toUpperCase().trim())}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              Add
            </button>
          </div>
          {defaultSymbols.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {defaultSymbols.map((symbol) => (
                <span
                  key={symbol}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700/50 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600"
                >
                  {symbol}
                  <button
                    type="button"
                    onClick={() => handleRemoveSymbol(symbol)}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-red-500 transition-colors"
                    aria-label={`Remove ${symbol}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">No symbols yet</p>
          )}
        </div>
      </Panel>
      <Panel title="Data Source">
        <div className="space-y-2">
          <SettingRow
            label="Preferred API"
            description="Primary data source for market data"
          >
            <Select
              value={dataSettings.preferredApi}
              onChange={(v) => handleDataSettingChange('preferredApi', v)}
              options={[
                { value: 'auto', label: 'Auto (fallback)' },
                { value: 'yahoo', label: 'Yahoo Finance' },
                { value: 'finnhub', label: 'Finnhub' },
              ]}
              ariaLabel="Preferred API"
            />
          </SettingRow>
          <SettingRow
            label="Number Format"
            description="How numbers are displayed (1,234.56 vs 1.234,56)"
          >
            <Select
              value={dataSettings.numberFormat}
              onChange={(v) => handleDataSettingChange('numberFormat', v)}
              options={[
                { value: 'us', label: 'US (1,234.56)' },
                { value: 'eu', label: 'EU (1.234,56)' },
              ]}
              ariaLabel="Number format"
            />
          </SettingRow>
        </div>
      </Panel>
      </div>
    </div>
  );
}

function NotificationsTab({ showSaveStatus }) {
  const { notifications, updateNotification } = useSettings();
  const ITEMS = [
    { key: 'priceAlerts', label: 'Price Alerts', desc: 'Notify when prices hit target levels' },
    { key: 'apiStatusAlerts', label: 'API Status', desc: 'Notify when endpoints change status' },
    { key: 'errorAlerts', label: 'Error Alerts', desc: 'Notify on application errors' },
    { key: 'soundEnabled', label: 'Sound', desc: 'Play sound with notifications' },
    { key: 'desktopNotifications', label: 'Desktop Notifications', desc: 'Use browser notifications when app is in background' },
    { key: 'muteWhenInactive', label: 'Mute When Inactive', desc: 'Suppress notifications when tab is in background' },
  ];

  const handleChange = useCallback((key, value) => {
    updateNotification(key, value);
    showSaveStatus('Notification updated', 'success');
  }, [updateNotification, showSaveStatus]);

  return (
    <Panel title="Notifications">
      <div className="space-y-2">
        {ITEMS.map(({ key, label, desc }, idx) => (
          <SettingRow key={key} label={label} description={desc}>
            <Toggle
              enabled={notifications[key] ?? (idx < 4)}
              onChange={(v) => handleChange(key, v)}
              label={label}
            />
          </SettingRow>
        ))}
      </div>
    </Panel>
  );
}

function AccessibilityTab({ showSaveStatus }) {
  const { getItem, setItem } = useStorage();
  const [accessibility, setAccessibility] = useState({ reducedMotion: false, highContrast: false });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getItem(STORAGE_KEYS.ACCESSIBILITY_SETTINGS).then((saved) => {
      if (cancelled) return;
      const acc = { reducedMotion: false, highContrast: false, ...(typeof saved === 'object' && saved ? saved : {}) };
      if (acc.reducedMotion) document.documentElement.dataset.reducedMotion = 'on';
      if (acc.highContrast) document.documentElement.dataset.highContrast = 'on';
      setAccessibility(acc);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [getItem]);

  const handleChange = useCallback((key, value) => {
    setAccessibility((prev) => {
      const next = { ...prev, [key]: value };
      setItem(STORAGE_KEYS.ACCESSIBILITY_SETTINGS, next).catch(() => {});
      if (value) document.documentElement.dataset[key] = 'on';
      else delete document.documentElement.dataset[key];
      return next;
    });
    showSaveStatus('Accessibility setting updated', 'success');
  }, [showSaveStatus, setItem]);

  return (
    <Panel title="Accessibility">
      <div className="space-y-2">
        <SettingRow
          label="Reduced Motion"
          description="Minimize animations and transitions"
        >
          <Toggle
            enabled={accessibility.reducedMotion}
            onChange={(v) => handleChange('reducedMotion', v)}
            label="Reduced motion"
          />
        </SettingRow>
        <SettingRow
          label="High Contrast"
          description="Higher contrast UI elements"
        >
          <Toggle
            enabled={accessibility.highContrast}
            onChange={(v) => handleChange('highContrast', v)}
            label="High contrast"
          />
        </SettingRow>
      </div>
    </Panel>
  );
}

function PrivacyTab({ showSaveStatus }) {
  const { token } = useAuth();
  const { getItem } = useStorage();

  const handleClearCache = useCallback(() => {
    if (!window.confirm('Clear all cached data? This will not delete your settings.')) return;
    try {
      if (window.caches && window.caches.keys) {
        window.caches.keys().then((names) => {
          Promise.all(names.map((name) => window.caches.delete(name)));
        });
      }
      showSaveStatus('Cache cleared', 'success');
    } catch (_) {
      showSaveStatus('Cache cleared', 'success');
    }
  }, [showSaveStatus]);

  const handleExportSettings = useCallback(async () => {
    try {
      const keys = Object.values(STORAGE_KEYS);
      const exportData = {};
      for (let i = 0; i < keys.length; i++) {
        const val = await getItem(keys[i]);
        if (val != null) exportData[keys[i]] = val;
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `settings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showSaveStatus('Settings exported', 'success');
    } catch (e) {
      showSaveStatus('Export failed', 'error');
    }
  }, [showSaveStatus, getItem]);

  const handleImportSettings = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = JSON.parse(reader.result);
          const updates = {};
          Object.entries(STORAGE_KEYS).forEach(([constKey, storageKey]) => {
            const val = data[storageKey] ?? data[constKey];
            if (val != null) updates[storageKey] = val;
          });
          if (Object.keys(updates).length > 0) {
            await saveBatch(token, updates);
          }
          showSaveStatus('Settings imported. Reloading...', 'success');
          setTimeout(() => window.location.reload(), 1000);
        } catch (_) {
          showSaveStatus('Import failed', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [showSaveStatus, token]);

  return (
    <Panel title="Privacy & Data">
      <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-3 mb-4 text-xs text-sky-800 dark:text-sky-200">
        <p className="font-medium mb-1">Data Persistence</p>
        <p className="text-sky-700 dark:text-sky-300">
          Data is stored in your browser. Use the same URL each time (e.g. http://localhost:5173) so your data persists. Avoid incognito/private mode; localhost and 127.0.0.1 are different origins.
        </p>
      </div>
      <div className="space-y-2">
        <SettingRow
          label="Clear Cache"
          description="Remove cached API responses and temporary data"
        >
          <button
            type="button"
            onClick={handleClearCache}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Clear Cache
          </button>
        </SettingRow>
        <SettingRow
          label="Export Settings"
          description="Download all settings as JSON"
        >
          <button
            type="button"
            onClick={handleExportSettings}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Export
          </button>
        </SettingRow>
        <SettingRow
          label="Import Settings"
          description="Restore settings from a JSON file"
        >
          <button
            type="button"
            onClick={handleImportSettings}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Import
          </button>
        </SettingRow>
      </div>
    </Panel>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

function Settings() {
  const { token, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [saveStatus, setSaveStatus] = useState({ message: '', type: '' });

  const canAccessApiKeys = user?.is_admin === true;
  const visibleTabs = canAccessApiKeys ? TABS : TABS.filter((t) => t.id !== 'api-keys');
  const tabFromUrl = searchParams.get('tab') || 'general';
  const activeTab = (() => {
    if (!visibleTabs.some((t) => t.id === tabFromUrl)) return 'general';
    if (tabFromUrl === 'api-keys' && !canAccessApiKeys) return 'general';
    return tabFromUrl;
  })();

  useEffect(() => {
    if (tabFromUrl === 'api-keys' && !canAccessApiKeys && searchParams.get('tab')) {
      setSearchParams({}, { replace: true });
    }
  }, [tabFromUrl, canAccessApiKeys, searchParams, setSearchParams]);

  const setTab = useCallback((id) => {
    setSearchParams(id === 'general' ? {} : { tab: id }, { replace: true });
  }, [setSearchParams]);

  const showSaveStatus = useCallback((message, type) => {
    setSaveStatus({ message, type });
    setTimeout(() => setSaveStatus({ message: '', type: '' }), 2500);
  }, []);

  const handleResetDefaults = useCallback(async () => {
    if (!window.confirm('Reset all settings to defaults? This cannot be undone.')) return;
    const defaults = {
      [STORAGE_KEYS.DARK_MODE]: false,
      [STORAGE_KEYS.REFRESH_INTERVAL]: 30,
      [STORAGE_KEYS.DEFAULT_SYMBOLS]: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'],
      [STORAGE_KEYS.NOTIFICATION_SETTINGS]: {
        priceAlerts: true,
        apiStatusAlerts: true,
        errorAlerts: true,
        soundEnabled: false,
        desktopNotifications: false,
        muteWhenInactive: false,
      },
      [STORAGE_KEYS.GENERAL_SETTINGS]: {
        autoRefresh: true,
        showTooltips: true,
        compactMode: false,
        confirmBeforeLeave: true,
        sidebarCollapsed: false,
      },
      [STORAGE_KEYS.APPEARANCE_SETTINGS]: { animations: true, fontSize: 'medium' },
      [STORAGE_KEYS.DATA_SETTINGS]: { preferredApi: 'auto', numberFormat: 'us' },
      [STORAGE_KEYS.ACCESSIBILITY_SETTINGS]: { reducedMotion: false, highContrast: false },
      [STORAGE_KEYS.PREFERRED_API]: 'auto',
    };
    try {
      await saveBatch(token, defaults);
      document.documentElement.classList.remove('dark');
      showSaveStatus('All settings reset', 'success');
      setTab('general');
      window.location.reload();
    } catch (_) {
      showSaveStatus('Reset failed', 'error');
    }
  }, [setTab, showSaveStatus, token]);

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-hidden">
      <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2 flex-shrink-0">
        <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="font-medium text-gray-900 dark:text-white">Settings</span>
        {activeTab !== 'general' && (
          <>
            <span>/</span>
            <span className="font-medium text-gray-900 dark:text-white capitalize">{activeTab.replace('-', ' ')}</span>
          </>
        )}
      </nav>

      <header className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Preferences, API keys, and app configuration
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus.message && (
            <span className={`text-xs font-medium flex items-center gap-1.5 ${
              saveStatus.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
            }`}>
              {saveStatus.type === 'success' ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              )}
              {saveStatus.message}
            </span>
          )}
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Reset All
          </button>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Settings categories"
        className="flex flex-wrap gap-1 mb-4 flex-shrink-0 border-b border-gray-200 dark:border-gray-700"
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setTab(tab.id)}
            onKeyDown={(e) => {
              const idx = visibleTabs.findIndex((t) => t.id === tab.id);
              if (e.key === 'ArrowRight' && idx < visibleTabs.length - 1) setTab(visibleTabs[idx + 1].id);
              if (e.key === 'ArrowLeft' && idx > 0) setTab(visibleTabs[idx - 1].id);
            }}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-b-transparent dark:border-b-transparent -mb-px text-sky-600 dark:text-sky-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-6">
        {activeTab === 'general' && (
          <div role="tabpanel" id="panel-general" aria-labelledby="tab-general">
            <GeneralTab showSaveStatus={showSaveStatus} />
          </div>
        )}
        {activeTab === 'appearance' && (
          <div role="tabpanel" id="panel-appearance" aria-labelledby="tab-appearance">
            <AppearanceTab showSaveStatus={showSaveStatus} />
          </div>
        )}
        {activeTab === 'api-keys' && canAccessApiKeys && (
          <div role="tabpanel" id="panel-api-keys" aria-labelledby="tab-api-keys">
            <ApiKeysTab showSaveStatus={showSaveStatus} />
          </div>
        )}
        {activeTab === 'data' && (
          <div role="tabpanel" id="panel-data" aria-labelledby="tab-data">
            <DataTab showSaveStatus={showSaveStatus} />
          </div>
        )}
        {activeTab === 'notifications' && (
          <div role="tabpanel" id="panel-notifications" aria-labelledby="tab-notifications">
            <NotificationsTab showSaveStatus={showSaveStatus} />
          </div>
        )}
        {activeTab === 'accessibility' && (
          <div role="tabpanel" id="panel-accessibility" aria-labelledby="tab-accessibility">
            <AccessibilityTab showSaveStatus={showSaveStatus} />
          </div>
        )}
        {activeTab === 'privacy' && (
          <div role="tabpanel" id="panel-privacy" aria-labelledby="tab-privacy">
            <PrivacyTab showSaveStatus={showSaveStatus} />
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
