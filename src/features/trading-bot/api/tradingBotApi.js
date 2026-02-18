/**
 * REST API client for QuantBot backend (proxied to port 8080 in dev).
 * All paths are relative so they go through Vite proxy.
 */

const BASE = '';

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** GET /api/state - full bot state */
export async function getState() {
  return request('/api/state');
}

/** GET /api/prices - current prices only */
export async function getPrices() {
  return request('/api/prices');
}

/** GET /api/mode */
export async function getMode() {
  return request('/api/mode');
}

/** POST /api/mode - set trading mode (paper/live) and optional broker config */
export async function setMode(mode, broker = {}) {
  return request('/api/mode', {
    method: 'POST',
    body: JSON.stringify({ mode, broker }),
  });
}

/** POST /api/bot/start */
export async function startBot() {
  return request('/api/bot/start', { method: 'POST' });
}

/** POST /api/bot/stop */
export async function stopBot() {
  return request('/api/bot/stop', { method: 'POST' });
}

/** POST /api/symbols - action: 'add' | 'remove', symbol: string */
export async function symbolsAction(action, symbol) {
  return request('/api/symbols', {
    method: 'POST',
    body: JSON.stringify({ action, symbol: symbol.trim().toUpperCase() }),
  });
}

/** POST /api/timeframe - interval: '15m' | '30m' | '1h' | '4h' | '1d' */
export async function setTimeframe(interval) {
  return request('/api/timeframe', {
    method: 'POST',
    body: JSON.stringify({ interval: interval.trim().toLowerCase() }),
  });
}

/** GET /api/feed */
export async function getFeed() {
  return request('/api/feed');
}

/** POST /api/feed - provider, optional api_key */
export async function setFeed(provider, apiKey = null) {
  return request('/api/feed', {
    method: 'POST',
    body: JSON.stringify({ provider: provider.trim().toLowerCase(), api_key: apiKey || undefined }),
  });
}

/** GET /api/settings */
export async function getSettings() {
  return request('/api/settings');
}

/** POST /api/settings - partial settings object */
export async function updateSettings(settings) {
  return request('/api/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

/** GET /api/strategies */
export async function getStrategies() {
  return request('/api/strategies');
}

/** PATCH /api/strategy - strategy_id */
export async function setStrategy(strategyId) {
  return request('/api/strategy', {
    method: 'PATCH',
    body: JSON.stringify({ strategy_id: strategyId }),
  });
}

/** POST /api/broker/test - test IB connection */
export async function testBrokerConnection(brokerConfig) {
  return request('/api/broker/test', {
    method: 'POST',
    body: JSON.stringify(brokerConfig || {}),
  });
}

/** POST /api/backtest/run */
export async function runBacktest(params) {
  return request('/api/backtest/run', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** GET /api/backtest/status */
export async function getBacktestStatus() {
  return request('/api/backtest/status');
}
