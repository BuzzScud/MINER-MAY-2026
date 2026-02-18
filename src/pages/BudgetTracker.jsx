import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const STORAGE_KEY_CATEGORIES = STORAGE_KEYS.BUDGET_CATEGORIES;
const STORAGE_KEY_BUDGETS = STORAGE_KEYS.BUDGET_BUDGETS;
const STORAGE_KEY_REMINDERS = STORAGE_KEYS.BUDGET_REMINDERS;

const DEFAULT_CATEGORIES = [
  { id: 1, name: 'Food & Dining', color: '#3b82f6' },
  { id: 2, name: 'Transportation', color: '#ef4444' },
  { id: 3, name: 'Shopping', color: '#10b981' },
  { id: 4, name: 'Bills & Utilities', color: '#f59e0b' },
  { id: 5, name: 'Entertainment', color: '#8b5cf6' },
  { id: 6, name: 'Healthcare', color: '#ec4899' },
  { id: 7, name: 'Salary', color: '#14b8a6' },
  { id: 8, name: 'Investment', color: '#06b6d4' },
  { id: 9, name: 'Housing', color: '#b18cfe' },
];

const WORLD_CLOCKS = [
  { tz: 'America/New_York', city: 'New York' },
  { tz: 'Europe/London', city: 'London' },
  { tz: 'Asia/Tokyo', city: 'Tokyo' },
];

function nextId(items) {
  if (!items || items.length === 0) return 1;
  const ids = items.map((x) => (x.id != null ? Number(x.id) : 0));
  return Math.max(...ids, 0) + 1;
}

