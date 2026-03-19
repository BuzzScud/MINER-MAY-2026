function formatBalance(value) {
  const numberValue = Number(value) || 0;
  return numberValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const STATUS_COLORS = {
  active: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
  blown: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
  passed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
  inactive: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400',
};

export function AccountCard({ account, isActive, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(account.id)}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        isActive
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500/50'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{account.name}</h3>
        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
          {account.type}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{account.broker}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-2">{formatBalance(account.balance)}</p>
      <span className={`inline-flex text-[10px] mt-2 px-2 py-0.5 rounded ${STATUS_COLORS[account.status] || STATUS_COLORS.inactive}`}>
        {account.status}
      </span>
    </button>
  );
}
