import { useEffect, useMemo, useState } from 'react';
import { useStorage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../utils/storageKeys';
import { AccountCard } from './components/AccountCard';
import { AccountFormModal } from './components/AccountFormModal';
import { ImageDropZone } from './components/ImageDropZone';
import { PerformanceCalendar } from './components/PerformanceCalendar';

const DEFAULT_ACCOUNTS = [
  {
    id: 'default-topstep-50k',
    name: 'Topstep 50K',
    type: 'prop',
    broker: 'Topstep',
    balance: 54365.65,
    startDate: '2026-01-15',
    status: 'active',
    performanceData: {
      '2026-03': {
        totalPL: 4365.65,
        days: {
          '2026-03-02': { pl: 227.11, trades: 105 },
          '2026-03-06': { pl: -574.86, trades: 42 },
          '2026-03-12': { pl: 812.1, trades: 66 },
          '2026-03-19': { pl: 391.22, trades: 23 },
        },
        weeks: [
          { weekNumber: 1, pl: 1862.27, trades: 233 },
          { weekNumber: 2, pl: 972.45, trades: 154 },
          { weekNumber: 3, pl: 1530.93, trades: 182 },
        ],
      },
    },
  },
];

function getMonthIndexFromLabel(label) {
  const monthDate = new Date(`${label} 1, 2000`);
  const monthIndex = monthDate.getMonth();
  return Number.isNaN(monthIndex) ? new Date().getMonth() : monthIndex;
}

function createAccountId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `account-${Date.now()}`;
}

export function AccountsView() {
  const { getItem, setItem } = useStorage();
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [selectedAccountId, setSelectedAccountId] = useState(DEFAULT_ACCOUNTS[0].id);
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonthIndex, setCalendarMonthIndex] = useState(2);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [toastText, setToastText] = useState('');

  useEffect(() => {
    let isCancelled = false;
    getItem(STORAGE_KEYS.ACCOUNTS)
      .then((storedAccounts) => {
        if (isCancelled) return;
        if (Array.isArray(storedAccounts) && storedAccounts.length > 0) {
          setAccounts(storedAccounts);
          setSelectedAccountId(storedAccounts[0].id);
        } else {
          setItem(STORAGE_KEYS.ACCOUNTS, DEFAULT_ACCOUNTS).catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [getItem, setItem]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) || accounts[0],
    [accounts, selectedAccountId],
  );

  const persistAccounts = (nextAccounts) => {
    setAccounts(nextAccounts);
    setItem(STORAGE_KEYS.ACCOUNTS, nextAccounts).catch(() => {});
  };

  const upsertAccount = (formState) => {
    const nextAccounts = [...accounts];
    if (editingAccount) {
      const accountIndex = nextAccounts.findIndex((account) => account.id === editingAccount.id);
      if (accountIndex >= 0) {
        nextAccounts[accountIndex] = {
          ...nextAccounts[accountIndex],
          ...formState,
        };
      }
    } else {
      const nextAccount = {
        id: createAccountId(),
        ...formState,
        performanceData: {},
      };
      nextAccounts.push(nextAccount);
      setSelectedAccountId(nextAccount.id);
    }
    persistAccounts(nextAccounts);
    setIsFormOpen(false);
    setEditingAccount(null);
  };

  const updateAccountPerformance = (newData) => {
    if (!selectedAccount) return;

    const monthKey = `${newData.year}-${String(getMonthIndexFromLabel(newData.month) + 1).padStart(2, '0')}`;
    const nextAccounts = accounts.map((account) => {
      if (account.id !== selectedAccount.id) return account;
      return {
        ...account,
        performanceData: {
          ...(account.performanceData || {}),
          [monthKey]: {
            totalPL: newData.totalPL,
            days: newData.days || {},
            weeks: newData.weeks || [],
            todayDate: newData.todayDate,
          },
        },
      };
    });

    persistAccounts(nextAccounts);
    setCalendarYear(newData.year);
    setCalendarMonthIndex(getMonthIndexFromLabel(newData.month));
    setToastText('Data imported from screenshot');
    setIsImportOpen(false);

    window.setTimeout(() => {
      setToastText('');
    }, 2500);
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {toastText && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2.5 text-sm text-green-800 dark:text-green-400">
          {toastText}
        </div>
      )}

      <div className="grid lg:grid-cols-[300px,1fr] gap-3 flex-1 min-h-0">
        <aside className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Accounts</h2>
            <button
              type="button"
              onClick={() => {
                setEditingAccount(null);
                setIsFormOpen(true);
              }}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Add
            </button>
          </div>
          <div className="space-y-2">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isActive={account.id === selectedAccount?.id}
                onSelect={setSelectedAccountId}
              />
            ))}
          </div>
        </aside>

        <section className="flex flex-col gap-3 min-h-0">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white">{selectedAccount?.name || 'Account'}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{selectedAccount?.broker || 'No broker selected'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Import from Screenshot
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingAccount(selectedAccount);
                  setIsFormOpen(true);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white transition-colors"
              >
                Manual Edit
              </button>
            </div>
          </div>

          <PerformanceCalendar
            performanceData={selectedAccount?.performanceData || {}}
            monthIndex={calendarMonthIndex}
            year={calendarYear}
            onMonthChange={(nextMonthIndex, nextYear) => {
              setCalendarMonthIndex(nextMonthIndex);
              setCalendarYear(nextYear);
            }}
          />
        </section>
      </div>

      {isFormOpen && (
        <AccountFormModal
          initialAccount={editingAccount}
          onClose={() => {
            setIsFormOpen(false);
            setEditingAccount(null);
          }}
          onSave={upsertAccount}
        />
      )}

      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-3xl rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Import Performance from Screenshot</h3>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <ImageDropZone
              onDataExtracted={updateAccountPerformance}
              onCancel={() => setIsImportOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