function toYMD(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromYMD(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function BudgetTracker() {
  const { getItem, setItem } = useStorage();
  const [tab, setTab] = useState('dashboard');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [budgets, setBudgets] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [clock, setClock] = useState(new Date());

  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBillDetails, setShowBillDetails] = useState(null);
  const [editingBillId, setEditingBillId] = useState(null);

  const [txType, setTxType] = useState('income');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txDate, setTxDate] = useState(toYMD(new Date()));

  const [billTitle, setBillTitle] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDate, setBillDueDate] = useState(toYMD(new Date()));
  const [billCategory, setBillCategory] = useState('');
  const [billWebsite, setBillWebsite] = useState('');
  const [billRecurring, setBillRecurring] = useState(false);
  const [billRecurrenceType, setBillRecurrenceType] = useState('monthly');

  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState('#3b82f6');

  const [billsView, setBillsView] = useState('grid');
  const [billsSearch, setBillsSearch] = useState('');
  const [billsStatusFilter, setBillsStatusFilter] = useState('all');
  const [billsCategoryFilter, setBillsCategoryFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      getItem(STORAGE_KEY_CATEGORIES),
      getItem(STORAGE_KEY_BUDGETS),
      getItem(STORAGE_KEY_REMINDERS),
    ]).then(([cat, bud, rem]) => {
      setCategories(Array.isArray(cat) ? cat : DEFAULT_CATEGORIES);
      setBudgets(Array.isArray(bud) ? bud : []);
      setReminders(Array.isArray(rem) ? rem : []);
    });
  }, [getItem]);

  useEffect(() => {
    setItem(STORAGE_KEY_CATEGORIES, categories).catch(() => {});
  }, [categories, setItem]);
  useEffect(() => {
    setItem(STORAGE_KEY_BUDGETS, budgets).catch(() => {});
  }, [budgets, setItem]);
  useEffect(() => {
    setItem(STORAGE_KEY_REMINDERS, reminders).catch(() => {});
  }, [reminders, setItem]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const monthIncome = budgets
    .filter((b) => b.type === 'income')
    .filter((b) => {
      const d = fromYMD(b.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((s, b) => s + parseFloat(b.amount || 0), 0);

  const monthExpenses = budgets
    .filter((b) => b.type === 'expense')
    .filter((b) => {
      const d = fromYMD(b.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((s, b) => s + parseFloat(b.amount || 0), 0);

  const totalIncome = budgets
    .filter((b) => b.type === 'income')
    .reduce((s, b) => s + parseFloat(b.amount || 0), 0);
  const totalExpenses = budgets
    .filter((b) => b.type === 'expense')
    .reduce((s, b) => s + parseFloat(b.amount || 0), 0);
  const balance = totalIncome - totalExpenses;

  const categoryExpensesMap = {};
  budgets
    .filter((b) => b.type === 'expense')
    .filter((b) => {
      const d = fromYMD(b.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .forEach((b) => {
      categoryExpensesMap[b.category] = (categoryExpensesMap[b.category] || 0) + parseFloat(b.amount || 0);
    });
  const categoryChartData = Object.entries(categoryExpensesMap)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0);

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStr = toYMD(d);
    const amt = budgets
      .filter((b) => b.type === 'expense' && b.date === dayStr)
      .reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    last7Days.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amount: amt,
    });
  }

  const upcomingReminders = reminders
    .filter((r) => !r.is_paid)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 10);

  const addTransaction = useCallback(() => {
    const amt = parseFloat(txAmount);
    if (isNaN(amt) || amt <= 0) return;
    const cat = (txCategory && txCategory.trim()) || (categories[0]?.name ?? '');
    const id = nextId(budgets);
    setBudgets((prev) => [
      ...prev,
      {
        id,
        type: txType,
        amount: amt,
        category: cat,
        description: txDescription || '',
        date: txDate,
      },
    ]);
    setTxAmount('');
    setTxDescription('');
    setTxDate(toYMD(new Date()));
    setShowTransactionModal(false);
  }, [txAmount, txType, txCategory, txDescription, txDate, categories, budgets]);

  const addBill = useCallback(() => {
    const amt = parseFloat(billAmount);
    if (!billTitle.trim() || isNaN(amt) || amt <= 0) return;
    const cat = billCategory || (categories[0]?.name ?? '');
    if (editingBillId) {
      setReminders((prev) =>
        prev.map((r) =>
          r.id === editingBillId
            ? {
                ...r,
                title: billTitle.trim(),
                amount: amt,
                due_date: billDueDate,
                category: cat,
                website_url: billWebsite || '',
                recurring: billRecurring,
                recurrence_type: billRecurrenceType,
              }
            : r
        )
      );
      setEditingBillId(null);
    } else {
      const id = nextId(reminders);
      setReminders((prev) => [
        ...prev,
        {
          id,
          title: billTitle.trim(),
          amount: amt,
          due_date: billDueDate,
          category: cat,
          website_url: billWebsite || '',
          recurring: billRecurring,
          recurrence_type: billRecurrenceType,
          is_paid: false,
        },
      ]);
    }
    setBillTitle('');
    setBillAmount('');
    setBillDueDate(toYMD(new Date()));
    setBillWebsite('');
    setBillRecurring(false);
    setShowBillModal(false);
  }, [
    billTitle,
    billAmount,
    billDueDate,
    billCategory,
    billWebsite,
    billRecurring,
    billRecurrenceType,
    categories,
    reminders,
    editingBillId,
  ]);

  const addCategory = useCallback(() => {
    if (!catName.trim()) return;
    const id = nextId(categories);
    setCategories((prev) => [...prev, { id, name: catName.trim(), color: catColor }]);
    setCatName('');
    setCatColor('#3b82f6');
    setShowCategoryModal(false);
  }, [catName, catColor, categories]);

  const markBillPaid = useCallback((id, paid) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_paid: paid } : r))
    );
  }, []);

  const deleteBill = useCallback((id) => {
    if (window.confirm('Delete this bill?')) {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      setShowBillDetails(null);
    }
  }, []);

  const openEditBill = useCallback((r) => {
    setEditingBillId(r.id);
    setBillTitle(r.title || '');
    setBillAmount(String(r.amount || ''));
    setBillDueDate(r.due_date || toYMD(new Date()));
    setBillCategory(r.category || '');
    setBillWebsite(r.website_url || '');
    setBillRecurring(!!r.recurring);
    setBillRecurrenceType(r.recurrence_type || 'monthly');
    setShowBillModal(true);
  }, []);

  const clearAllData = useCallback(() => {
    if (window.confirm('Clear all data? This cannot be undone.')) {
      setBudgets([]);
      setReminders([]);
      setCategories(DEFAULT_CATEGORIES);
      setShowBillDetails(null);
    }
  }, []);

  const getBillStatus = (r) => {
    const due = new Date(r.due_date);
    const days = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (r.is_paid) return { text: 'Paid', cls: 'bg-green-100 text-green-800' };
    if (days < 0) return { text: `${Math.abs(days)} days overdue`, cls: 'bg-red-100 text-red-800' };
    if (days === 0) return { text: 'Due Today', cls: 'bg-orange-100 text-orange-800' };
    if (days <= 7) return { text: `${days} days left`, cls: 'bg-yellow-100 text-yellow-800' };
    return { text: `${days} days left`, cls: 'bg-blue-100 text-blue-800' };
  };

  const filteredBills = reminders.filter((r) => {
    if (billsSearch) {
      const q = billsSearch.toLowerCase();
      if (
        !(r.title || '').toLowerCase().includes(q) &&
        !(r.category || '').toLowerCase().includes(q)
      )
        return false;
    }
    if (billsCategoryFilter !== 'all' && r.category !== billsCategoryFilter) return false;
    const status = getBillStatus(r);
    if (billsStatusFilter === 'paid' && !r.is_paid) return false;
    if (billsStatusFilter === 'unpaid' && r.is_paid) return false;
    if (billsStatusFilter === 'overdue' && status.text.indexOf('overdue') < 0) return false;
    if (billsStatusFilter === 'due-soon' && !['Due Today', 'days left'].some((s) => status.text.includes(s)))
      return false;
    return true;
  });

  const containerCls =
    'w-full max-w-[1800px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-hidden';

  return (
    <div className={containerCls}>
      <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4 flex-shrink-0">
        <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="font-medium text-gray-900 dark:text-white">Budget Tracker</span>
      </nav>
      <div className="text-center mb-6 flex-shrink-0">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
          Budget Tracker
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Track income, expenses, and bills
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 text-sm mb-4 flex-shrink-0">
        <button
          type="button"
          onClick={() => setTab('dashboard')}
          className={tab === 'dashboard' ? 'text-sky-400' : 'text-black dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
        >
          Dashboard
        </button>
        <span className="text-gray-800 dark:text-gray-500">|</span>
        <button
          type="button"
          onClick={() => setTab('bills')}
          className={tab === 'bills' ? 'text-sky-400' : 'text-black dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
        >
          Bills
        </button>
        <span className="text-gray-800 dark:text-gray-500">|</span>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className={tab === 'settings' ? 'text-sky-400' : 'text-black dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
        >
          Settings
        </button>
      </div>

      {/* Dashboard */}
      {tab === 'dashboard' && (
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowTransactionModal(true)}
              className="py-2 px-3 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Transaction
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Balance</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                ${balance.toFixed(2)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">This Month Income</p>
              <p className="text-lg font-bold text-green-600">${monthIncome.toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">This Month Expenses</p>
              <p className="text-lg font-bold text-red-600">${monthExpenses.toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Upcoming Bills</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {reminders.filter((r) => !r.is_paid).length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400 mb-2">
                Expense by Category
              </h2>
              {categoryChartData.length > 0 ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {categoryChartData.map((entry, i) => {
                          const cat = categories.find((c) => c.name === entry.name);
                          return (
                            <Cell key={i} fill={cat?.color || '#6b7280'} />
                          );
                        })}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [`$${v.toFixed(2)}`, 'Amount']}
                        contentStyle={{
                          fontSize: '12px',
                          background: 'var(--tw-bg-opacity, 1)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center">
                  No expense data this month
                </p>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400 mb-2">
                Last 7 Days Expenses
              </h2>
              {last7Days.some((d) => d.amount > 0) ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={last7Days}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Expenses']} />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center">
                  No expense data
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400 mb-2">
                World Clocks
              </h2>
              <div className="space-y-2">
                {WORLD_CLOCKS.map(({ tz, city }) => (
                  <div
                    key={tz}
                    className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-xs"
                  >
                    <span className="font-medium text-gray-700 dark:text-gray-300">{city}</span>
                    <div className="font-mono text-gray-900 dark:text-white">
                      {clock.toLocaleTimeString('en-US', { timeZone: tz, hour12: true })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400">
                  Upcoming Bills
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingBillId(null);
                    setBillTitle('');
                    setBillAmount('');
                    setBillDueDate(toYMD(new Date()));
                    setBillCategory('');
                    setBillWebsite('');
                    setBillRecurring(false);
                    setShowBillModal(true);
                  }}
                  className="text-xs font-medium text-sky-400 hover:text-sky-300"
                >
                  Add Bill
                </button>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {upcomingReminders.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">No upcoming bills</p>
                ) : (
                  upcomingReminders.map((r) => {
                    const status = getBillStatus(r);
                    const catColor =
                      categories.find((c) => c.name === r.category)?.color || '#6b7280';
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: catColor }}
                          />
                          <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {r.title}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ${parseFloat(r.amount || 0).toFixed(2)}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${status.cls}`}
                          >
                            {status.text}
                          </span>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {!r.is_paid && (
                            <button
                              type="button"
                              onClick={() => markBillPaid(r.id, true)}
                              className="text-[10px] text-green-600 hover:text-green-700"
                            >
                              Pay
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditBill(r)}
                            className="text-[10px] text-sky-400 hover:text-sky-300"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bills */}
      {tab === 'bills' && (
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => {
                setEditingBillId(null);
                setBillTitle('');
                setBillAmount('');
                setBillDueDate(toYMD(new Date()));
                setBillCategory('');
                setBillWebsite('');
                setBillRecurring(false);
                setShowBillModal(true);
              }}
              className="py-2 px-3 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Bill
            </button>
            <input
              type="text"
              placeholder="Search..."
              value={billsSearch}
              onChange={(e) => setBillsSearch(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-40"
            />
            <select
              value={billsStatusFilter}
              onChange={(e) => setBillsStatusFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
              <option value="due-soon">Due Soon</option>
            </select>
            <select
              value={billsCategoryFilter}
              onChange={(e) => setBillsCategoryFilter(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setBillsView('grid')}
                className={`p-1.5 rounded text-xs ${billsView === 'grid' ? 'bg-blue-100 text-blue-700' : 'text-gray-500'}`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setBillsView('list')}
                className={`p-1.5 rounded text-xs ${billsView === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-500'}`}
              >
                List
              </button>
            </div>
          </div>

          <div
            className={
              billsView === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
                : 'space-y-2'
            }
          >
            {filteredBills.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-8">
                No bills found
              </p>
            ) : (
              filteredBills.map((r) => {
                const status = getBillStatus(r);
                const catColor =
                  categories.find((c) => c.name === r.category)?.color || '#6b7280';
                return (
                  <div
                    key={r.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: catColor }}
                          />
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {r.title}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${status.cls}`}
                          >
                            {status.text}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          ${parseFloat(r.amount || 0).toFixed(2)} · {r.category} ·{' '}
                          {new Date(r.due_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {!r.is_paid ? (
                          <button
                            type="button"
                            onClick={() => markBillPaid(r.id, true)}
                            className="text-[10px] text-green-600 hover:text-green-700"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markBillPaid(r.id, false)}
                            className="text-[10px] text-orange-600 hover:text-orange-700"
                          >
                            Unpaid
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditBill(r)}
                          className="text-[10px] text-sky-400 hover:text-sky-300"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBill(r.id)}
                          className="text-[10px] text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Settings */}
      {tab === 'settings' && (
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400">
                Categories
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCatName('');
                  setCatColor('#3b82f6');
                  setShowCategoryModal(true);
                }}
                className="py-1.5 px-2 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add Category
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 p-2 rounded bg-gray-50 dark:bg-gray-700/50"
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                    {c.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400 mb-2">
              Data
            </h2>
            <button
              type="button"
              onClick={clearAllData}
              className="py-2 px-3 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Clear All Data
            </button>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showTransactionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowTransactionModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
              Add Transaction
            </h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Type
                </label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Category
                </label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Description
                </label>
                <input
                  type="text"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Date
                </label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowTransactionModal(false)}
                className="flex-1 py-1.5 text-sm font-medium border rounded text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addTransaction}
                className="flex-1 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Bill Modal */}
      {showBillModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowBillModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
              {editingBillId ? 'Edit Bill' : 'Add Bill'}
            </h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Title
                </label>
                <input
                  type="text"
                  value={billTitle}
                  onChange={(e) => setBillTitle(e.target.value)}
                  placeholder="e.g., Rent, Utilities"
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Due Date
                </label>
                <input
                  type="date"
                  value={billDueDate}
                  onChange={(e) => setBillDueDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Category
                </label>
                <select
                  value={billCategory}
                  onChange={(e) => setBillCategory(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Website URL (optional)
                </label>
                <input
                  type="url"
                  value={billWebsite}
                  onChange={(e) => setBillWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bill-recurring"
                  checked={billRecurring}
                  onChange={(e) => setBillRecurring(e.target.checked)}
                  className="rounded"
                />
                <label
                  htmlFor="bill-recurring"
                  className="text-xs text-gray-700 dark:text-gray-300"
                >
                  Recurring
                </label>
              </div>
              {billRecurring && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                    Frequency
                  </label>
                  <select
                    value={billRecurrenceType}
                    onChange={(e) => setBillRecurrenceType(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowBillModal(false)}
                className="flex-1 py-1.5 text-sm font-medium border rounded text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addBill}
                className="flex-1 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showCategoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCategoryModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
              Add Category
            </h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Name
                </label>
                <input
                  type="text"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Color
                </label>
                <input
                  type="color"
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  className="w-full h-8 rounded"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="flex-1 py-1.5 text-sm font-medium border rounded text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addCategory}
                className="flex-1 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BudgetTracker;
