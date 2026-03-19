import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStorage, saveBatch } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { STORAGE_KEYS } from '../utils/storageKeys';
import {
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
const STORAGE_KEY_SETTINGS = STORAGE_KEYS.BUDGET_SETTINGS;

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
  const { getItem, token } = useStorage();
  const { migrationPending } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [budgets, setBudgets] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [settings, setSettings] = useState({
    currencyCode: 'USD',
    useThousandSeparators: true,
    monthlyExpenseWarningPercent: 80,
    upcomingBillDaysWarning: 7,
    defaultTransactionCategory: '',
  });
  const [dataReady, setDataReady] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const loadGeneration = useRef(0);

  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
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
  const [billsCategoryFilter, setBillsCategoryFilter] = useState('all');
  const [biSubView, setBiSubView] = useState('unpaid'); // 'unpaid' | 'paid' | 'income'

  const [editingTxId, setEditingTxId] = useState(null);
  const [incomeSearch, setIncomeSearch] = useState('');
  const [incomeCategoryFilter, setIncomeCategoryFilter] = useState('all');
  const [incomeView, setIncomeView] = useState('grid');

  const formatCurrency = useCallback(
    (amount) => {
      const safeAmount = Number(amount || 0);
      try {
        const formatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: settings.currencyCode || 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: settings.useThousandSeparators,
        });
        return formatter.format(safeAmount);
      } catch {
        const fixed = safeAmount.toFixed(2);
        if (settings.useThousandSeparators) {
          const [intPart, decPart] = fixed.split('.');
          const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return `$${withSep}.${decPart}`;
        }
        return `$${fixed}`;
      }
    },
    [settings.currencyCode, settings.useThousandSeparators]
  );

  useEffect(() => {
    if (migrationPending) return;
    /* eslint-disable react-hooks/set-state-in-effect -- intentional: reset flags before async load to prevent stale saves */
    setDataReady(false);
    setIsDirty(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    const thisLoad = ++loadGeneration.current;
    Promise.all([
      getItem(STORAGE_KEY_CATEGORIES),
      getItem(STORAGE_KEY_BUDGETS),
      getItem(STORAGE_KEY_REMINDERS),
      getItem(STORAGE_KEY_SETTINGS),
    ])
      .then(([cat, bud, rem, rawSettings]) => {
        if (thisLoad !== loadGeneration.current) return;
        const loadedCategories =
          Array.isArray(cat) && cat.length > 0 ? cat : DEFAULT_CATEGORIES;
        setCategories(loadedCategories);

        const loadedBudgets = Array.isArray(bud) ? bud : [];
        const loadedReminders = Array.isArray(rem) ? rem : [];

        const paidBills = loadedReminders.filter((r) => r.is_paid);
        const existingBillIds = new Set(
          loadedBudgets.filter((b) => b._billId != null).map((b) => b._billId),
        );
        const missingExpenses = [];
        for (const bill of paidBills) {
          if (!existingBillIds.has(bill.id)) {
            const billAmount = parseFloat(bill.amount || 0);
            if (!isNaN(billAmount) && billAmount > 0) {
              missingExpenses.push({
                id: nextId([...loadedBudgets, ...missingExpenses]),
                type: 'expense',
                amount: billAmount,
                category: bill.category,
                description: `Bill: ${bill.title}`,
                date: bill.due_date || toYMD(new Date()),
                _billId: bill.id,
              });
            }
          }
        }

        const reconciledBudgets =
          missingExpenses.length > 0
            ? [...loadedBudgets, ...missingExpenses]
            : loadedBudgets;

        setBudgets(reconciledBudgets);
        setReminders(loadedReminders);

        if (missingExpenses.length > 0) {
          setIsDirty(true);
        }
        setSettings((prev) => {
          const stored =
            rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
          const defaultCategoryName = stored.defaultTransactionCategory ||
            (loadedCategories[0]?.name ?? '');
          return {
            currencyCode: stored.currencyCode || prev.currencyCode || 'USD',
            useThousandSeparators:
              typeof stored.useThousandSeparators === 'boolean'
                ? stored.useThousandSeparators
                : prev.useThousandSeparators,
            monthlyExpenseWarningPercent:
              typeof stored.monthlyExpenseWarningPercent === 'number'
                ? stored.monthlyExpenseWarningPercent
                : prev.monthlyExpenseWarningPercent,
            upcomingBillDaysWarning:
              typeof stored.upcomingBillDaysWarning === 'number'
                ? stored.upcomingBillDaysWarning
                : prev.upcomingBillDaysWarning,
            defaultTransactionCategory: defaultCategoryName,
          };
        });
        setTimeout(() => setDataReady(true), 0);
      })
      .catch(() => {
        // Keep dataReady=false so we never auto-save on a failed initial load
      });
  }, [getItem, token, migrationPending]);

  useEffect(() => {
    if (!dataReady) return;
    if (migrationPending) return;
    if (!isDirty) return;
    saveBatch(token, {
      [STORAGE_KEY_CATEGORIES]: categories,
      [STORAGE_KEY_BUDGETS]: budgets,
      [STORAGE_KEY_REMINDERS]: reminders,
      [STORAGE_KEY_SETTINGS]: settings,
    })
      .then(() => setIsDirty(false))
      .catch(() => {});
  }, [dataReady, migrationPending, isDirty, categories, budgets, reminders, settings, token]);

  useEffect(() => {
    const flush = () => {
      if (token) {
        saveBatch(token, {
          [STORAGE_KEY_CATEGORIES]: categories,
          [STORAGE_KEY_BUDGETS]: budgets,
          [STORAGE_KEY_REMINDERS]: reminders,
          [STORAGE_KEY_SETTINGS]: settings,
        }).catch(() => {});
      } else {
        try {
          localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
          localStorage.setItem(STORAGE_KEY_BUDGETS, JSON.stringify(budgets));
          localStorage.setItem(STORAGE_KEY_REMINDERS, JSON.stringify(reminders));
          localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
        } catch { /* flush best-effort */ }
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [token, categories, budgets, reminders, settings]);

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

  const billsDueThisMonth = reminders.filter((r) => {
    const d = fromYMD(r.due_date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const billsTotalAmountThisMonth = billsDueThisMonth.reduce(
    (sum, r) => sum + parseFloat(r.amount || 0),
    0,
  );
  const billsPaidCountThisMonth = billsDueThisMonth.filter((r) => r.is_paid).length;
  const billsTotalCountThisMonth = billsDueThisMonth.length;
  const billsPaidAmountThisMonth = billsDueThisMonth
    .filter((r) => r.is_paid)
    .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
  const billsRemainingAmountThisMonth = billsTotalAmountThisMonth - billsPaidAmountThisMonth;
  const billsPaymentProgressPct =
    billsTotalAmountThisMonth > 0
      ? Math.min(
          100,
          Math.round(
            (billsPaidAmountThisMonth / billsTotalAmountThisMonth) * 100,
          ),
        )
      : 0;

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
  const incomeTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStr = toYMD(d);
    const expenseAmount = budgets
      .filter((b) => b.type === 'expense' && b.date === dayStr)
      .reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    const incomeAmount = budgets
      .filter((b) => b.type === 'income' && b.date === dayStr)
      .reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    last7Days.push({
      date: label,
      amount: expenseAmount,
    });
    incomeTrend.push({
      date: label,
      amount: incomeAmount,
    });
  }
  const last7DaysExpenseTotal = last7Days.reduce((sum, d) => sum + d.amount, 0);

  const incomeByCategoryMap = {};
  budgets
    .filter((b) => b.type === 'income')
    .filter((b) => {
      const d = fromYMD(b.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .forEach((b) => {
      incomeByCategoryMap[b.category] =
        (incomeByCategoryMap[b.category] || 0) + parseFloat(b.amount || 0);
    });
  const incomeByCategory = Object.entries(incomeByCategoryMap)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0);

  const incomeEntriesThisMonth = budgets
    .filter((b) => b.type === 'income')
    .filter((b) => {
      const d = fromYMD(b.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

  const incomeEntriesThisMonthCount = incomeEntriesThisMonth.length;

  const incomeByCategorySorted = incomeByCategory
    .slice()
    .sort((a, b) => b.value - a.value);

  const incomeTopCategory = incomeByCategorySorted[0] || null;

  const sortedBills = [...reminders].sort(
    (a, b) => new Date(a.due_date) - new Date(b.due_date)
  );

  const addTransaction = useCallback(() => {
    const normalizedAmount =
      typeof txAmount === 'string' ? txAmount.replace(/,/g, '') : txAmount;
    const amt = parseFloat(normalizedAmount);
    if (isNaN(amt) || amt <= 0) return;
    const cat = (txCategory && txCategory.trim()) || (categories[0]?.name ?? '');
    if (editingTxId) {
      setBudgets((prev) =>
        prev.map((b) =>
          b.id === editingTxId
            ? {
                ...b,
                type: txType,
                amount: amt,
                category: cat,
                description: txDescription || '',
                date: txDate,
              }
            : b
        )
      );
      setEditingTxId(null);
    } else {
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
    }
    setIsDirty(true);
    setTxAmount('');
    setTxDescription('');
    setTxDate(toYMD(new Date()));
    setShowTransactionModal(false);
  }, [txAmount, txType, txCategory, txDescription, txDate, categories, budgets, editingTxId]);

  const deleteTransaction = useCallback(
    (id) => {
      if (window.confirm('Delete this transaction?')) {
        const deletedBudgetEntry = budgets.find((b) => b.id === id);
        const linkedBillId = deletedBudgetEntry?._billId;

        if (linkedBillId != null) {
          setReminders((prevReminders) =>
            prevReminders.map((r) =>
              r.id === linkedBillId ? { ...r, is_paid: false } : r,
            ),
          );
        }

        setBudgets((prev) => prev.filter((b) => b.id !== id));
        setIsDirty(true);
        setEditingTxId(null);
        setShowTransactionModal(false);
      }
    },
    [budgets],
  );

  const openEditTransaction = useCallback((tx) => {
    setEditingTxId(tx.id);
    setTxType(tx.type || 'income');
    setTxAmount(String(tx.amount || ''));
    setTxCategory(tx.category || '');
    setTxDescription(tx.description || '');
    setTxDate(tx.date || toYMD(new Date()));
    setShowTransactionModal(true);
  }, []);

  const addBill = useCallback(() => {
    const normalizedAmount =
      typeof billAmount === 'string' ? billAmount.replace(/,/g, '') : billAmount;
    const amt = parseFloat(normalizedAmount);
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
      setBudgets((prev) =>
        prev.map((b) =>
          b._billId === editingBillId
            ? {
                ...b,
                amount: amt,
                category: cat,
                description: `Bill: ${billTitle.trim()}`,
              }
            : b
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
    setIsDirty(true);
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
    setIsDirty(true);
    setCatName('');
    setCatColor('#3b82f6');
    setShowCategoryModal(false);
  }, [catName, catColor, categories]);

  const markBillPaid = useCallback(
    (id, paid) => {
      const target = reminders.find((r) => r.id === id);
      if (!target) return;

      // Update reminders first
      setReminders((prev) => {
        const updated = prev.map((r) =>
          r.id === id ? { ...r, is_paid: paid } : r,
        );

        const updatedTarget = updated.find((r) => r.id === id);
        if (!updatedTarget) return updated;

        if (!paid) return updated;
        if (!updatedTarget.recurring) return updated;

        const baseDate = fromYMD(updatedTarget.due_date);
        const next = new Date(baseDate);
        switch (updatedTarget.recurrence_type) {
          case 'daily':
            next.setDate(next.getDate() + 1);
            break;
          case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
          case 'yearly':
            next.setFullYear(next.getFullYear() + 1);
            break;
          case 'monthly':
          default:
            next.setMonth(next.getMonth() + 1);
            break;
        }

        const nextIdValue = nextId(updated);
        const rolled = {
          id: nextIdValue,
          title: updatedTarget.title,
          amount: updatedTarget.amount,
          due_date: toYMD(next),
          category: updatedTarget.category,
          website_url: updatedTarget.website_url || '',
          recurring: true,
          recurrence_type: updatedTarget.recurrence_type || 'monthly',
          is_paid: false,
        };

        return [...updated, rolled];
      });

      // Update budgets separately (critical: do not nest setBudgets inside setReminders)
      if (!paid) {
        setBudgets((prevBudgets) => prevBudgets.filter((b) => b._billId !== id));
      } else {
        const billAmount = parseFloat(target.amount || 0);
        if (!isNaN(billAmount) && billAmount > 0) {
          setBudgets((prevBudgets) => {
            const existing = prevBudgets.find((b) => b._billId === id);
            if (existing) return prevBudgets;

            return [
              ...prevBudgets,
              {
                id: nextId(prevBudgets),
                type: 'expense',
                amount: billAmount,
                category: target.category,
                description: `Bill: ${target.title}`,
                date: toYMD(new Date()),
                _billId: id,
              },
            ];
          });
        }
      }

      setIsDirty(true);
    },
    [reminders],
  );

  const deleteBill = useCallback((id) => {
    if (window.confirm('Delete this bill?')) {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      setBudgets((prevBudgets) => prevBudgets.filter((b) => b._billId !== id));
      setIsDirty(true);
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
      setIsDirty(true);
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
    return true;
  });

  const unpaidBills = filteredBills.filter((r) => !r.is_paid);
  const paidBills = filteredBills.filter((r) => r.is_paid);

  const paidDateMap = {};
  budgets.forEach((b) => {
    if (b._billId != null) paidDateMap[b._billId] = b.date;
  });

  const filteredIncome = budgets
    .filter((b) => b.type === 'income')
    .filter((b) => {
      if (incomeSearch) {
        const q = incomeSearch.toLowerCase();
        if (
          !(b.description || '').toLowerCase().includes(q) &&
          !(b.category || '').toLowerCase().includes(q)
        )
          return false;
      }
      if (incomeCategoryFilter !== 'all' && b.category !== incomeCategoryFilter) return false;
      return true;
    });

  const recentTransactions = [...budgets]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);

  const containerCls =
    'w-full max-w-[1800px] mx-auto px-4 flex flex-col h-full min-h-0 overflow-y-auto';

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
          onClick={() => setTab('bills-income')}
          className={tab === 'bills-income' ? 'text-sky-400' : 'text-black dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
        >
          Bills &amp; Income
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
              onClick={() => {
                setEditingTxId(null);
                setTxType('income');
                setTxAmount('');
                setTxCategory((settings.defaultTransactionCategory || categories[0]?.name) ?? '');
                setTxDescription('');
                setTxDate(toYMD(new Date()));
                setShowTransactionModal(true);
              }}
              className="py-2 px-3 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Transaction
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Balance</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatCurrency(balance)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">This Month Income</p>
              <p className="text-lg font-bold text-green-600">
                {formatCurrency(monthIncome)}
              </p>
            </div>
            <div
              className={`bg-white dark:bg-gray-800 rounded-lg border p-4 ${
                monthIncome > 0 &&
                (monthExpenses / Math.max(monthIncome, 1)) * 100 >
                  (settings.monthlyExpenseWarningPercent || 80)
                  ? 'border-amber-400 shadow-sm'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">This Month Expenses</p>
              <p className="text-lg font-bold text-red-600">
                {formatCurrency(monthExpenses)}
              </p>
              {monthIncome > 0 &&
                (monthExpenses / Math.max(monthIncome, 1)) * 100 >
                  (settings.monthlyExpenseWarningPercent || 80) && (
                  <p className="mt-1 text-[11px] font-medium text-amber-600">
                    Over your {settings.monthlyExpenseWarningPercent}% monthly limit.
                  </p>
                )}
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
                Income Overview
              </h2>
              {totalIncome > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        This Month Income
                      </p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(monthIncome)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        All Time Income
                      </p>
                      <p className="text-sm font-semibold text-emerald-500">
                        {formatCurrency(totalIncome)}
                      </p>
                    </div>
                  </div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={incomeTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `$${v}`}
                          width={45}
                        />
                        <Tooltip
                          formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Income']}
                        />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          stroke="#22c55e"
                          fill="#22c55e"
                          fillOpacity={0.25}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {incomeByCategory.length > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                        Top Income Sources
                      </p>
                      <div className="space-y-1">
                        {incomeByCategory
                          .slice()
                          .sort((a, b) => b.value - a.value)
                          .slice(0, 3)
                          .map((item) => {
                            const cat =
                              categories.find((c) => c.name === item.name) || null;
                            return (
                              <div
                                key={item.name}
                                className="flex items-center justify-between text-[11px]"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: cat?.color || '#22c55e' }}
                                  />
                                  <span className="text-gray-700 dark:text-gray-200">
                                    {item.name}
                                  </span>
                                </div>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {formatCurrency(item.value)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center">
                  No income recorded yet. Add income transactions to see insights here.
                </p>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400 mb-2">
                Expenses Overview
              </h2>
              {last7Days.some((d) => d.amount > 0) ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Last 7 Days
                      </p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(last7DaysExpenseTotal)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        This Month
                      </p>
                      <p className="text-sm font-semibold text-red-500">
                        {formatCurrency(monthExpenses)}
                      </p>
                    </div>
                  </div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={last7Days}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `$${v}`}
                          width={45}
                        />
                        <Tooltip
                          formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Expenses']}
                        />
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
                  {categoryChartData.length > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                        Top Categories This Month
                      </p>
                      <div className="space-y-1">
                        {categoryChartData
                          .slice()
                          .sort((a, b) => b.value - a.value)
                          .slice(0, 4)
                          .map((item) => {
                            const cat =
                              categories.find((c) => c.name === item.name) || null;
                            return (
                              <div
                                key={item.name}
                                className="flex items-center justify-between text-[11px]"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: cat?.color || '#3b82f6' }}
                                  />
                                  <span className="text-gray-700 dark:text-gray-200">
                                    {item.name}
                                  </span>
                                </div>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {formatCurrency(item.value)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center">
                  No expense data for the last 7 days.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400 mb-3">
                Budget Health
              </h2>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    This Month Usage
                  </p>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    {monthIncome > 0
                      ? `${Math.min(100, Math.round((monthExpenses / monthIncome) * 100))}% of income`
                      : 'No income yet'}
                  </p>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400 transition-all"
                    style={{
                      width: `${
                        monthIncome > 0
                          ? Math.min(100, (monthExpenses / monthIncome) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span>
                    Spent:{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {formatCurrency(monthExpenses)}
                    </span>
                  </span>
                  <span>
                    Remaining:{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {formatCurrency(Math.max(monthIncome - monthExpenses, 0))}
                    </span>
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Updates in real time as you add income and expenses.
                </p>
              </div>
            </div>
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex justify-between items-center mb-3">
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
              <div className="mt-1 border-t border-gray-100 dark:border-gray-700 pt-2">
                <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400 px-2 pb-1">
                  <span className="col-span-4">Bill</span>
                  <span className="col-span-2 text-right">Amount</span>
                  <span className="col-span-3">Due</span>
                  <span className="col-span-2">Status</span>
                  <span className="col-span-1 text-right">Actions</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {sortedBills.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-2">
                      No bills yet. Add your first bill to see it here.
                    </p>
                  ) : (
                    sortedBills.map((r) => {
                      const status = getBillStatus(r);
                      const catColor =
                        categories.find((c) => c.name === r.category)?.color || '#6b7280';
                      const dueDate = r.due_date
                        ? new Date(r.due_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '-';
                      return (
                        <div
                          key={r.id}
                          className="grid grid-cols-12 gap-2 items-center rounded bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1.5"
                        >
                          <div className="col-span-4 flex items-center gap-2 min-w-0">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: catColor }}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                                {r.title}
                              </p>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                {r.category}
                              </p>
                            </div>
                          </div>
                          <div className="col-span-2 text-xs font-semibold text-gray-900 dark:text-white text-right">
                            {formatCurrency(parseFloat(r.amount || 0))}
                          </div>
                          <div className="col-span-3 text-xs text-gray-800 dark:text-gray-200">
                            {dueDate}
                          </div>
                          <div className="col-span-2">
                            <span
                              className={`inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded ${status.cls}`}
                            >
                              {status.text}
                            </span>
                          </div>
                          <div className="col-span-1 flex items-center justify-end gap-1">
                            {!r.is_paid && (
                              <button
                                type="button"
                                onClick={() => markBillPaid(r.id, true)}
                                className="inline-flex items-center justify-center rounded-full bg-green-50 dark:bg-green-900/40 text-[10px] text-green-700 dark:text-green-300 px-1.5 py-0.5 hover:bg-green-100 dark:hover:bg-green-800"
                              >
                                Pay
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditBill(r)}
                              className="inline-flex items-center justify-center rounded-full bg-sky-50 dark:bg-sky-900/40 text-[10px] text-sky-600 dark:text-sky-300 px-1.5 py-0.5 hover:bg-sky-100 dark:hover:bg-sky-800"
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

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400 mb-3">
              Recent Transactions
            </h2>
            <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400 px-2 pb-1">
                <span className="col-span-2">Date</span>
                <span className="col-span-4">Description</span>
                <span className="col-span-2">Category</span>
                <span className="col-span-2 text-right">Amount</span>
                <span className="col-span-1 text-right">Type</span>
                <span className="col-span-1 text-right">Actions</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {recentTransactions.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-2">
                    No transactions yet. Add income or expenses to see them here.
                  </p>
                ) : (
                  recentTransactions.map((tx) => {
                    const catColor = categories.find((c) => c.name === tx.category)?.color || '#6b7280';
                    const isIncome = tx.type === 'income';
                    return (
                      <div
                        key={tx.id}
                        className="grid grid-cols-12 gap-2 items-center rounded bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1.5"
                      >
                        <span className="col-span-2 text-xs text-gray-800 dark:text-gray-200">
                          {tx.date ? new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                        </span>
                        <span className="col-span-4 text-xs text-gray-900 dark:text-white truncate">
                          {tx.description || '—'}
                        </span>
                        <div className="col-span-2 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{tx.category || '—'}</span>
                        </div>
                        <span className={`col-span-2 text-xs font-semibold text-right ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                          {isIncome ? '+' : '-'}{formatCurrency(parseFloat(tx.amount || 0))}
                        </span>
                        <span className={`col-span-1 text-[10px] px-1.5 py-0.5 rounded text-right ${isIncome ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {isIncome ? 'In' : 'Out'}
                        </span>
                        <div className="col-span-1 flex justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={() => openEditTransaction(tx)}
                            className="text-[10px] text-sky-600 hover:text-sky-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTransaction(tx.id)}
                            className="text-[10px] text-red-500 hover:text-red-600"
                          >
                            Del
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

      {/* Bills & Income (combined tab) */}
      {tab === 'bills-income' && (
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          {/* Combined summary card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400">
                  Bills
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Due this month</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                  {formatCurrency(billsTotalAmountThisMonth)}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Paid</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {billsPaidCountThisMonth} of {billsTotalCountThisMonth} paid
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Remaining</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(Math.max(billsRemainingAmountThisMonth, 0))}
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
                    style={{ width: `${billsPaymentProgressPct}%` }}
                  />
                </div>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400">
                  Income
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">This month</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatCurrency(monthIncome)}
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">All time</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(totalIncome)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Entries this month</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {incomeEntriesThisMonthCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-view toggle */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setBiSubView('unpaid')}
              className={`px-3 py-2 text-sm font-medium rounded-lg ${
                biSubView === 'unpaid'
                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Unpaid
            </button>
            <button
              type="button"
              onClick={() => setBiSubView('paid')}
              className={`px-3 py-2 text-sm font-medium rounded-lg ${
                biSubView === 'paid'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Paid
            </button>
            <button
              type="button"
              onClick={() => setBiSubView('income')}
              className={`px-3 py-2 text-sm font-medium rounded-lg ${
                biSubView === 'income'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Income
            </button>
          </div>

          {/* Shared controls */}
          <div className="flex flex-wrap gap-2 items-center">
            {biSubView === 'income' ? (
              <button
                type="button"
                onClick={() => {
                  setEditingTxId(null);
                  setTxType('income');
                  setTxAmount('');
                  setTxCategory(
                    settings.defaultTransactionCategory || (categories[0]?.name ?? ''),
                  );
                  setTxDescription('');
                  setTxDate(toYMD(new Date()));
                  setShowTransactionModal(true);
                }}
                className="py-2 px-3 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                Add Income
              </button>
            ) : (
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
            )}
            <input
              type="text"
              placeholder="Search..."
              value={biSubView === 'income' ? incomeSearch : billsSearch}
              onChange={(e) =>
                biSubView === 'income'
                  ? setIncomeSearch(e.target.value)
                  : setBillsSearch(e.target.value)
              }
              className="px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-full sm:w-40"
            />
            <select
              value={biSubView === 'income' ? incomeCategoryFilter : billsCategoryFilter}
              onChange={(e) =>
                biSubView === 'income'
                  ? setIncomeCategoryFilter(e.target.value)
                  : setBillsCategoryFilter(e.target.value)
              }
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
                onClick={() =>
                  biSubView === 'income' ? setIncomeView('grid') : setBillsView('grid')
                }
                className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2.5 rounded text-xs ${
                  (biSubView === 'income' ? incomeView : billsView) === 'grid'
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-500'
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() =>
                  biSubView === 'income' ? setIncomeView('list') : setBillsView('list')
                }
                className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2.5 rounded text-xs ${
                  (biSubView === 'income' ? incomeView : billsView) === 'list'
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-500'
                }`}
              >
                List
              </button>
            </div>
          </div>

          {/* Unpaid bills sub-view */}
          {biSubView === 'unpaid' && (
            <div
              className={
                billsView === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
                  : 'space-y-2'
              }
            >
              {unpaidBills.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 py-8 col-span-full">
                  No unpaid bills. Add a bill or switch to Paid to see completed bills.
                </p>
              ) : (
                unpaidBills.map((r) => {
                  const status = getBillStatus(r);
                  const catColor =
                    categories.find((c) => c.name === r.category)?.color || '#6b7280';
                  const dueDateLabel = r.due_date
                    ? new Date(r.due_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '-';
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
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${status.cls}`}>
                              {status.text}
                            </span>
                            {r.recurring && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                                Recurring
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatCurrency(parseFloat(r.amount || 0))} · {r.category}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Due {dueDateLabel}
                          </p>
                          {r.website_url && (
                            <a
                              href={r.website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-sky-400 hover:text-sky-300"
                            >
                              Website
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <button
                            type="button"
                            onClick={() => markBillPaid(r.id, true)}
                            className="text-[10px] text-green-600 hover:text-green-700"
                          >
                            Mark Paid
                          </button>
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
          )}

          {/* Paid bills sub-view */}
          {biSubView === 'paid' && (
            <div
              className={
                billsView === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
                  : 'space-y-2'
              }
            >
              {paidBills.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 py-8 col-span-full">
                  No paid bills yet. Mark bills as paid in the Unpaid view.
                </p>
              ) : (
                paidBills.map((r) => {
                  const catColor =
                    categories.find((c) => c.name === r.category)?.color || '#6b7280';
                  const dueDateLabel = r.due_date
                    ? new Date(r.due_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '-';
                  const paidDateStr = paidDateMap[r.id];
                  const paidDateLabel = paidDateStr
                    ? new Date(paidDateStr).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '-';
                  return (
                    <div
                      key={r.id}
                      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 border-l-4 border-l-emerald-500 p-4"
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
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                              Paid
                            </span>
                            {r.recurring && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                                Recurring
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatCurrency(parseFloat(r.amount || 0))} · {r.category}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Due {dueDateLabel} · Paid {paidDateLabel}
                          </p>
                          {r.website_url && (
                            <a
                              href={r.website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-sky-400 hover:text-sky-300"
                            >
                              Website
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <button
                            type="button"
                            onClick={() => markBillPaid(r.id, false)}
                            className="text-[10px] text-orange-600 hover:text-orange-700"
                          >
                            Undo
                          </button>
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
          )}

          {/* Income sub-view: charts + list (placeholder, will be filled in next step) */}
          {biSubView === 'income' && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400 mb-2">
                    Income Trend (Last 7 Days)
                  </h2>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={incomeTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `$${v}`}
                          width={45}
                        />
                        <Tooltip
                          formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Income']}
                        />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          stroke="#22c55e"
                          fill="#22c55e"
                          fillOpacity={0.25}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-black dark:text-gray-400 mb-2">
                    Top Income Sources
                  </h2>
                  {incomeByCategorySorted.length > 0 ? (
                    <div className="space-y-3">
                      {incomeByCategorySorted.slice(0, 5).map((item) => {
                        const cat = categories.find((c) => c.name === item.name) || null;
                        const widthPct =
                          (incomeByCategorySorted[0]?.value || 0) > 0
                            ? Math.round(
                                (item.value / incomeByCategorySorted[0].value) * 100,
                              )
                            : 0;
                        return (
                          <div key={item.name}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: cat?.color || '#22c55e' }}
                                />
                                <span className="text-[11px] text-gray-700 dark:text-gray-200 truncate">
                                  {item.name}
                                </span>
                              </div>
                              <span className="text-[11px] font-semibold text-gray-900 dark:text-white tabular-nums">
                                {formatCurrency(item.value)}
                              </span>
                            </div>
                            <div className="mt-1 h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-400"
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400 py-6">
                      No income sources found for this month.
                    </p>
                  )}
                </div>
              </div>
              <div
                className={
                  incomeView === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
                    : 'space-y-2'
                }
              >
                {filteredIncome.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 py-8 text-center col-span-full">
                    No income entries match your filters. Add a new income transaction to track it here.
                  </p>
                ) : (
                  filteredIncome.map((tx) => {
                    const amountNumber = parseFloat(tx.amount || 0);
                    const amountLabel = formatCurrency(amountNumber);
                    const catColor =
                      categories.find((c) => c.name === tx.category)?.color || '#14b8a6';
                    const dateLabel = tx.date
                      ? new Date(tx.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '-';
                    const descriptionLabel = tx.description || 'Income';
                    if (incomeView === 'list') {
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: catColor }}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {descriptionLabel}
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                {tx.category} · {dateLabel}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300 tabular-nums">
                              {amountLabel}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditTransaction(tx)}
                                className="text-[10px] text-sky-600 hover:text-sky-700 dark:text-sky-400"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteTransaction(tx.id)}
                                className="text-[10px] text-red-600 hover:text-red-700 dark:text-red-400"
                              >
                                Del
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={tx.id}
                        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {amountLabel}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {descriptionLabel}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: catColor }}
                              />
                              <span className="text-[11px] text-gray-700 dark:text-gray-200">
                                {tx.category}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                              {dateLabel}
                            </p>
                          </div>
                          <div className="flex flex-col gap-0.5 items-end">
                            <button
                              type="button"
                              onClick={() => openEditTransaction(tx)}
                              className="text-[10px] text-sky-600 hover:text-sky-700 dark:text-sky-400"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTransaction(tx.id)}
                              className="text-[10px] text-red-600 hover:text-red-700 dark:text-red-400"
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
            </>
          )}
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
              Budget Settings
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Monthly Expense Warning (% of income)
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  step="1"
                  value={settings.monthlyExpenseWarningPercent}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      monthlyExpenseWarningPercent: Number(e.target.value) || 0,
                    }));
                    setIsDirty(true);
                  }}
                  className="w-full px-2 py-1.5 text-xs border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  When monthly expenses cross this share of income, dashboard cards will
                  highlight the overspend.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Upcoming Bill Warning (days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  value={settings.upcomingBillDaysWarning}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      upcomingBillDaysWarning: Number(e.target.value) || 0,
                    }));
                    setIsDirty(true);
                  }}
                  className="w-full px-2 py-1.5 text-xs border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Bills due within this many days will be marked as due soon.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                  Default Transaction Category
                </label>
                <select
                  value={settings.defaultTransactionCategory || (categories[0]?.name ?? '')}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      defaultTransactionCategory: e.target.value,
                    }));
                    setIsDirty(true);
                  }}
                  className="w-full px-2 py-1.5 text-xs border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Used when you add a transaction without picking a category.
                </p>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                    Currency
                  </label>
                  <select
                    value={settings.currencyCode}
                    onChange={(e) => {
                      setSettings((prev) => ({
                        ...prev,
                        currencyCode: e.target.value || 'USD',
                      }));
                      setIsDirty(true);
                    }}
                    className="w-full px-2 py-1.5 text-xs border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="JPY">JPY — Japanese Yen</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="thousand-separators"
                    type="checkbox"
                    checked={settings.useThousandSeparators}
                    onChange={(e) => {
                      setSettings((prev) => ({
                        ...prev,
                        useThousandSeparators: e.target.checked,
                      }));
                      setIsDirty(true);
                    }}
                    className="rounded"
                  />
                  <label
                    htmlFor="thousand-separators"
                    className="text-xs text-gray-700 dark:text-gray-300"
                  >
                    Show thousands separators (1,000 vs 1000)
                  </label>
                </div>
              </div>
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
