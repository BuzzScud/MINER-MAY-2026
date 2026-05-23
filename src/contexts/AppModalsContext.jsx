import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import SettingsModal from '../components/modals/SettingsModal';
import AdminModal from '../components/modals/AdminModal';

const AppModalsContext = createContext(null);

export function AppModalsProvider({ children }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openAdmin = useCallback(() => setAdminOpen(true), []);
  const closeAdmin = useCallback(() => setAdminOpen(false), []);

  const value = useMemo(
    () => ({
      settingsOpen,
      adminOpen,
      openSettings,
      closeSettings,
      openAdmin,
      closeAdmin,
    }),
    [settingsOpen, adminOpen, openSettings, closeSettings, openAdmin, closeAdmin],
  );

  return (
    <AppModalsContext.Provider value={value}>
      {children}
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
      <AdminModal open={adminOpen} onClose={closeAdmin} />
    </AppModalsContext.Provider>
  );
}

export function useAppModals() {
  const ctx = useContext(AppModalsContext);
  if (!ctx) {
    throw new Error('useAppModals must be used within AppModalsProvider');
  }
  return ctx;
}
