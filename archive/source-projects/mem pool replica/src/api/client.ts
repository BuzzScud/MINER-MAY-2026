const API_BASE = 'https://mempool.space/api';

/** All REST paths use /api/* (e.g. /mempool, /mempool/recent). If you see 404s for /v1/mempool/ht or similar, they are not from this client; check the browser Network tab to find the caller. */

async function fetchWithRetry<T>(
  url: string,
  retries = 2
): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 429 && retries > 0) {
    const delay = Math.pow(2, 3 - retries) * 1000;
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithRetry<T>(url, retries - 1);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchApi<T>(path: string): Promise<T> {
  return fetchWithRetry<T>(`${API_BASE}${path}`);
}

/** Fetch response as text (e.g. for /tx/{txid}/hex). */
export async function fetchApiText(path: string): Promise<string> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'text/plain' },
  });
  if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText}`);
  return response.text();
}
