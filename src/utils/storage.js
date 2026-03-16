/**
 * Storage abstraction: when logged in, uses API (PostgreSQL); when logged out, uses localStorage.
 * All methods are async for API compatibility.
 * When backend returns 5xx/404, we use only localStorage for a short cooldown to avoid console spam.
 */
import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/apiDataService';
import { STORAGE_KEYS } from './storageKeys';

const BACKEND_COOLDOWN_KEY = 'storage_backend_unavailable_until';
const BACKEND_COOLDOWN_MS = 60_000;

function isBackendInCooldown() {
  try {
    const until = sessionStorage.getItem(BACKEND_COOLDOWN_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch {
    return false;
  }
}

function setBackendCooldown() {
  try {
    sessionStorage.setItem(BACKEND_COOLDOWN_KEY, String(Date.now() + BACKEND_COOLDOWN_MS));
  } catch {
    /* ignore */
  }
}

export async function getItem(token, key) {
  if (token && !isBackendInCooldown()) {
    try {
      const data = await api.loadData(token, [key]);
      return data[key] ?? null;
    } catch {
      setBackendCooldown();
    }
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setItem(token, key, value) {
  if (token && !isBackendInCooldown()) {
    try {
      await api.saveData(token, key, value);
      return;
    } catch {
      setBackendCooldown();
    }
  }
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value ?? null));
}

export async function loadAll(token) {
  if (token && !isBackendInCooldown()) {
    try {
      return await api.loadAllData(token);
    } catch {
      setBackendCooldown();
    }
  }
  const keys = Object.values(STORAGE_KEYS);
  const out = {};
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw != null) out[k] = JSON.parse(raw);
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function saveBatch(token, updates) {
  if (token && !isBackendInCooldown()) {
    try {
      await api.saveBatch(token, updates);
      return;
    } catch {
      setBackendCooldown();
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value ?? null));
  }
}

/**
 * One-time migration: copy localStorage keys to API.
 * Call after login to merge local data into cloud.
 */
export function useStorage() {
  const { token } = useAuth();
  const getItemBound = useCallback((key) => getItem(token, key), [token]);
  const setItemBound = useCallback((key, value) => setItem(token, key, value), [token]);
  return { getItem: getItemBound, setItem: setItemBound, token };
}

export async function migrateLocalToApi(token) {
  const keys = Object.values(STORAGE_KEYS);
  const updates = {};
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw != null) {
        const value = JSON.parse(raw);
        updates[k] = value;
      }
    } catch {
      /* skip */
    }
  }
  // Migrate legacy stabilizedModel_* keys into single STABILIZED_MODELS object
  const stabilizedModels = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('stabilizedModel_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const value = JSON.parse(raw);
            const symbol = key.replace(/^stabilizedModel_/, '');
            if (symbol && typeof value === 'object' && value !== null) {
              stabilizedModels[symbol] = value;
            }
          } catch {
            /* skip */
          }
        }
      }
    }
    if (Object.keys(stabilizedModels).length > 0) {
      const existing = updates[STORAGE_KEYS.STABILIZED_MODELS];
      updates[STORAGE_KEYS.STABILIZED_MODELS] =
        typeof existing === 'object' && existing
          ? { ...existing, ...stabilizedModels }
          : stabilizedModels;
    }
  } catch {
    /* ignore */
  }
  if (Object.keys(updates).length > 0) {
    await api.saveBatch(token, updates);
  }
}
