// Budget Tracker Application
// Auto-detect API base URL
const API_BASE = window.location.protocol === 'file:' 
    ? 'http://localhost:8000/api' 
    : `${window.location.origin}/api`;

let categoryChart = null;
let trendChart = null;
let categories = [];
let budgets = [];
let reminders = [];
let transactionsDataTable = null;
let billsDataTable = null;

// Initialize app
let appInitialized = false;
document.addEventListener('DOMContentLoaded', async () => {
    // Prevent multiple initializations
    if (appInitialized) return;
    appInitialized = true;
    
    try {
        // Initialize storage
        if (typeof budgetStorage !== 'undefined') {
            await budgetStorage.init();
        }
    } catch (error) {
        console.warn('IndexedDB initialization failed:', error);
    }
    
    setupNavigation();
    setupEventListeners();
    
    // Initialize world clocks
    initWorldClocks();
    
    // Show dashboard page first
    showPage('dashboard');
    
    try {
        await loadCategories();
        await loadBudgets();
        await loadReminders();
        // loadDashboard will be called by showPage('dashboard')
    } catch (error) {
        console.error('Error loading initial data:', error);
        // Continue anyway - show empty state
    }
});

// Navigation
let navigationSetup = false;
function setupNavigation() {
    if (navigationSetup) return;
    navigationSetup = true;
    
    const navLinks = document.querySelectorAll('.sidebar-item');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('href').substring(1);
            showPage(target);
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
    
    // Show dashboard by default (only on initial load)
    // The DOMContentLoaded handler will handle the initial page display
}

let currentPage = null;
function showPage(page) {
    // Prevent re-loading the same page
    if (currentPage === page) return;
    
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    const targetPage = document.getElementById(`${page}-page`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        currentPage = page;
        
        // Scroll to top to prevent scroll position issues
        window.scrollTo(0, 0);
        
        if (page === 'dashboard') {
            loadDashboard();
        } else if (page === 'bills') {
            loadBillsPage();
        } else if (page === 'settings') {
            loadSettingsPage();
        }
    }
}

// Handle Add Bill button click
function handleAddBillClick(e) {
    e.preventDefault();
    e.stopPropagation();
    
    openReminderModalForEdit(null); // null means new bill
}

// Open reminder modal for editing or adding
function openReminderModalForEdit(reminderId) {
    const modal = document.getElementById('reminder-modal');
    if (!modal) {
        console.error('Reminder modal not found');
        alert('Error: Modal not found. Please refresh the page.');
        return;
    }
    
    const form = document.getElementById('reminder-form');
    const titleInput = document.getElementById('reminder-title');
    const amountInput = document.getElementById('reminder-amount');
    const dateInput = document.getElementById('reminder-due-date');
    const categoryInput = document.getElementById('reminder-category');
    const websiteInput = document.getElementById('reminder-website');
    const recurringInput = document.getElementById('reminder-recurring');
    const recurrenceTypeInput = document.getElementById('reminder-recurrence-type');
    const editIdInput = document.getElementById('reminder-edit-id');
    const modalTitle = document.getElementById('reminder-modal-title');
    
    // Reset form
    if (form) form.reset();
    
    if (reminderId) {
        // Edit mode - load existing reminder data
        const reminder = reminders.find(r => r.id === reminderId);
        if (!reminder) {
            alert('Reminder not found');
            return;
        }
        
        // Populate form with existing data
        if (titleInput) titleInput.value = reminder.title || '';
        if (amountInput) amountInput.value = reminder.amount || '';
        if (categoryInput) categoryInput.value = reminder.category || '';
        if (websiteInput) websiteInput.value = reminder.website_url || '';
        if (recurringInput) recurringInput.checked = reminder.recurring || false;
        if (recurrenceTypeInput) recurrenceTypeInput.value = reminder.recurrence_type || 'monthly';
        if (editIdInput) editIdInput.value = reminder.id;
        if (modalTitle) modalTitle.textContent = 'Edit Bill Reminder';
        
        // Format date for display
        if (dateInput && reminder.due_date) {
            const dueDate = new Date(reminder.due_date);
            dateInput.value = dueDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        }
        
        // Show recurrence type selector if recurring
        const recurrenceContainer = document.getElementById('recurrence-type-container');
        if (recurrenceContainer) {
            recurrenceContainer.classList.toggle('hidden', !reminder.recurring);
        }
    } else {
        // Add mode - set defaults
        const today = new Date();
        const formattedDate = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        
        if (dateInput) dateInput.value = formattedDate;
        if (websiteInput) websiteInput.value = '';
        if (editIdInput) editIdInput.value = '';
        if (modalTitle) modalTitle.textContent = 'Add Bill Reminder';
        
        // Hide recurrence type selector
        const recurrenceContainer = document.getElementById('recurrence-type-container');
        if (recurrenceContainer) {
            recurrenceContainer.classList.add('hidden');
        }
    }
    
    // Remove hidden class and show modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';
    
    // Show backdrop
    const backdrop = modal.querySelector('.hs-overlay-backdrop');
    if (backdrop) {
        backdrop.style.display = 'block';
        backdrop.style.pointerEvents = 'auto';
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            backdrop.classList.add('opacity-50');
        }, 10);
    }
    
    // Show modal content
    const modalContent = modal.querySelector('.pointer-events-auto') || modal.children[1];
    if (modalContent) {
        modalContent.style.pointerEvents = 'auto';
        setTimeout(() => {
            modalContent.style.opacity = '1';
            modalContent.style.transform = 'translateY(0)';
            modalContent.style.marginTop = '1.75rem';
        }, 50);
    }
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Initialize datepicker after modal opens
    setTimeout(() => {
        reminderDatepickerInitialized = false; // Reset flag to re-initialize
        initializeReminderDatepicker();
    }, 300);
}

// Edit reminder function
async function editReminder(id) {
    openReminderModalForEdit(id);
}

