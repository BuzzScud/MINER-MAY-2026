const API_BASE = 'https://mempool.space/api';

async function fetchWithRetry(url, retries = 2) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 429 && retries > 0) {
    const delay = Math.pow(2, 3 - retries) * 1000;
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithRetry(url, retries - 1);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchApi(path) {
  return fetchWithRetry(`${API_BASE}${path}`);
}

export async function fetchApiText(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'text/plain' },
  });
  if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText}`);
  return response.text();
}
