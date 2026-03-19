import { Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from '../components/sidebar/Sidebar';
import { useSettings } from '../contexts/SettingsContext';
import { usePublicSettings } from '../contexts/PublicSettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useStorage } from '../utils/storage';
import { setMonitorStorageAdapter } from '../services/monitorService';
import { STORAGE_KEYS } from '../utils/storageKeys';

function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { generalSettings } = useSettings();
  const { maintenanceMode, announcement } = usePublicSettings();
  const { user } = useAuth();
  const { getItem, setItem } = useStorage();
  const [announcementDismissed, setAnnouncementDismissed] = useState(null);
  const isAdmin = user?.is_admin === true;
  const showMaintenance = maintenanceMode && !isAdmin;
  const showAnnouncement = announcement?.active && announcement?.text && announcementDismissed !== announcement.text;

  useEffect(() => {
    setMonitorStorageAdapter({ getItem, setItem });
    return () => setMonitorStorageAdapter(null);
  }, [getItem, setItem]);

  useEffect(() => {
    getItem(STORAGE_KEYS.ANNOUNCEMENT_DISMISSED).then((stored) => {
      setAnnouncementDismissed(stored ?? '');
    }).catch(() => setAnnouncementDismissed(''));
  }, [getItem, announcement?.text]);

  const dismissAnnouncement = () => {
    if (announcement?.text) {
      setItem(STORAGE_KEYS.ANNOUNCEMENT_DISMISSED, announcement.text).catch(() => {});
      setAnnouncementDismissed(announcement.text);
    }
  };

  const compactMode = generalSettings?.compactMode ?? false;

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  // Close sidebar when window is resized to desktop size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  if (showMaintenance) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">Under maintenance</h1>
          <p className="text-gray-600 dark:text-gray-400">We will be back shortly. Try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden"
      data-compact={compactMode ? '' : undefined}
    >
      {showAnnouncement && (
        <div className="sticky top-0 left-0 right-0 z-30 flex items-center justify-between gap-3 bg-amber-500/90 dark:bg-amber-600/90 text-gray-900 px-4 py-2 text-sm">
          <p className="flex-1 min-w-0">{announcement.text}</p>
          <button
            type="button"
            onClick={dismissAnnouncement}
            className="shrink-0 px-2 py-1 rounded hover:bg-black/10 font-medium"
            aria-label="Dismiss announcement"
          >
            Dismiss
          </button>
        </div>
      )}
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="sticky top-0 inset-x-0 z-20 bg-white dark:bg-gray-900 border-y border-gray-200 dark:border-gray-700 px-4 sm:px-6 md:px-8 lg:hidden flex-shrink-0">
          <div className="flex justify-between items-center gap-x-4">
            <div className="flex items-center gap-x-4">
              <button
                type="button"
                className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={toggleSidebar}
                aria-controls="application-sidebar"
                aria-label="Toggle navigation"
                aria-expanded={sidebarOpen}
              >
                <svg
                  className="flex-shrink-0 size-4"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" x2="21" y1="6" y2="6" />
                  <line x1="3" x2="21" y1="12" y2="12" />
                  <line x1="3" x2="21" y1="18" y2="18" />
                </svg>
              </button>
              <span className="text-xl font-semibold text-gray-800 dark:text-white">App</span>
            </div>
          </div>
        </div>
        <div
          className={`flex-1 overflow-y-auto min-h-0 flex flex-col scroll-touch pb-[env(safe-area-inset-bottom)] ${compactMode ? 'p-2 sm:p-3 lg:p-4' : 'p-3 sm:p-4 lg:p-6'}`}
        >
          <div className="w-full max-w-[1400px] mx-auto flex flex-col flex-1 min-h-0 min-w-0">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

export default MainLayout;