// Event Listeners
function setupEventListeners() {
    // Add Bill - Ensure modal opens and initializes datepicker
    const addBillBtn = document.getElementById('add-bill-btn');
    if (addBillBtn) {
        addBillBtn.addEventListener('click', handleAddBillClick);
        console.log('Add Bill button event listener attached'); // Debug log
    } else {
        console.warn('Add Bill button not found during setup');
    }
    
    document.getElementById('save-transaction-btn')?.addEventListener('click', async () => {
        await saveTransaction();
    });
    
    // Add Category
    document.getElementById('add-category-btn')?.addEventListener('click', () => {
        openCategoryModal();
    });
    
    document.getElementById('save-category-btn')?.addEventListener('click', async () => {
        await saveCategory();
    });
    
    // Close category modal buttons
    document.getElementById('close-category-modal-btn')?.addEventListener('click', closeCategoryModal);
    document.getElementById('cancel-category-modal-btn')?.addEventListener('click', closeCategoryModal);
    
    // Close category modal when clicking backdrop
    const categoryModal = document.getElementById('category-modal');
    if (categoryModal) {
        const backdrop = categoryModal.querySelector('.hs-overlay-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', closeCategoryModal);
        }
    }
    
    // Add Reminder
    document.getElementById('add-reminder-btn')?.addEventListener('click', () => {
        openReminderModalForEdit(null);
    });
    
    document.getElementById('save-reminder-btn')?.addEventListener('click', async () => {
        await saveReminder();
    });
    
    // Recurring reminder toggle
    document.getElementById('reminder-recurring')?.addEventListener('change', (e) => {
        const container = document.getElementById('recurrence-type-container');
        if (container) {
            container.classList.toggle('hidden', !e.target.checked);
        }
    });
    
    // Close bill details modal
    document.getElementById('close-bill-details-modal')?.addEventListener('click', closeBillDetailsModal);
    
    // Close bill details modal when clicking backdrop
    const billDetailsModal = document.getElementById('bill-details-modal');
    if (billDetailsModal) {
        const backdrop = billDetailsModal.querySelector('.hs-overlay-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', closeBillDetailsModal);
        }
    }
    
    // Removed filter event listeners - Budget page has been removed
    
    // Close reminder modal buttons
    document.getElementById('close-reminder-modal-btn')?.addEventListener('click', () => {
        closeReminderModal();
    });
    
    document.getElementById('cancel-reminder-modal-btn')?.addEventListener('click', () => {
        closeReminderModal();
    });
    
    // Close modal when clicking backdrop
    document.getElementById('reminder-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'reminder-modal' || e.target.classList.contains('hs-overlay-backdrop')) {
            closeReminderModal();
        }
    });
    
    // Clear Storage
    document.getElementById('clear-storage-btn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            await budgetStorage.clearAllData();
            await loadCategories();
            await loadBudgets();
            await loadReminders();
            await loadDashboard();
            alert('All data cleared successfully');
        }
    });
    
    // Set default date to today (formatted as MM/DD/YYYY)
    const today = new Date();
    const formattedToday = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    document.getElementById('transaction-date')?.setAttribute('value', formattedToday);
    document.getElementById('reminder-due-date')?.setAttribute('value', formattedToday);
}

// Categories
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE}/categories`);
        categories = await response.json();
        populateCategoryDropdowns();
        renderCategories();
    } catch (error) {
        console.error('Error loading categories:', error);
        // Fallback to default categories
        categories = [
            { id: 1, name: 'Food & Dining', color: '#3b82f6' },
            { id: 2, name: 'Transportation', color: '#ef4444' },
            { id: 3, name: 'Shopping', color: '#10b981' },
            { id: 4, name: 'Bills & Utilities', color: '#f59e0b' },
            { id: 5, name: 'Entertainment', color: '#8b5cf6' },
            { id: 6, name: 'Healthcare', color: '#ec4899' },
            { id: 7, name: 'Housing', color: '#6366f1' },
            { id: 8, name: 'Salary', color: '#14b8a6' },
            { id: 9, name: 'Investment', color: '#06b6d4' }
        ];
        populateCategoryDropdowns();
        renderCategories();
    }
}

function populateCategoryDropdowns() {
    const dropdowns = ['transaction-category', 'reminder-category', 'filter-category'];
    dropdowns.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        
        // Keep "All Categories" option if it exists
        const allOption = dropdown.querySelector('option[value="all"]');
        dropdown.innerHTML = allOption ? allOption.outerHTML : '';
        
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.name;
            option.textContent = cat.name;
            dropdown.appendChild(option);
        });
    });
}

function renderCategories() {
    const container = document.getElementById('categories-list');
    if (!container) return;
    
    container.innerHTML = categories.map(cat => `
        <div class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
            <div class="w-4 h-4 rounded-full" style="background-color: ${cat.color}"></div>
            <span class="text-sm font-medium text-gray-700">${cat.name}</span>
        </div>
    `).join('');
}

async function saveCategory() {
    const name = document.getElementById('category-name').value;
    const color = document.getElementById('category-color').value;
    
    if (!name) {
        alert('Please enter a category name');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });
        
        if (response.ok) {
            await loadCategories();
            closeCategoryModal();
            const form = document.getElementById('category-form');
            if (form) {
                form.reset();
            }
        }
    } catch (error) {
        console.error('Error saving category:', error);
        alert('Error saving category');
    }
}

function openCategoryModal() {
    const modal = document.getElementById('category-modal');
    const form = document.getElementById('category-form');
    
    if (!modal) {
        console.error('Category modal not found');
        return;
    }
    
    if (form) {
        form.reset();
    }
    
    // Show modal with backdrop
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';
    
    const backdrop = modal.querySelector('.hs-overlay-backdrop');
    if (backdrop) {
        backdrop.style.display = 'block';
        backdrop.style.pointerEvents = 'auto';
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            backdrop.classList.add('opacity-50');
        }, 10);
    }
    
    const modalContent = modal.querySelector('.pointer-events-auto');
    if (modalContent) {
        modalContent.style.pointerEvents = 'auto';
        setTimeout(() => {
            modalContent.style.opacity = '1';
            modalContent.style.transform = 'translateY(0)';
            modalContent.style.marginTop = '1.75rem';
        }, 50);
    }
    
    document.body.style.overflow = 'hidden';
}

function closeCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        
        const backdrop = modal.querySelector('.hs-overlay-backdrop');
        if (backdrop) {
            backdrop.classList.add('opacity-0');
            backdrop.classList.remove('opacity-50');
            backdrop.style.display = 'none';
        }
        
        document.body.style.overflow = '';
    }
}

// Budget/Transactions
async function loadBudgets() {
    try {
        const response = await fetch(`${API_BASE}/budget`);
        budgets = await response.json();
        renderTransactions();
    } catch (error) {
        console.error('Error loading budgets:', error);
        budgets = [];
        renderTransactions();
    }
}

function renderTransactions(filteredBudgets = null) {
    const table = document.getElementById('transactions-datatable');
    if (!table) return;
    
    const data = filteredBudgets || budgets;
    
    // Destroy existing DataTable if it exists
    if (transactionsDataTable) {
        transactionsDataTable.destroy();
        transactionsDataTable = null;
    }
    
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No transactions found</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(budget => {
        const date = new Date(budget.date).toLocaleDateString();
        const amount = parseFloat(budget.amount || 0).toFixed(2);
        const typeClass = budget.type === 'income' ? 'text-green-600' : 'text-red-600';
        const sign = budget.type === 'income' ? '+' : '-';
        
        return `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${date}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${budget.description || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${budget.category}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span class="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium ${budget.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${budget.type === 'income' ? 'Income' : 'Expense'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right ${typeClass}">
                    ${sign}$${amount}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <button onclick="deleteTransaction(${budget.id})" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Initialize DataTable
    if (typeof $.fn.DataTable !== 'undefined') {
        transactionsDataTable = $('#transactions-datatable').DataTable({
            order: [[0, 'desc']], // Sort by date descending
            pageLength: 10,
            language: {
                search: "Search:",
                lengthMenu: "Show _MENU_ entries",
                info: "Showing _START_ to _END_ of _TOTAL_ entries",
                paginate: {
                    first: "First",
                    last: "Last",
                    next: "Next",
                    previous: "Previous"
                }
            }
        });
    }
}

