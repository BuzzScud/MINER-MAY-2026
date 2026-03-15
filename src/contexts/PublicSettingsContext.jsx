import { createContext, useContext, useState, useEffect } from 'react';

const defaultSettings = {
  maintenanceMode: false,
  announcement: { text: '', active: false },
};

const PublicSettingsContext = createContext(defaultSettings);

export function PublicSettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/public')
      .then((r) => {
        if (r.status === 404 || !r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setSettings({
            maintenanceMode: !!data.maintenanceMode,
            announcement: data.announcement && typeof data.announcement === 'object'
              ? { text: data.announcement.text ?? '', active: !!data.announcement.active }
              : { text: '', active: false },
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <PublicSettingsContext.Provider value={settings}>
      {children}
    </PublicSettingsContext.Provider>
  );
}

export function usePublicSettings() {
  const ctx = useContext(PublicSettingsContext);
  return ctx ?? defaultSettings;
}
