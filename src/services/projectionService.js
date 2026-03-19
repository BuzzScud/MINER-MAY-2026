// Projection Service - Save and load projection data
// Accepts storage adapter { getItem, setItem } for PostgreSQL persistence when logged in

import { STORAGE_KEYS } from '../utils/storageKeys';

/** See `src/types/savedProjection.js` for SavedProjection shape. */

const DUPLICATE_SAVE_WINDOW_MS = 60_000;

function projectionSavedTimeMs(projection) {
  const iso = projection.timestamp || projection.savedAt;
  if (!iso || typeof iso !== 'string') return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * @param {string} ticker
 * @param {Array<Record<string, unknown>>} projections
 * @returns {boolean}
 */
function hasRecentSaveForTicker(ticker, projections) {
  const upper = String(ticker || '').trim().toUpperCase();
  if (!upper) return false;
  const now = Date.now();
  for (let i = projections.length - 1; i >= 0; i -= 1) {
    const p = projections[i];
    const sym = String(p.ticker || '').trim().toUpperCase();
    if (sym !== upper) continue;
    const savedAt = projectionSavedTimeMs(p);
    if (savedAt && now - savedAt < DUPLICATE_SAVE_WINDOW_MS) return true;
  }
  return false;
}

// Get all saved projections (async - uses storage adapter)
export const getSavedProjections = async (storage) => {
  try {
    if (storage?.getItem) {
      const saved = await storage.getItem(STORAGE_KEYS.SAVED_PROJECTIONS);
      if (Array.isArray(saved)) return saved;
      if (saved && typeof saved === 'object') return Array.isArray(saved) ? saved : [];
    }
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_PROJECTIONS);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.error('Error loading saved projections:', error);
  }
  return [];
};

/**
 * @param {Record<string, unknown>} projectionData
 * @param {{ getItem?: Function, setItem?: Function }} [storage]
 */
export const saveProjection = async (projectionData, storage) => {
  const projections = await getSavedProjections(storage);
  const ticker = projectionData.ticker;
  if (hasRecentSaveForTicker(ticker, projections)) {
    const err = new Error('A projection for this symbol was saved less than a minute ago. Wait before saving again.');
    err.code = 'DUPLICATE_SAVE';
    throw err;
  }
  const nowIso = new Date().toISOString();
  const id =
    typeof projectionData.id === 'string' && projectionData.id
      ? projectionData.id
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const newProjection = {
    ...projectionData,
    id,
    timestamp: projectionData.timestamp || nowIso,
    savedAt: nowIso,
  };
  projections.push(newProjection);
  try {
    if (storage?.setItem) {
      await storage.setItem(STORAGE_KEYS.SAVED_PROJECTIONS, projections);
    } else {
      localStorage.setItem(STORAGE_KEYS.SAVED_PROJECTIONS, JSON.stringify(projections));
    }
    return newProjection;
  } catch (error) {
    console.error('Error saving projection:', error);
    throw error;
  }
};

// Delete a projection
export const deleteProjection = async (id, storage) => {
  try {
    const projections = await getSavedProjections(storage);
    const filtered = projections.filter((p) => p.id !== id);
    if (storage?.setItem) {
      await storage.setItem(STORAGE_KEYS.SAVED_PROJECTIONS, filtered);
    } else {
      localStorage.setItem(STORAGE_KEYS.SAVED_PROJECTIONS, JSON.stringify(filtered));
    }
    return { success: true };
  } catch (error) {
    console.error('Error deleting projection:', error);
    throw error;
  }
};

// Update a projection
export const updateProjection = async (id, updates, storage) => {
  try {
    const projections = await getSavedProjections(storage);
    const index = projections.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Projection not found');
    projections[index] = {
      ...projections[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    if (storage?.setItem) {
      await storage.setItem(STORAGE_KEYS.SAVED_PROJECTIONS, projections);
    } else {
      localStorage.setItem(STORAGE_KEYS.SAVED_PROJECTIONS, JSON.stringify(projections));
    }
    return projections[index];
  } catch (error) {
    console.error('Error updating projection:', error);
    throw error;
  }
};

// Get a single projection by ID
export const getProjection = async (id, storage) => {
  try {
    const projections = await getSavedProjections(storage);
    return projections.find((p) => p.id === id) ?? null;
  } catch (error) {
    console.error('Error getting projection:', error);
    return null;
  }
};