async function saveTransaction() {
    const type = document.getElementById('transaction-type').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const category = document.getElementById('transaction-category').value;
    const description = document.getElementById('transaction-description').value;
    const dateStr = document.getElementById('transaction-date').value;
    
    // Convert date string (MM/DD/YYYY) to ISO format (YYYY-MM-DD)
    let date = dateStr;
    if (dateStr.includes('/')) {
        const [month, day, year] = dateStr.split('/');
        date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/budget`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, amount, category, description, date })
        });
        
        if (response.ok) {
            await loadBudgets();
            await loadDashboard();
            if (window.HSOverlay) {
                window.HSOverlay.close('#transaction-modal');
            } else {
                document.getElementById('transaction-modal').classList.add('hidden');
            }
            document.getElementById('transaction-form').reset();
            const today = new Date();
            document.getElementById('transaction-date').value = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        }
    } catch (error) {
        console.error('Error saving transaction:', error);
        alert('Error saving transaction');
    }
}

async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/budget/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadBudgets();
            await loadDashboard();
        }
    } catch (error) {
        console.error('Error deleting transaction:', error);
        alert('Error deleting transaction');
    }
}

function filterTransactions() {
    const type = document.getElementById('filter-type')?.value || 'all';
    const category = document.getElementById('filter-category')?.value || 'all';
    const fromDate = document.getElementById('filter-from-date')?.value || '';
    const toDate = document.getElementById('filter-to-date')?.value || '';
    
    let filtered = [...budgets];
    
    if (type !== 'all') {
        filtered = filtered.filter(b => b.type === type);
    }
    
    if (category !== 'all') {
        filtered = filtered.filter(b => b.category === category);
    }
    
    if (fromDate) {
        filtered = filtered.filter(b => b.date >= fromDate);
    }
    
    if (toDate) {
        filtered = filtered.filter(b => b.date <= toDate);
    }
    
    renderTransactions(filtered);
    
    // If DataTable exists, apply custom filter
    if (transactionsDataTable) {
        // Clear existing filters
        transactionsDataTable.search('').draw();
        
        // Apply custom filter logic (DataTable will handle the display)
        // The filtered data is already rendered in the table
        transactionsDataTable.draw();
    }
}

function openTransactionModal() {
    document.getElementById('transaction-form').reset();
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    document.getElementById('transaction-date').value = formattedDate;
    initializeTransactionDatepicker();
    
    // Use Preline HSOverlay
    if (window.HSOverlay) {
        window.HSOverlay.open('#transaction-modal');
    } else {
        const modal = document.getElementById('transaction-modal');
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.add('hs-overlay-open:opacity-100');
        }, 10);
    }
}

function initializeTransactionDatepicker() {
    const input = document.getElementById('transaction-date');
    const wrapper = document.getElementById('transaction-datepicker-wrapper');
    const picker = document.getElementById('transaction-datepicker');
    const btn = document.getElementById('transaction-datepicker-btn');
    
    if (!input || !picker) return;
    
    // Clear previous picker
    picker.innerHTML = '';
    
    const today = new Date();
    let currentMonth = today.getMonth();
    let currentYear = today.getFullYear();
    let selectedDate = today;
    
    function renderCalendar() {
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        let html = `
            <div class="w-80">
                <div class="flex items-center justify-between mb-4">
                    <button type="button" class="datepicker-prev p-2 hover:bg-gray-100 rounded">‹</button>
                    <span class="font-semibold">${new Date(currentYear, currentMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                    <button type="button" class="datepicker-next p-2 hover:bg-gray-100 rounded">›</button>
                </div>
                <div class="grid grid-cols-7 gap-1 mb-2">
                    ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<div class="text-center text-xs font-medium text-gray-500 py-1">${day}</div>`).join('')}
                </div>
                <div class="grid grid-cols-7 gap-1">
                    ${Array(firstDay).fill(null).map(() => '<div></div>').join('')}
                    ${Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const date = new Date(currentYear, currentMonth, day);
                        const isToday = date.toDateString() === new Date().toDateString();
                        const isSelected = date.toDateString() === selectedDate.toDateString();
                        return `<button type="button" class="datepicker-day p-2 text-sm rounded hover:bg-blue-50 ${isToday ? 'bg-blue-100' : ''} ${isSelected ? 'bg-blue-600 text-white' : ''}" data-day="${day}">${day}</button>`;
                    }).join('')}
                </div>
            </div>
        `;
        
        picker.innerHTML = html;
        
        // Event listeners
        picker.querySelector('.datepicker-prev')?.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar();
        });
        
        picker.querySelector('.datepicker-next')?.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar();
        });
        
        picker.querySelectorAll('.datepicker-day').forEach(btn => {
            btn.addEventListener('click', () => {
                const day = parseInt(btn.dataset.day);
                selectedDate = new Date(currentYear, currentMonth, day);
                const formatted = selectedDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                input.value = formatted;
                picker.classList.add('hidden');
            });
        });
    }
    
    renderCalendar();
    
    // Toggle picker
    const togglePicker = () => {
        picker.classList.toggle('hidden');
    };
    
    input.addEventListener('click', togglePicker);
    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePicker();
    });
    
    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            picker.classList.add('hidden');
        }
    });
}


function loadBillsPage() {
    renderBillsTable();
    
    // Ensure Add Bill button has event listener when bills page loads
    setTimeout(() => {
        const addBillBtn = document.getElementById('add-bill-btn');
        if (addBillBtn) {
            // Check if listener already exists
            const hasListener = addBillBtn.getAttribute('data-listener-attached');
            if (!hasListener) {
                addBillBtn.addEventListener('click', handleAddBillClick);
                addBillBtn.setAttribute('data-listener-attached', 'true');
                console.log('Add Bill button event listener attached on bills page load');
            }
        } else {
            console.warn('Add Bill button not found on bills page');
        }
    }, 100);
}

