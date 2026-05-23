import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminUsers from './AdminUsers';
import AdminActivity from './AdminActivity';

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'activity', label: 'Activity' },
];

export default function AdminUsersActivity({ embedded = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [embeddedTab, setEmbeddedTab] = useState('users');
  const tabParam = embedded ? embeddedTab : searchParams.get('tab');
  const activeTab = TABS.some((t) => t.id === tabParam) ? tabParam : 'users';

  const setTab = (id) => {
    if (embedded) {
      setEmbeddedTab(id);
      return;
    }
    setSearchParams(id === 'users' ? {} : { tab: id });
  };

  return (
    <div className={`w-full mx-auto space-y-6 ${embedded ? '' : 'max-w-4xl'}`}>
      {!embedded && (
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">/admin</p>
        <h1 className="text-2xl font-bold text-gray-100">Users & Activity</h1>
      </div>
      )}

      <div className="flex gap-1 border-b border-white/10" role="tablist" aria-label="Users and Activity">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-sky-500 text-sky-400 bg-white/5'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
            aria-selected={activeTab === tab.id}
            role="tab"
            aria-controls={`panel-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="pt-4">
        {activeTab === 'users' && <AdminUsers embedded />}
        {activeTab === 'activity' && <AdminActivity embedded />}
      </div>
    </div>
  );
}
