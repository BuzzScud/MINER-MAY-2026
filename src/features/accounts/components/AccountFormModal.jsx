import { useMemo, useState } from 'react';

const ACCOUNT_TYPES = ['prop', 'personal', 'paper'];
const ACCOUNT_STATUSES = ['active', 'blown', 'passed', 'inactive'];

export function AccountFormModal({ initialAccount, onClose, onSave }) {
  const defaults = useMemo(
    () => ({
      name: initialAccount?.name || '',
      type: initialAccount?.type || 'prop',
      broker: initialAccount?.broker || '',
      balance: initialAccount?.balance ?? 0,
      startDate: initialAccount?.startDate || '',
      status: initialAccount?.status || 'active',
    }),
    [initialAccount],
  );

  const [formState, setFormState] = useState(defaults);

  const updateField = (fieldName, value) => {
    setFormState((previousState) => ({ ...previousState, [fieldName]: value }));
  };

  const inputClasses = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {initialAccount ? 'Edit Account' : 'Add Account'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Account Name</span>
            <input
              type="text"
              value={formState.name}
              onChange={(event) => updateField('name', event.target.value)}
              className={inputClasses}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Type</span>
            <select
              value={formState.type}
              onChange={(event) => updateField('type', event.target.value)}
              className={inputClasses}
            >
              {ACCOUNT_TYPES.map((accountType) => (
                <option key={accountType} value={accountType}>
                  {accountType}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
            <select
              value={formState.status}
              onChange={(event) => updateField('status', event.target.value)}
              className={inputClasses}
            >
              {ACCOUNT_STATUSES.map((accountStatus) => (
                <option key={accountStatus} value={accountStatus}>
                  {accountStatus}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Broker</span>
            <input
              type="text"
              value={formState.broker}
              onChange={(event) => updateField('broker', event.target.value)}
              className={inputClasses}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Balance</span>
            <input
              type="number"
              value={formState.balance}
              onChange={(event) => updateField('balance', Number(event.target.value))}
              className={inputClasses}
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Start Date</span>
            <input
              type="date"
              value={formState.startDate}
              onChange={(event) => updateField('startDate', event.target.value)}
              className={inputClasses}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(formState)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
