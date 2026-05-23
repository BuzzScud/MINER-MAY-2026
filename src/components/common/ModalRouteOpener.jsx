import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAppModals } from '../../contexts/AppModalsContext';

export function SettingsModalOpener() {
  const navigate = useNavigate();
  const { openSettings } = useAppModals();

  useEffect(() => {
    openSettings();
    navigate('/', { replace: true });
  }, [navigate, openSettings]);

  return null;
}

export function AdminModalOpener() {
  const navigate = useNavigate();
  const { openAdmin } = useAppModals();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.is_admin) openAdmin();
    navigate('/', { replace: true });
  }, [navigate, openAdmin, user?.is_admin]);

  return null;
}