function renderBillsTable() {
    const table = document.getElementById('bills-datatable');
    if (!table) return;
    
    // Destroy existing DataTable if it exists
    if (billsDataTable) {
        billsDataTable.destroy();
        billsDataTable = null;
    }
    
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    // Sort reminders by due date
    const sortedReminders = [...reminders].sort((a, b) => {
        const dateA = new Date(a.due_date);
        const dateB = new Date(b.due_date);
        return dateA - dateB;
    });
    
    if (sortedReminders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-4 text-center text-gray-500">No bills found</td></tr>';
        return;
    }
    
    tbody.innerHTML = sortedReminders.map(reminder => {
        const dueDate = new Date(reminder.due_date);
        const daysUntil = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
        const isOverdue = daysUntil < 0 && !reminder.is_paid;
        const isToday = daysUntil === 0 && !reminder.is_paid;
        const statusClass = reminder.is_paid ? 'bg-green-100 text-green-800' : isOverdue ? 'bg-red-100 text-red-800' : isToday ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800';
        const statusText = reminder.is_paid ? 'Paid' : isOverdue ? 'Overdue' : isToday ? 'Due Today' : daysUntil > 0 ? `${daysUntil} days left` : 'Past Due';
        
        return `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${reminder.title}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">$${parseFloat(reminder.amount || 0).toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${reminder.category}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span class="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${reminder.recurring ? `<span class="inline-flex items-center gap-x-1.5 py-1 px-2 rounded-full text-xs font-medium bg-blue-100 text-blue-800">${reminder.recurrence_type || 'monthly'}</span>` : 'One-time'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <div class="flex items-center justify-center">
                        ${reminder.attachment_url ? `
                            <a href="${reminder.attachment_url}" target="_blank" class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900" title="View Attachment">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                </svg>
                                View
                            </a>
                        ` : `
                            <input type="file" 
                                   id="file-upload-${reminder.id}" 
                                   accept="image/png" 
                                   class="hidden" 
                                   onchange="handleFileUpload(${reminder.id}, this.files[0])">
                            <button type="button" 
                                    onclick="document.getElementById('file-upload-${reminder.id}').click()" 
                                    class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                </svg>
                                Upload PNG
                            </button>
                        `}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <div class="flex items-center justify-center gap-2">
                        ${reminder.website_url ? `<a href="${reminder.website_url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1" title="Visit Website">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
                            </svg>
                            Link
                        </a>` : ''}
                        <button onclick="editReminder(${reminder.id})" class="text-blue-600 hover:text-blue-900" title="Edit Bill">Edit</button>
                        ${!reminder.is_paid ? `<button onclick="markReminderPaid(${reminder.id})" class="text-green-600 hover:text-green-900">Mark Paid</button>` : ''}
                        <button onclick="deleteReminder(${reminder.id})" class="text-red-600 hover:text-red-900">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    // Initialize DataTable
    if (typeof $.fn.DataTable !== 'undefined') {
        billsDataTable = $('#bills-datatable').DataTable({
            order: [[2, 'asc']], // Sort by due date ascending
            pageLength: 10,
            language: {
                search: "Search bills:",
                lengthMenu: "Show _MENU_ bills",
                info: "Showing _START_ to _END_ of _TOTAL_ bills",
                paginate: {
                    first: "First",
                    last: "Last",
                    next: "Next",
                    previous: "Previous"
                }
            }
        });
    }
}

// Reminders
async function loadReminders() {
    try {
        const response = await fetch(`${API_BASE}/reminders`);
        reminders = await response.json();
        renderReminders();
    } catch (error) {
        console.error('Error loading reminders:', error);
        reminders = [];
        renderReminders();
    }
}

function renderReminders() {
    const container = document.getElementById('reminders-list');
    if (!container) return;
    
    if (reminders.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No reminders yet. Add one to get started!</p>';
        return;
    }
    
    container.innerHTML = reminders.map(reminder => {
        const dueDate = new Date(reminder.due_date).toLocaleDateString();
        const isOverdue = new Date(reminder.due_date) < new Date() && !reminder.is_paid;
        const statusClass = reminder.is_paid ? 'bg-green-100 text-green-800' : isOverdue ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800';
        const statusText = reminder.is_paid ? 'Paid' : isOverdue ? 'Overdue' : 'Pending';
        
        return `
            <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                        <h3 class="font-semibold text-gray-800">${reminder.title}</h3>
                        <span class="inline-flex items-center gap-x-1.5 py-1 px-2 rounded-full text-xs font-medium ${statusClass}">
                            ${statusText}
                        </span>
                        ${reminder.recurring ? '<span class="text-xs text-gray-500">Recurring</span>' : ''}
                    </div>
                    <p class="text-sm text-gray-600">Amount: $${parseFloat(reminder.amount || 0).toFixed(2)}</p>
                    <p class="text-sm text-gray-600">Due: ${dueDate}</p>
                    <p class="text-sm text-gray-600">Category: ${reminder.category}</p>
                </div>
                <div class="flex gap-2">
                    ${!reminder.is_paid ? `
                        <button onclick="markReminderPaid(${reminder.id})" class="py-1 px-3 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Mark Paid</button>
                    ` : ''}
                    <button onclick="deleteReminder(${reminder.id})" class="py-1 px-3 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function saveReminder() {
    const title = document.getElementById('reminder-title').value;
    const amount = parseFloat(document.getElementById('reminder-amount').value);
    const dueDateStr = document.getElementById('reminder-due-date').value;
    const category = document.getElementById('reminder-category').value;
    const websiteUrl = document.getElementById('reminder-website').value;
    const recurring = document.getElementById('reminder-recurring').checked;
    const recurrenceType = document.getElementById('reminder-recurrence-type').value;
    const editId = document.getElementById('reminder-edit-id').value;
    
    // Convert date string (MM/DD/YYYY) to ISO format (YYYY-MM-DD)
    let dueDate = dueDateStr;
    if (dueDateStr.includes('/')) {
        const [month, day, year] = dueDateStr.split('/');
        dueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    if (!title || !amount || !dueDate) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        const url = editId 
            ? `${API_BASE}/reminders/${editId}` 
            : `${API_BASE}/reminders`;
        const method = editId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, amount, due_date: dueDate, category, website_url: websiteUrl, recurring, recurrence_type: recurrenceType })
        });
        
        if (response.ok) {
            await loadReminders();
            await loadDashboard();
            // Reload bills page if currently viewing it
            if (currentPage === 'bills') {
                renderBillsTable();
            }
            closeReminderModal();
            
            // Clear edit ID
            const editIdInput = document.getElementById('reminder-edit-id');
            if (editIdInput) editIdInput.value = '';
        }
    } catch (error) {
        console.error('Error saving reminder:', error);
        alert('Error saving reminder');
    }
}

