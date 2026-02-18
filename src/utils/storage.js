/**
 * Storage abstraction: when logged in, uses API (PostgreSQL); when logged out, uses localStorage.
 * All methods are async for API compatibility.
 */
import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/apiDataService';
import { STORAGE_KEYS } from './storageKeys';

export async function getItem(token, key) {
  if (token) {
    try {
      const data = await api.loadData(token, [key]);
      return data[key] ?? null;
    } catch {
      return null;
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
  if (token) {
    try {
      await api.saveData(token, key, value);
      return;
    } catch {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value ?? null));
      return;
    }
  }
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value ?? null));
}

export async function loadAll(token) {
  if (token) {
    try {
      return await api.loadAllData(token);
    } catch {
      return {};
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
  if (token) {
    try {
      await api.saveBatch(token, updates);
      return;
    } catch {
      for (const [key, value] of Object.entries(updates)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value ?? null));
      }
      return;
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
  if (Object.keys(updates).length > 0) {
    await api.saveBatch(token, updates);
  }
}
