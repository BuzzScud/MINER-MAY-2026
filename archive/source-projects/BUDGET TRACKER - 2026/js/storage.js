// IndexedDB Storage Manager for Budget Tracker
// Supports up to 500MB of local storage

class BudgetStorage {
    constructor() {
        this.dbName = 'BudgetTrackerDB';
        this.dbVersion = 1;
        this.db = null;
        this.maxStorageSize = 500 * 1024 * 1024; // 500MB in bytes
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.updateStorageInfo();
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores
                if (!db.objectStoreNames.contains('budgets')) {
                    const budgetStore = db.createObjectStore('budgets', { keyPath: 'id', autoIncrement: true });
                    budgetStore.createIndex('date', 'date', { unique: false });
                    budgetStore.createIndex('category', 'category', { unique: false });
                    budgetStore.createIndex('type', 'type', { unique: false });
                }

                if (!db.objectStoreNames.contains('categories')) {
                    const categoryStore = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
                    categoryStore.createIndex('name', 'name', { unique: true });
                }

                if (!db.objectStoreNames.contains('reminders')) {
                    const reminderStore = db.createObjectStore('reminders', { keyPath: 'id', autoIncrement: true });
                    reminderStore.createIndex('due_date', 'due_date', { unique: false });
                    reminderStore.createIndex('is_paid', 'is_paid', { unique: false });
                }

                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async addBudget(budget) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['budgets'], 'readwrite');
            const store = transaction.objectStore('budgets');
            const request = store.add({
                ...budget,
                created_at: new Date().toISOString()
            });

            request.onsuccess = () => {
                resolve(request.result);
                this.updateStorageInfo();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getAllBudgets() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['budgets'], 'readonly');
            const store = transaction.objectStore('budgets');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateBudget(id, updates) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['budgets'], 'readwrite');
            const store = transaction.objectStore('budgets');
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const budget = getRequest.result;
                if (budget) {
                    Object.assign(budget, updates);
                    const putRequest = store.put(budget);
                    putRequest.onsuccess = () => {
                        resolve(budget);
                        this.updateStorageInfo();
                    };
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error('Budget not found'));
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteBudget(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['budgets'], 'readwrite');
            const store = transaction.objectStore('budgets');
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve();
                this.updateStorageInfo();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async addCategory(category) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['categories'], 'readwrite');
            const store = transaction.objectStore('categories');
            const request = store.add(category);

            request.onsuccess = () => {
                resolve(request.result);
                this.updateStorageInfo();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getAllCategories() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['categories'], 'readonly');
            const store = transaction.objectStore('categories');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async addReminder(reminder) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['reminders'], 'readwrite');
            const store = transaction.objectStore('reminders');
            const request = store.add({
                ...reminder,
                created_at: new Date().toISOString()
            });

            request.onsuccess = () => {
                resolve(request.result);
                this.updateStorageInfo();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getAllReminders() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['reminders'], 'readonly');
            const store = transaction.objectStore('reminders');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateReminder(id, updates) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['reminders'], 'readwrite');
            const store = transaction.objectStore('reminders');
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const reminder = getRequest.result;
                if (reminder) {
                    Object.assign(reminder, updates);
                    const putRequest = store.put(reminder);
                    putRequest.onsuccess = () => {
                        resolve(reminder);
                        this.updateStorageInfo();
                    };
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error('Reminder not found'));
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteReminder(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['reminders'], 'readwrite');
            const store = transaction.objectStore('reminders');
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve();
                this.updateStorageInfo();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getStorageSize() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return { used: 0, quota: this.maxStorageSize };
        }

        try {
            const estimate = await navigator.storage.estimate();
            return {
                used: estimate.usage || 0,
                quota: estimate.quota || this.maxStorageSize
            };
        } catch (error) {
            console.error('Error getting storage estimate:', error);
            return { used: 0, quota: this.maxStorageSize };
        }
    }

    async updateStorageInfo() {
        // Debounce storage updates to prevent excessive calls
        if (this._updateStorageTimeout) {
            clearTimeout(this._updateStorageTimeout);
        }
        
        this._updateStorageTimeout = setTimeout(async () => {
            try {
                const storageInfo = await this.getStorageSize();
                const usedMB = (storageInfo.used / (1024 * 1024)).toFixed(2);
                const quotaMB = (storageInfo.quota / (1024 * 1024)).toFixed(2);
                const percentage = (storageInfo.used / storageInfo.quota) * 100;

                const storageUsedEl = document.getElementById('storage-used');
                const storageProgressEl = document.getElementById('storage-progress');

                if (storageUsedEl) {
                    storageUsedEl.textContent = `${usedMB} MB / ${quotaMB} MB`;
                }

                if (storageProgressEl) {
                    storageProgressEl.style.width = `${Math.min(percentage, 100)}%`;
                }
            } catch (error) {
                console.error('Error updating storage info:', error);
            }
        }, 500); // Debounce by 500ms
    }

    async clearAllData() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['budgets', 'categories', 'reminders', 'settings'], 'readwrite');
            const stores = ['budgets', 'categories', 'reminders', 'settings'];
            let completed = 0;

            stores.forEach(storeName => {
                const store = transaction.objectStore(storeName);
                const request = store.clear();

                request.onsuccess = () => {
                    completed++;
                    if (completed === stores.length) {
                        this.updateStorageInfo();
                        resolve();
                    }
                };

                request.onerror = () => {
                    reject(request.error);
                };
            });
        });
    }
}

// Initialize global storage instance
const budgetStorage = new BudgetStorage();

