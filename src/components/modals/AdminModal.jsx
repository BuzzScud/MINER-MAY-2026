import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminDashboard from '../../pages/admin/AdminDashboard';
import AdminUsersActivity from '../../pages/admin/AdminUsersActivity';
import AppModalShell from '../common/AppModalShell';

const ADMIN_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users & Activity' },
];

export default function AdminModal({ open, onClose }) {
  const { user } = useAuth();
  const [section, setSection] = useState('overview');

  useEffect(() => {
    if (!open) setSection('overview');
  }, [open]);

  if (!user?.is_admin) return null;

  return (
    <AppModalShell open={open} onClose={onClose} title="Admin" size="xl" dark>
      <div
        className="flex flex-wrap gap-1 mb-4 border-b border-white/10"
        role="tablist"
        aria-label="Admin sections"
      >
        {ADMIN_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            onClick={() => setSection(item.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              section === item.id
                ? 'border-sky-500 text-sky-400 bg-white/5'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {section === 'overview' && <AdminDashboard embedded />}
        {section === 'users' && <AdminUsersActivity embedded />}
      </div>
    </AppModalShell>
  );
}