async function markReminderPaid(id) {
    try {
        const response = await fetch(`${API_BASE}/reminders/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_paid: true })
        });
        
        if (response.ok) {
            await loadReminders();
            await loadDashboard();
            // Reload bills page if currently viewing it
            if (currentPage === 'bills') {
                renderBillsTable();
            }
        }
    } catch (error) {
        console.error('Error updating reminder:', error);
        alert('Error updating reminder');
    }
}

async function deleteReminder(id) {
    if (!confirm('Are you sure you want to delete this reminder?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/reminders/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadReminders();
            await loadDashboard();
            // Reload bills page if currently viewing it
            if (currentPage === 'bills') {
                renderBillsTable();
            }
        }
    } catch (error) {
        console.error('Error deleting reminder:', error);
        alert('Error deleting reminder');
    }
}

function closeReminderModal() {
    const modal = document.getElementById('reminder-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('hs-overlay-open:opacity-100');
        modal.style.display = 'none';
        
        // Hide backdrop
        const backdrop = modal.querySelector('.hs-overlay-backdrop');
        if (backdrop) {
            backdrop.classList.add('opacity-0');
            backdrop.classList.remove('opacity-50');
            backdrop.style.display = 'none';
        }
        
        // Clear edit ID and reset form
        const editIdInput = document.getElementById('reminder-edit-id');
        if (editIdInput) editIdInput.value = '';
        
        const modalTitle = document.getElementById('reminder-modal-title');
        if (modalTitle) modalTitle.textContent = 'Add Bill Reminder';
        
        // Restore body scroll
        document.body.style.overflow = '';
    }
}

// Set up reminder modal event listener after Preline loads
setTimeout(() => {
    const reminderModal = document.getElementById('reminder-modal');
    if (reminderModal) {
        // Listen for Preline overlay open event
        reminderModal.addEventListener('opened.hs.overlay', () => {
            const today = new Date();
            const formattedDate = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            document.getElementById('reminder-due-date').value = formattedDate;
            setTimeout(() => {
                initializeReminderDatepicker();
            }, 100);
        });
    }
}, 500);

let reminderDatepickerInitialized = false;
function initializeReminderDatepicker() {
    const input = document.getElementById('reminder-due-date');
    const wrapper = document.getElementById('reminder-datepicker-wrapper');
    const picker = document.getElementById('reminder-datepicker');
    const btn = document.getElementById('reminder-datepicker-btn');
    
    if (!input || !picker || !wrapper) {
        console.error('Datepicker elements not found');
        return;
    }
    
    // Prevent multiple initializations
    if (reminderDatepickerInitialized) {
        // Just update the calendar if already initialized
        return;
    }
    reminderDatepickerInitialized = true;
    
    // Clear previous picker
    picker.innerHTML = '';
    
    // Get initial date from input or use today
    let currentDate = new Date();
    const inputValue = input.value;
    if (inputValue && inputValue.includes('/')) {
        const [month, day, year] = inputValue.split('/');
        const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(parsedDate.getTime())) {
            currentDate = parsedDate;
        }
    }
    
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();
    let selectedDate = currentDate;
    
    // Define renderCalendar function that can be called from togglePicker
    const renderCalendar = (targetPicker = picker) => {
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const today = new Date();
        
        let html = `
            <div class="w-full">
                <div class="flex items-center justify-between mb-4 px-2">
                    <button type="button" class="datepicker-prev p-2 hover:bg-gray-100 rounded-lg cursor-pointer" aria-label="Previous month">‹</button>
                    <span class="font-semibold text-gray-800">${new Date(currentYear, currentMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                    <button type="button" class="datepicker-next p-2 hover:bg-gray-100 rounded-lg cursor-pointer" aria-label="Next month">›</button>
                </div>
                <div class="grid grid-cols-7 gap-1 mb-2">
                    ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<div class="text-center text-xs font-medium text-gray-500 py-1">${day}</div>`).join('')}
                </div>
                <div class="grid grid-cols-7 gap-1">
                    ${Array(firstDay).fill(null).map(() => '<div class="p-2"></div>').join('')}
                    ${Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const date = new Date(currentYear, currentMonth, day);
                        const isToday = date.toDateString() === today.toDateString();
                        const isSelected = date.toDateString() === selectedDate.toDateString();
                        return `<button type="button" class="datepicker-day p-2 text-sm rounded-lg hover:bg-blue-50 hover:text-blue-700 cursor-pointer ${isToday ? 'bg-blue-100 font-semibold' : ''} ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-700'}" data-day="${day}" data-year="${currentYear}" data-month="${currentMonth}">${day}</button>`;
                    }).join('')}
                </div>
            </div>
        `;
        
        targetPicker.innerHTML = html;
    }
    
    // Store current input value before cloning
    const currentInputValue = input.value;
    
    // Remove existing listeners by cloning wrapper
    const newWrapper = wrapper.cloneNode(true);
    wrapper.parentNode.replaceChild(newWrapper, wrapper);
    
    // Get fresh references
    const newInput = document.getElementById('reminder-due-date');
    const newPicker = document.getElementById('reminder-datepicker');
    const newBtn = document.getElementById('reminder-datepicker-btn');
    const newWrapperRef = document.getElementById('reminder-datepicker-wrapper');
    
    // Restore input value
    if (newInput && currentInputValue) {
        newInput.value = currentInputValue;
    }
    
    // Use event delegation - attach listener to the picker element once
    // This way it will work even after re-rendering the calendar HTML
    if (newPicker) {
        newPicker.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Handle previous month button
            if (e.target.classList.contains('datepicker-prev') || e.target.closest('.datepicker-prev')) {
                e.preventDefault();
                currentMonth--;
                if (currentMonth < 0) {
                    currentMonth = 11;
                    currentYear--;
                }
                renderCalendar(newPicker);
                return;
            }
            
            // Handle next month button
            if (e.target.classList.contains('datepicker-next') || e.target.closest('.datepicker-next')) {
                e.preventDefault();
                currentMonth++;
                if (currentMonth > 11) {
                    currentMonth = 0;
                    currentYear++;
                }
                renderCalendar(newPicker);
                return;
            }
            
            // Handle day selection
            const dayBtn = e.target.closest('.datepicker-day');
            if (dayBtn) {
                e.preventDefault();
                
                const day = parseInt(dayBtn.dataset.day);
                const month = parseInt(dayBtn.dataset.month);
                const year = parseInt(dayBtn.dataset.year);
                
                selectedDate = new Date(year, month, day);
                const formatted = selectedDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                
                if (newInput) {
                    newInput.value = formatted;
                }
                newPicker.classList.add('hidden');
                
                console.log('Date selected:', formatted); // Debug
            }
        });
    }
    
    // Initial render with the new picker element after cloning
    if (newPicker) {
        renderCalendar(newPicker);
    }
    
    // Toggle picker function
    const togglePicker = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if (!newPicker) return;
        
        const isHidden = newPicker.classList.contains('hidden');
        if (isHidden) {
            // Update calendar to show current input date
            if (newInput && newInput.value) {
                const inputVal = newInput.value;
                if (inputVal.includes('/')) {
                    const [month, day, year] = inputVal.split('/');
                    const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                    if (!isNaN(parsedDate.getTime())) {
                        currentMonth = parsedDate.getMonth();
                        currentYear = parsedDate.getFullYear();
                        selectedDate = parsedDate;
                        renderCalendar(newPicker);
                    }
                }
            }
            
            newPicker.classList.remove('hidden');
            newPicker.style.display = 'block';
            newPicker.style.zIndex = '100';
        } else {
            newPicker.classList.add('hidden');
            newPicker.style.display = 'none';
        }
    };
    
    // Attach click handlers
    if (newInput) {
        newInput.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePicker(e);
        });
        newInput.addEventListener('focus', (e) => {
            e.preventDefault();
            togglePicker(e);
        });
    }
    
    if (newBtn) {
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePicker(e);
        });
    }
    
    // Close when clicking outside
    const closeOnOutsideClick = (e) => {
        if (newWrapperRef && !newWrapperRef.contains(e.target) && !newPicker.classList.contains('hidden')) {
            newPicker.classList.add('hidden');
            newPicker.style.display = 'none';
        }
    };
    
    document.addEventListener('click', closeOnOutsideClick);
    
    // Prevent modal from closing when clicking datepicker
    if (newPicker) {
        newPicker.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
}

