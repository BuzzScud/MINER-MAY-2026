/**
 * API data service - load/save user-scoped data via REST.
 * Requires Authorization: Bearer <token>.
 */

export async function loadAllData(_token) {
  const res = await fetch('/api/data', {
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    throw new Error('Failed to load data');
  }
  return res.json();
}

export async function loadData(token, keys) {
  if (!keys || keys.length === 0) return {};
  const query = new URLSearchParams({ keys: keys.join(',') });
  const res = await fetch(`/api/data?${query}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    throw new Error('Failed to load data');
  }
  return res.json();
}

export async function saveData(token, key, value) {
  const res = await fetch(`/api/data/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value }),
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    throw new Error('Failed to save data');
  }
}

export async function saveBatch(token, updates) {
  const res = await fetch('/api/data/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates }),
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    throw new Error('Failed to save data');
  }
}
