import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getItem, setItem } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';

const DEFAULT_GENERAL = {
  autoRefresh: true,
  showTooltips: true,
  compactMode: false,
  confirmBeforeLeave: true,
  sidebarCollapsed: false,
};

const DEFAULT_NOTIFICATIONS = {
  priceAlerts: true,
  apiStatusAlerts: true,
  errorAlerts: true,
  soundEnabled: false,
  desktopNotifications: false,
  muteWhenInactive: false,
};

function parseGeneral(val) {
  if (!val || typeof val !== 'object') return DEFAULT_GENERAL;
  return { ...DEFAULT_GENERAL, ...val };
}

function parseRefreshInterval(val) {
  const n = typeof val === 'number' ? val : parseInt(val, 10);
  if (Number.isFinite(n) && n >= 5 && n <= 300) return n;
  return 30;
}

function parseNotifications(val) {
  if (!val || typeof val !== 'object') return DEFAULT_NOTIFICATIONS;
  return { ...DEFAULT_NOTIFICATIONS, ...val };
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { token } = useAuth();
  const [generalSettings, setGeneralSettingsState] = useState(DEFAULT_GENERAL);
  const [refreshInterval, setRefreshIntervalState] = useState(30);
  const [notifications, setNotificationsState] = useState(DEFAULT_NOTIFICATIONS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [gen, ref, notif] = await Promise.all([
        getItem(token, STORAGE_KEYS.GENERAL_SETTINGS),
        getItem(token, STORAGE_KEYS.REFRESH_INTERVAL),
        getItem(token, STORAGE_KEYS.NOTIFICATION_SETTINGS),
      ]);
      if (cancelled) return;
      setGeneralSettingsState(parseGeneral(gen));
      setRefreshIntervalState(parseRefreshInterval(ref));
      setNotificationsState(parseNotifications(notif));
      setLoaded(true);
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  const setGeneralSettings = useCallback((next) => {
    setGeneralSettingsState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      const merged = { ...DEFAULT_GENERAL, ...value };
      setItem(token, STORAGE_KEYS.GENERAL_SETTINGS, merged).catch(() => {});
      return merged;
    });
  }, [token]);

  const setRefreshInterval = useCallback((next) => {
    setRefreshIntervalState((prev) => {
      const value = typeof next === 'function' ? next(prev) : prev;
      const clamped = Math.max(5, Math.min(300, Number(value) || 30));
      setItem(token, STORAGE_KEYS.REFRESH_INTERVAL, clamped).catch(() => {});
      return clamped;
    });
  }, [token]);

  const setNotifications = useCallback((next) => {
    setNotificationsState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      const merged = { ...DEFAULT_NOTIFICATIONS, ...value };
      setItem(token, STORAGE_KEYS.NOTIFICATION_SETTINGS, merged).catch(() => {});
      return merged;
    });
  }, [token]);

  const updateGeneralSetting = useCallback((key, value) => {
    setGeneralSettings((prev) => ({ ...prev, [key]: value }));
  }, [setGeneralSettings]);

  const updateNotification = useCallback((key, value) => {
    setNotifications((prev) => ({ ...prev, [key]: value }));
  }, [setNotifications]);

  useEffect(() => {
    if (!loaded) return;
    const handleStorage = (e) => {
      if (e.key === STORAGE_KEYS.GENERAL_SETTINGS && e.newValue) {
        try {
          setGeneralSettingsState(parseGeneral(JSON.parse(e.newValue)));
        } catch (_) {}
      }
      if (e.key === STORAGE_KEYS.REFRESH_INTERVAL && e.newValue != null) {
        const n = parseInt(e.newValue, 10);
        if (Number.isFinite(n)) setRefreshIntervalState(n);
      }
      if (e.key === STORAGE_KEYS.NOTIFICATION_SETTINGS && e.newValue) {
        try {
          setNotificationsState(parseNotifications(JSON.parse(e.newValue)));
        } catch (_) {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [loaded]);

  const value = {
    generalSettings,
    setGeneralSettings,
    updateGeneralSetting,
    refreshInterval,
    setRefreshInterval,
    notifications,
    setNotifications,
    updateNotification,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    return {
      generalSettings: DEFAULT_GENERAL,
      setGeneralSettings: () => {},
      updateGeneralSetting: () => {},
      refreshInterval: 30,
      setRefreshInterval: () => {},
      notifications: DEFAULT_NOTIFICATIONS,
      setNotifications: () => {},
      updateNotification: () => {},
    };
  }
  return ctx;
}