// Dashboard
let dashboardLoading = false;
async function loadDashboard() {
    // Prevent multiple simultaneous calls
    if (dashboardLoading) return;
    
    // Check if dashboard page is visible
    const dashboardPage = document.getElementById('dashboard-page');
    if (!dashboardPage || dashboardPage.classList.contains('hidden')) {
        return;
    }
    
    dashboardLoading = true;
    try {
        const response = await fetch(`${API_BASE}/dashboard/stats`);
        const stats = await response.json();
        
        // Update stats cards
        const totalBalanceEl = document.getElementById('total-balance');
        const monthIncomeEl = document.getElementById('month-income');
        const monthExpensesEl = document.getElementById('month-expenses');
        const upcomingBillsEl = document.getElementById('upcoming-bills-count');
        
        if (totalBalanceEl) totalBalanceEl.textContent = `$${stats.balance.toFixed(2)}`;
        if (monthIncomeEl) monthIncomeEl.textContent = `$${stats.month_income.toFixed(2)}`;
        
        // Update Monthly Expenses - ensure it displays correctly
        if (monthExpensesEl) {
            const monthlyExpenses = parseFloat(stats.month_expenses || 0);
            monthExpensesEl.textContent = `$${monthlyExpenses.toFixed(2)}`;
        }
        
        if (upcomingBillsEl) upcomingBillsEl.textContent = stats.upcoming_reminders.length;
        
        // Update category chart
        updateCategoryChart(stats.category_expenses);
        
        // Update expense trends chart
        renderExpenseTrends(stats.expense_trends || []);
        
        // Update upcoming reminders - ensure data is valid
        renderUpcomingReminders(stats.upcoming_reminders || []);
    } catch (error) {
        console.error('Error loading dashboard:', error);
    } finally {
        dashboardLoading = false;
    }
}

function updateCategoryChart(categoryExpenses) {
    const ctx = document.getElementById('category-chart');
    if (!ctx) return;
    
    const labels = Object.keys(categoryExpenses);
    const data = Object.values(categoryExpenses);
    
    // Return early if no data
    if (labels.length === 0 || data.every(d => d === 0)) {
        if (categoryChart) {
            categoryChart.destroy();
            categoryChart = null;
        }
        return;
    }
    
    const colors = labels.map(label => {
        const cat = categories.find(c => c.name === label);
        return cat ? cat.color : '#6b7280';
    });
    
    if (categoryChart) {
        categoryChart.destroy();
        categoryChart = null;
    }
    
        // Use requestAnimationFrame to prevent layout thrashing
        requestAnimationFrame(() => {
            if (!ctx) return; // Check again in case element was removed
            
            // Check if parent container exists
            const parent = ctx.closest('.bg-white');
            if (!parent || parent.classList.contains('hidden')) return;
            
            categoryChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 1.5,
                    animation: {
                        duration: 0 // Disable animation to prevent scroll issues
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            display: true
                        }
                    },
                    resizeDelay: 200,
                    onResize: null // Disable resize handler
                }
            });
        });
}

