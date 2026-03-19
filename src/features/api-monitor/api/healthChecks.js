/**
 * API health check logic for the API Monitor page.
 * Uses monitorService getApiKeys for storage abstraction (PostgreSQL when logged in).
 */

const DEGRADED_LATENCY_MS = 2000;

/**
 * Build the URL for an endpoint. Uses storage abstraction for API keys.
 */
export async function getEndpointUrl(endpoint) {
  if (typeof endpoint.url === 'function') {
    return endpoint.url();
  }
  return endpoint.url;
}

/**
 * Check a single endpoint: fetch, measure latency, return result.
 * @param {object} config - { id, name, url (string or function), method, usedBy? }
 * @returns {Promise<object>} { id, name, status: 'up'|'down'|'degraded', latencyMs, statusCode, timestamp, error?, usedBy? }
 */
export async function checkEndpoint(config) {
  const start = performance.now();
  const timestamp = new Date().toISOString();
  const url = await getEndpointUrl(config);
  const method = config.method || 'GET';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: config.headers || {},
      mode: 'cors',
      credentials: 'include',
    });

    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - start);

    if (response.status >= 500) {
      return {
        id: config.id,
        name: config.name,
        status: 'down',
        latencyMs,
        statusCode: response.status,
        timestamp,
        error: `HTTP ${response.status}`,
        usedBy: config.usedBy,
      };
    }

    if (response.status >= 400) {
      return {
        id: config.id,
        name: config.name,
        status: 'down',
        latencyMs,
        statusCode: response.status,
        timestamp,
        error: `HTTP ${response.status}`,
        usedBy: config.usedBy,
      };
    }

    const status = latencyMs > DEGRADED_LATENCY_MS ? 'degraded' : 'up';
    return {
      id: config.id,
      name: config.name,
      status,
      latencyMs,
      statusCode: response.status,
      timestamp,
      usedBy: config.usedBy,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const errorMessage = err.name === 'AbortError' ? 'Timeout' : (err.message || 'Network error');
    return {
      id: config.id,
      name: config.name,
      status: 'down',
      latencyMs,
      statusCode: null,
      timestamp,
      error: errorMessage,
      usedBy: config.usedBy,
    };
  }
}

export const CHECK_ENDPOINTS = [
  {
    id: 'yahoo',
    name: 'Yahoo Finance',
    description: 'Charts, Dashboard, Projection, Fib Stuff',
    url: () => {
      if (import.meta.env.DEV) {
        return `${window.location.origin}/api/yahoo/v8/finance/chart/QQQ?interval=1d&range=1d`;
      }
      return `https://corsproxy.io/?${encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/QQQ?interval=1d&range=1d')}`;
    },
    method: 'GET',
    usedBy: ['Charts', 'Dashboard', 'Projection', 'Fib Stuff'],
  },
  {
    id: 'finnhub',
    name: 'Finnhub',
    description: 'Backup market data',
    url: () => `${typeof window !== 'undefined' ? window.location.origin : ''}/api/market-data/health-check?provider=finnhub&symbol=QQQ`,
    method: 'GET',
    usedBy: ['Charts', 'Dashboard', 'Projection'],
  },
  {
    id: 'massive',
    name: 'Massive',
    description: 'Backup market data',
    url: () => `${typeof window !== 'undefined' ? window.location.origin : ''}/api/market-data/health-check?provider=massive&symbol=QQQ`,
    method: 'GET',
    usedBy: ['Charts', 'Dashboard', 'Projection'],
  },
  {
    id: 'mempool-rest',
    name: 'Mempool.space REST',
    description: 'Mempool fees and stats',
    url: 'https://mempool.space/api/v1/fees/recommended',
    method: 'GET',
    usedBy: ['Mempool'],
  },
  {
    id: 'quote-proxy',
    name: 'Quote Proxy',
    description: 'Backend Yahoo proxy',
    url: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/quote/QQQ?period=ytd`,
    method: 'GET',
    usedBy: ['Fib Stuff'],
  },
  {
    id: 'miner',
    name: 'Miner Server',
    description: 'Bitcoin miner API',
    url: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/miner/status`,
    method: 'GET',
    usedBy: ['Miner'],
  },
];

/**
 * Run health checks for all endpoints in parallel.
 * Mempool WebSocket is not checked here (handled by hook that consumes useMempoolWebSocket).
 * @returns {Promise<object[]>} array of check results
 */
export async function checkAllEndpoints() {
  const results = await Promise.allSettled(
    CHECK_ENDPOINTS.map((config) => checkEndpoint(config))
  );
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const config = CHECK_ENDPOINTS[i];
    return {
      id: config?.id ?? 'unknown',
      name: config?.name ?? 'Unknown',
      status: 'down',
      latencyMs: 0,
      statusCode: null,
      timestamp: new Date().toISOString(),
      error: r.reason?.message ?? 'Check failed',
      usedBy: config?.usedBy,
    };
  });
}
