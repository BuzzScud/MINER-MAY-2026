import { Link, useSearchParams } from 'react-router-dom';
import { AccountsView } from '../features/accounts/AccountsView';
import { ChecklistTab } from '../features/accounts/components/ChecklistTab';

const TABS = [
  { id: 'performance', label: 'Performance' },
  { id: 'checklist', label: 'Checklist' },
];

export default function Accounts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.find((t) => t.id === searchParams.get('tab'))?.id || 'performance';

  const switchTab = (tabId) => {
    if (tabId === 'performance') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', tabId);
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="w-full flex flex-col h-full min-h-0 overflow-hidden">
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-4 flex-shrink-0">
        <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-900 dark:text-white">Accounts</span>
      </nav>
      <div className="flex-shrink-0 mb-3">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Account Management</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Track performance, import P/L data, and manage trading accounts</p>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 mb-3 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchTab(tab.id)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'performance' && <AccountsView />}
        {activeTab === 'checklist' && <ChecklistTab />}
      </div>
    </div>
  );
}