function renderExpenseTrends(trends) {
    const container = document.getElementById('trend-chart');
    if (!container) return;
    
    // Destroy existing chart if it exists
    if (trendChart) {
        trendChart.destroy();
        trendChart = null;
    }
    
    if (!trends || trends.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-12">No expense data available</p>';
        return;
    }
    
    // Format data for ApexCharts
    const categories = trends.map(t => {
        const date = new Date(t.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const data = trends.map(t => parseFloat(t.amount || 0));
    
    // Check if buildChart function is available from Preline helpers
    if (typeof buildChart === 'function') {
        trendChart = buildChart('#trend-chart', (mode) => ({
            chart: {
                height: 300,
                type: 'area',
                toolbar: { show: false },
                zoom: { enabled: false }
            },
            series: [{
                name: 'Expenses',
                data: data
            }],
            legend: { show: false },
            dataLabels: { enabled: false },
            stroke: {
                curve: 'smooth',
                width: 2,
                colors: ['#3b82f6']
            },
            fill: {
                type: 'gradient',
                gradient: {
                    type: 'vertical',
                    shadeIntensity: 1,
                    opacityFrom: 0.3,
                    opacityTo: 0.05,
                    colorStops: [
                        { offset: 0, color: '#3b82f6', opacity: 0.3 },
                        { offset: 100, color: '#3b82f6', opacity: 0.05 }
                    ]
                }
            },
            grid: {
                strokeDashArray: 3,
                borderColor: '#e5e7eb'
            },
            xaxis: {
                type: 'category',
                categories: categories,
                axisBorder: { show: false },
                axisTicks: { show: false },
                labels: {
                    style: {
                        colors: '#9ca3af',
                        fontSize: '12px',
                        fontFamily: 'Inter, ui-sans-serif',
                        fontWeight: 400
                    }
                }
            },
            yaxis: {
                labels: {
                    style: {
                        colors: '#9ca3af',
                        fontSize: '12px',
                        fontFamily: 'Inter, ui-sans-serif',
                        fontWeight: 400
                    },
                    formatter: (value) => `$${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}`
                }
            },
            tooltip: {
                theme: mode === 'dark' ? 'dark' : 'light',
                y: {
                    formatter: (value) => `$${parseFloat(value).toFixed(2)}`
                }
            },
            colors: ['#3b82f6']
        }), 
        // Light mode
        {
            colors: ['#3b82f6'],
            grid: { borderColor: '#e5e7eb' },
            xaxis: { labels: { style: { colors: '#9ca3af' } } },
            yaxis: { labels: { style: { colors: '#9ca3af' } } }
        },
        // Dark mode
        {
            colors: ['#3b82f6'],
            grid: { borderColor: '#404040' },
            xaxis: { labels: { style: { colors: '#a3a3a3' } } },
            yaxis: { labels: { style: { colors: '#a3a3a3' } } }
        });
    } else if (typeof ApexCharts !== 'undefined') {
        // Fallback to direct ApexCharts if helper not available
        const options = {
            chart: {
                height: 300,
                type: 'area',
                toolbar: { show: false },
                zoom: { enabled: false }
            },
            series: [{
                name: 'Expenses',
                data: data
            }],
            legend: { show: false },
            dataLabels: { enabled: false },
            stroke: {
                curve: 'smooth',
                width: 2,
                colors: ['#3b82f6']
            },
            fill: {
                type: 'gradient',
                gradient: {
                    type: 'vertical',
                    shadeIntensity: 1,
                    opacityFrom: 0.3,
                    opacityTo: 0.05
                }
            },
            grid: {
                strokeDashArray: 3,
                borderColor: '#e5e7eb'
            },
            xaxis: {
                categories: categories,
                labels: {
                    style: {
                        colors: '#9ca3af',
                        fontSize: '12px'
                    }
                }
            },
            yaxis: {
                labels: {
                    style: {
                        colors: '#9ca3af',
                        fontSize: '12px'
                    },
                    formatter: (value) => `$${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}`
                }
            },
            tooltip: {
                y: {
                    formatter: (value) => `$${parseFloat(value).toFixed(2)}`
                }
            },
            colors: ['#3b82f6']
        };
        
        trendChart = new ApexCharts(container, options);
        trendChart.render();
    } else {
        container.innerHTML = '<p class="text-gray-500 text-center py-12">Chart library not loaded</p>';
    }
}

function renderRecentTransactions() {
    const container = document.getElementById('recent-transactions');
    if (!container) return;
    
    const recent = [...budgets].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    
    if (recent.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No transactions yet</p>';
        return;
    }
    
    container.innerHTML = recent.map(budget => {
        const date = new Date(budget.date).toLocaleDateString();
        const amount = parseFloat(budget.amount || 0).toFixed(2);
        const typeClass = budget.type === 'income' ? 'text-green-600' : 'text-red-600';
        const sign = budget.type === 'income' ? '+' : '-';
        
        return `
            <div class="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                    <p class="text-sm font-medium text-gray-900">${budget.description || budget.category}</p>
                    <p class="text-xs text-gray-500">${date} • ${budget.category}</p>
                </div>
                <p class="text-sm font-semibold ${typeClass}">${sign}$${amount}</p>
            </div>
        `;
    }).join('');
}

function renderUpcomingReminders(upcomingReminders) {
    const container = document.getElementById('upcoming-reminders-timeline');
    if (!container) {
        console.warn('Upcoming reminders timeline container not found');
        return;
    }
    
    // Ensure we have valid data
    if (!upcomingReminders || !Array.isArray(upcomingReminders) || upcomingReminders.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-center">
                <div class="p-4 bg-gray-100 rounded-full mb-4">
                    <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                </div>
                <p class="text-gray-500 font-medium">No upcoming bills</p>
                <p class="text-sm text-gray-400 mt-1">All caught up! Add bills to track them here.</p>
            </div>
        `;
        return;
    }
    
    // Show all reminders (not limited) since we have scrolling now
    // Filter out invalid reminders and sort by due date
    const validReminders = upcomingReminders
        .filter(r => r && r.due_date && !isNaN(new Date(r.due_date).getTime()))
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    
    if (validReminders.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-16 text-center">
                <div class="p-5 bg-blue-100 rounded-full mb-5">
                    <svg class="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                </div>
                <p class="text-lg font-semibold text-gray-700 mb-2">No upcoming bills</p>
                <p class="text-sm text-gray-500">All caught up! Add bills to track them here.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = validReminders.map((reminder, index) => {
        try {
            const dueDate = new Date(reminder.due_date);
            if (isNaN(dueDate.getTime())) {
                return '';
            }
            
            const daysUntil = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
            const isOverdue = daysUntil < 0 && !reminder.is_paid;
            const isToday = daysUntil === 0 && !reminder.is_paid;
            const isPaid = reminder.is_paid;
        
        // Determine styling based on status
        let cardBgClass = 'bg-gradient-to-br from-blue-50 to-blue-100';
        let cardBorderClass = 'border-blue-200';
        let iconBgClass = 'bg-blue-500';
        let badgeBgClass = 'bg-blue-50';
        let badgeTextClass = 'text-blue-700';
        let badgeBorderClass = 'border-blue-200';
        let statusText = `${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} left`;
        
        if (isPaid) {
            cardBgClass = 'bg-gradient-to-br from-green-50 to-green-100';
            cardBorderClass = 'border-green-200';
            iconBgClass = 'bg-green-500';
            badgeBgClass = 'bg-green-50';
            badgeTextClass = 'text-green-700';
            badgeBorderClass = 'border-green-200';
            statusText = 'Paid';
        } else if (isOverdue) {
            cardBgClass = 'bg-gradient-to-br from-red-50 to-red-100';
            cardBorderClass = 'border-red-200';
            iconBgClass = 'bg-red-500';
            badgeBgClass = 'bg-red-50';
            badgeTextClass = 'text-red-700';
            badgeBorderClass = 'border-red-200';
            statusText = `${Math.abs(daysUntil)} ${Math.abs(daysUntil) === 1 ? 'day' : 'days'} overdue`;
        } else if (isToday) {
            cardBgClass = 'bg-gradient-to-br from-orange-50 to-orange-100';
            cardBorderClass = 'border-orange-200';
            iconBgClass = 'bg-orange-500';
            badgeBgClass = 'bg-orange-50';
            badgeTextClass = 'text-orange-700';
            badgeBorderClass = 'border-orange-200';
            statusText = 'Due Today';
        }
        
        return `
            <div onclick="showBillDetails(${reminder.id})" class="relative p-3 ${cardBgClass} border-2 ${cardBorderClass} rounded-lg cursor-pointer hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200 group">
                <!-- Status Badge -->
                <div class="flex justify-between items-start mb-2">
                    <span class="inline-flex items-center gap-x-1 py-1 px-2 rounded-md text-xs font-semibold ${badgeBgClass} ${badgeTextClass} border ${badgeBorderClass}">
                        ${statusText}
                    </span>
                    ${reminder.recurring ? `
                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-300">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                            </svg>
                            ${reminder.recurrence_type || 'monthly'}
                        </span>
                    ` : ''}
                </div>
                
                <!-- Bill Title -->
                <h3 class="text-sm font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors line-clamp-1">${reminder.title}</h3>
                
                <!-- Amount -->
                <div class="mb-2">
                    <div class="flex items-baseline gap-2">
                        <span class="text-xl font-bold text-gray-900">$${parseFloat(reminder.amount || 0).toFixed(2)}</span>
                    </div>
                </div>
                
                <!-- Details Grid -->
                <div class="space-y-1.5 mb-2">
                    <div class="flex items-center gap-1.5 text-xs">
                        <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span class="text-gray-600 font-medium">Due:</span>
                        <span class="text-gray-800">${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <div class="flex items-center gap-1.5 text-xs">
                        <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                        </svg>
                        <span class="text-gray-600 font-medium">Category:</span>
                        <span class="text-gray-800">${reminder.category}</span>
                    </div>
                </div>
                
                <!-- Click Hint -->
                <div class="flex items-center gap-1.5 text-[10px] text-gray-500 mt-2 pt-2 border-t border-gray-300/50">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                    <span>Click to view details</span>
                </div>
            </div>
        `;
        } catch (error) {
            console.error('Error rendering reminder:', error, reminder);
            return '';
        }
    }).filter(html => html !== '').join('');
}

function loadSettingsPage() {
    renderCategories();
    renderReminders();
    budgetStorage.updateStorageInfo();
}

// Handle file upload for bills
async function handleFileUpload(reminderId, file) {
    if (!file) return;
    
    if (file.type !== 'image/png') {
        alert('Only PNG files are allowed');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('File size must be less than 5MB');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE}/reminders/${reminderId}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            await loadReminders();
            if (currentPage === 'bills') {
                renderBillsTable();
            }
            alert('File uploaded successfully!');
        } else {
            const error = await response.json();
            alert(error.error || 'Error uploading file');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Error uploading file');
    }
}

// Show bill details modal
function showBillDetails(reminderId) {
    const reminder = reminders.find(r => r.id === reminderId);
    if (!reminder) {
        alert('Bill not found');
        return;
    }
    
    const modal = document.getElementById('bill-details-modal');
    const titleEl = document.getElementById('bill-details-title');
    const contentEl = document.getElementById('bill-details-content');
    
    if (!modal || !titleEl || !contentEl) {
        console.error('Bill details modal elements not found');
        return;
    }
    
    const dueDate = new Date(reminder.due_date);
    const daysUntil = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
    const isOverdue = daysUntil < 0 && !reminder.is_paid;
    const isToday = daysUntil === 0 && !reminder.is_paid;
    const isPaid = reminder.is_paid;
    
    let statusClass = 'bg-blue-50 text-blue-700 border-blue-200';
    let statusText = `${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} left`;
    
    if (isPaid) {
        statusClass = 'bg-green-50 text-green-700 border-green-200';
        statusText = 'Paid';
    } else if (isOverdue) {
        statusClass = 'bg-red-50 text-red-700 border-red-200';
        statusText = `${Math.abs(daysUntil)} ${Math.abs(daysUntil) === 1 ? 'day' : 'days'} overdue`;
    } else if (isToday) {
        statusClass = 'bg-orange-50 text-orange-700 border-orange-200';
        statusText = 'Due Today';
    }
    
    titleEl.textContent = reminder.title;
    
    contentEl.innerHTML = `
        <div class="space-y-6">
            <div class="flex items-center justify-between p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                <div>
                    <p class="text-sm text-gray-600 mb-1">Amount</p>
                    <p class="text-3xl font-bold text-gray-900">$${parseFloat(reminder.amount || 0).toFixed(2)}</p>
                </div>
                <span class="inline-flex items-center gap-x-1.5 py-2 px-4 rounded-lg text-sm font-semibold ${statusClass} border">
                    ${statusText}
                </span>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p class="text-sm text-gray-600 mb-2">Due Date</p>
                    <p class="text-lg font-semibold text-gray-900">${dueDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    <p class="text-xs text-gray-500 mt-1">${daysUntil === 0 ? 'Due today' : daysUntil < 0 ? `${Math.abs(daysUntil)} days ago` : `${daysUntil} days from now`}</p>
                </div>
                
                <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p class="text-sm text-gray-600 mb-2">Category</p>
                    <p class="text-lg font-semibold text-gray-900">${reminder.category}</p>
                </div>
            </div>
            
            ${reminder.recurring ? `
                <div class="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                    <div class="flex items-center gap-2 mb-2">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        <p class="text-sm font-semibold text-indigo-900">Recurring Bill</p>
                    </div>
                    <p class="text-sm text-indigo-700">This bill repeats ${reminder.recurrence_type || 'monthly'}</p>
                </div>
            ` : ''}
            
            ${reminder.website_url ? `
                <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p class="text-sm text-gray-600 mb-2">Website</p>
                    <a href="${reminder.website_url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
                        </svg>
                        Visit Website
                    </a>
                </div>
            ` : ''}
            
            ${reminder.attachment ? `
                <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p class="text-sm text-gray-600 mb-2">Attachment</p>
                    <a href="/uploads/${reminder.attachment}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        View Attachment
                    </a>
                </div>
            ` : ''}
            
            <div class="pt-4 border-t border-gray-200">
                <div class="flex gap-3">
                    ${!reminder.is_paid ? `
                        <button onclick="markReminderPaid(${reminder.id}); closeBillDetailsModal();" class="flex-1 py-2.5 px-4 inline-flex items-center justify-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent bg-green-600 text-white hover:bg-green-700">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            Mark as Paid
                        </button>
                    ` : ''}
                    <button onclick="editReminder(${reminder.id}); closeBillDetailsModal();" class="flex-1 py-2.5 px-4 inline-flex items-center justify-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                        Edit Bill
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Show modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';
    
    const backdrop = modal.querySelector('.hs-overlay-backdrop');
    if (backdrop) {
        backdrop.style.display = 'block';
        backdrop.style.pointerEvents = 'auto';
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            backdrop.classList.add('opacity-50');
        }, 10);
    }
    
    const modalContent = modal.querySelector('.pointer-events-auto');
    if (modalContent) {
        modalContent.style.pointerEvents = 'auto';
        setTimeout(() => {
            modalContent.style.opacity = '1';
            modalContent.style.transform = 'translateY(0)';
            modalContent.style.marginTop = '1.75rem';
        }, 50);
    }
    
    document.body.style.overflow = 'hidden';
}

function closeBillDetailsModal() {
    const modal = document.getElementById('bill-details-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        
        const backdrop = modal.querySelector('.hs-overlay-backdrop');
        if (backdrop) {
            backdrop.classList.add('opacity-0');
            backdrop.classList.remove('opacity-50');
            backdrop.style.display = 'none';
        }
        
        document.body.style.overflow = '';
    }
}

// Initialize world clocks
function initWorldClocks() {
    const timezones = {
        ny: 'America/New_York',
        london: 'Europe/London',
        tokyo: 'Asia/Tokyo'
    };
    
    const timezoneLabels = {
        ny: 'EST/EDT',
        london: 'GMT/BST',
        tokyo: 'JST'
    };
    
    function updateClocks() {
        Object.keys(timezones).forEach(city => {
            const timeEl = document.getElementById(`clock-${city}`);
            const dateEl = document.getElementById(`date-${city}`);
            
            if (timeEl && dateEl) {
                try {
                    const now = new Date();
                    const timeStr = new Intl.DateTimeFormat('en-US', {
                        timeZone: timezones[city],
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    }).format(now);
                    
                    const dateStr = new Intl.DateTimeFormat('en-US', {
                        timeZone: timezones[city],
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    }).format(now);
                    
                    timeEl.textContent = timeStr;
                    dateEl.textContent = dateStr;
                } catch (error) {
                    console.error(`Error updating clock for ${city}:`, error);
                }
            }
        });
    }
    
    // Update immediately
    updateClocks();
    
    // Update every second
    setInterval(updateClocks, 1000);
}

// Make functions globally available
window.deleteTransaction = deleteTransaction;
window.markReminderPaid = markReminderPaid;
window.deleteReminder = deleteReminder;
window.editReminder = editReminder;
window.handleFileUpload = handleFileUpload;
window.showBillDetails = showBillDetails;
window.closeBillDetailsModal = closeBillDetailsModal;

// Error handler for uncaught errors
window.addEventListener('error', (event) => {
    console.error('JavaScript error:', event.error);
});

// Ensure page is visible after load (only once)
let pageInitialized = false;
window.addEventListener('load', () => {
    if (!pageInitialized) {
        pageInitialized = true;
        // Ensure sidebar is visible on large screens
        if (window.innerWidth >= 1024) {
            const sidebar = document.getElementById('application-sidebar');
            if (sidebar) {
                sidebar.classList.remove('hidden');
            }
        }
    }
});

