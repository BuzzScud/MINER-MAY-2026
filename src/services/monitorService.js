// Yahoo Finance API Service for Live Market Data
// Fetches real-time stock and market data from Yahoo Finance

import { STORAGE_KEYS } from '../utils/storageKeys';

// Storage adapter: when set (e.g. by React components with useStorage), uses API/PostgreSQL; otherwise localStorage
let storageAdapter = null;

export function setMonitorStorageAdapter(adapter) {
  storageAdapter = adapter;
}

// List of reliable CORS proxy services for production
// These are tested and working as of Dec 2024
const CORS_PROXIES = [
  {
    name: 'corsproxy.io',
    getUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    parseResponse: (data) => data,
    headers: {},
  },
  {
    name: 'cors-anywhere-heroku',
    getUrl: (url) => `https://cors-anywhere.herokuapp.com/${url}`,
    parseResponse: (data) => data,
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  },
  {
    name: 'thingproxy',
    getUrl: (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
    parseResponse: (data) => data,
    headers: {},
  },
];

// Alternative Yahoo Finance endpoints (some may work without CORS proxy)
const YAHOO_ENDPOINTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

// Track which proxy is working best
let preferredProxyIndex = 0;
let preferredEndpointIndex = 0;

// Cache for successful requests to reduce API calls
const dataCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds cache

// Get Yahoo Finance URL based on environment
const getYahooFinanceBaseUrl = (symbol, interval = '1d', range = '1d', endpointIndex = 0) => {
  const endpoint = YAHOO_ENDPOINTS[endpointIndex % YAHOO_ENDPOINTS.length];
  return `${endpoint}/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
};

// Use proxy in development, CORS proxy in production
const getYahooFinanceUrl = (symbol, interval = '1d', range = '1d', proxyIndex = 0, endpointIndex = 0) => {
  // In development, use Vite proxy
  if (import.meta.env.DEV) {
    return `/api/yahoo/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
  }
  
  // In production, use CORS proxy
  const baseUrl = getYahooFinanceBaseUrl(symbol, interval, range, endpointIndex);
  const proxy = CORS_PROXIES[proxyIndex % CORS_PROXIES.length];
  return proxy.getUrl(baseUrl);
};

// Default Finnhub API key for production
const DEFAULT_FINNHUB_KEY = 'd18ueuhr01qkcat4uip0d18ueuhr01qkcat4uipg';

// Helper function to get API keys from storage (async when adapter set) - exported for healthChecks
export const getApiKeys = async () => {
  try {
    let saved = null;
    if (storageAdapter?.getItem) {
      saved = await storageAdapter.getItem(STORAGE_KEYS.API_KEYS);
    } else {
      const raw = localStorage.getItem(STORAGE_KEYS.API_KEYS);
      saved = raw ? JSON.parse(raw) : null;
    }
    if (saved && typeof saved === 'object') {
      return {
        finnhub: saved.finnhub || DEFAULT_FINNHUB_KEY,
        massive: saved.massive || 'qeBvdtjWjffA90rzgWB_HeHtmdpyuGQG',
      };
    }
  } catch (error) {
    console.error('Error loading API keys:', error);
  }
  return {
    finnhub: DEFAULT_FINNHUB_KEY,
    massive: 'qeBvdtjWjffA90rzgWB_HeHtmdpyuGQG',
  };
};

// Finnhub API - Backup endpoint (Free tier: 60 calls/minute)
const getFinnhubUrl = (symbol, apiKeys) => {
  const apiKey = apiKeys?.finnhub || 'demo';
  return `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
};

// Massive API - Backup endpoint (Single Ticker Snapshot)
const getMassiveUrl = (symbol, apiKeys) => {
  const apiKey = apiKeys?.massive || 'qeBvdtjWjffA90rzgWB_HeHtmdpyuGQG';
  return `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
};

// Helper function to check cache
const getCachedData = (cacheKey) => {
  const cached = dataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  dataCache.delete(cacheKey);
  return null;
};

// Helper function to set cache
const setCachedData = (cacheKey, data) => {
  dataCache.set(cacheKey, { data, timestamp: Date.now() });
  // Clean up old entries
  if (dataCache.size > 100) {
    const oldest = [...dataCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) dataCache.delete(oldest[0]);
  }
};

// Helper function to fetch from Yahoo Finance with proxy fallback
const fetchWithProxy = async (symbol, interval, range, proxyIndex, endpointIndex = 0) => {
  const url = getYahooFinanceUrl(symbol, interval, range, proxyIndex, endpointIndex);
  const proxy = CORS_PROXIES[proxyIndex % CORS_PROXIES.length];
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout per proxy
  
  try {
    const headers = {
      'Accept': 'application/json',
      ...proxy.headers,
    };
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      mode: 'cors',
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    let data;
    
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Try to parse as JSON anyway
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Response is not JSON');
      }
    }
    
    // Handle wrapped response from some proxies
    if (data.contents) {
      data = typeof data.contents === 'string' ? JSON.parse(data.contents) : data.contents;
    }
    
    // Apply any proxy-specific parsing
    data = proxy.parseResponse(data);
    
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Helper function to fetch from Yahoo Finance
export const fetchYahooFinance = async (symbol, interval = '1d', range = '1d') => {
  // Check cache first
  const cacheKey = `yahoo_${symbol}_${interval}_${range}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // In development, use direct Vite proxy
  if (import.meta.env.DEV) {
    try {
      const url = getYahooFinanceUrl(symbol, interval, range);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data?.chart?.result?.[0]) {
        throw new Error('Invalid response format');
      }
      
      const result = { data, source: 'yahoo' };
      setCachedData(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error fetching from Yahoo Finance (dev) ${symbol}:`, error);
      throw error;
    }
  }
  
  // In production, try multiple CORS proxies with multiple Yahoo endpoints
  let lastError = null;
  const totalAttempts = CORS_PROXIES.length * YAHOO_ENDPOINTS.length;
  
  // Try starting from the preferred proxy and endpoint, then cycle through others
  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const proxyIndex = (preferredProxyIndex + Math.floor(attempt / YAHOO_ENDPOINTS.length)) % CORS_PROXIES.length;
    const endpointIndex = (preferredEndpointIndex + attempt) % YAHOO_ENDPOINTS.length;
    const proxy = CORS_PROXIES[proxyIndex];
    
    try {
      const data = await fetchWithProxy(symbol, interval, range, proxyIndex, endpointIndex);
      
      // Validate response
      if (!data) {
        throw new Error('Empty response from API');
      }
      
      if (!data.chart) {
        throw new Error('Invalid response: missing chart data');
      }
      
      if (!data.chart.result || !Array.isArray(data.chart.result) || data.chart.result.length === 0) {
        throw new Error('Invalid response: no result data');
      }
      
      if (!data.chart.result[0]) {
        throw new Error('Invalid response: empty result array');
      }
      
      // This proxy and endpoint worked, remember them for next time
      if (proxyIndex !== preferredProxyIndex) {
        preferredProxyIndex = proxyIndex;
      }
      if (endpointIndex !== preferredEndpointIndex) {
        preferredEndpointIndex = endpointIndex;
      }
      
      const result = { data, source: 'yahoo' };
      setCachedData(cacheKey, result);
      return result;
    } catch (error) {
      lastError = error;
      // Continue to next proxy/endpoint combination silently
    }
  }
  
  // All proxies failed
  throw new Error(`Failed to fetch Yahoo Finance data for ${symbol}`);
};

// Helper function to fetch from Finnhub (Backup API)
// Finnhub supports CORS natively, so no proxy needed
export const fetchFinnhub = async (symbol) => {
  // Check cache first
  const cacheKey = `finnhub_${symbol}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // Map special symbols for Finnhub
  let finnhubSymbol = symbol;
  if (symbol === 'DX-Y.NYB' || symbol === 'DXY') {
    finnhubSymbol = 'EURUSD'; // Finnhub doesn't have DXY, use EURUSD as proxy
  } else if (symbol === '^VIX' || symbol === 'VIX') {
    finnhubSymbol = 'SPY'; // Use SPY as fallback since VIX isn't available in free tier
  }

  try {
    const apiKeys = await getApiKeys();
    const url = getFinnhubUrl(finnhubSymbol, apiKeys);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Finnhub HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || data.error) {
      throw new Error(data.error || 'Empty response from Finnhub API');
    }
    
    // Finnhub returns 0 for invalid symbols
    if (data.c === 0 && data.h === 0 && data.l === 0) {
      throw new Error('Invalid symbol or no data available');
    }
    
    if (data.c === null || data.c === undefined) {
      throw new Error('Invalid response: missing price data');
    }
    
    const result = { data, source: 'finnhub' };
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    throw new Error(`Finnhub failed for ${symbol}: ${error.message}`);
  }
};

// Helper function to fetch from Massive (Backup API)
export const fetchMassive = async (symbol) => {
  try {
    const apiKeys = await getApiKeys();
    const url = getMassiveUrl(symbol, apiKeys);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Massive HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data || data.status !== 'OK' || !data.ticker) {
      throw new Error(data?.error || 'Invalid response from Massive API');
    }

    const ticker = data.ticker;
    const day = ticker.day || {};
    const prevDay = ticker.prevDay || {};
    const lastTrade = ticker.lastTrade || {};

    const currentPrice = day.c || lastTrade.p || prevDay.c || 0;
    if (currentPrice === 0) {
      throw new Error('Invalid response: missing price data');
    }

    const previousClose = prevDay.c || currentPrice;

    // Normalize to Finnhub-compatible shape used by the rest of the app
    const normalizedData = {
      c: currentPrice,
      pc: previousClose,
      h: day.h || currentPrice,
      l: day.l || currentPrice,
      o: day.o || currentPrice,
      v: day.v || 0,
      t: ticker.updated ? ticker.updated / 1e9 : Date.now() / 1000,
    };

    return { data: normalizedData, source: 'massive' };
  } catch (error) {
    console.error(`Error fetching from Massive ${symbol}:`, error);
    throw error;
  }
};

// Get preferred API from storage
const getPreferredApi = async () => {
  try {
    let saved = null;
    if (storageAdapter?.getItem) {
      saved = await storageAdapter.getItem(STORAGE_KEYS.PREFERRED_API);
    } else {
      saved = localStorage.getItem(STORAGE_KEYS.PREFERRED_API);
    }
    if (saved && ['yahoo', 'finnhub', 'massive', 'auto'].includes(saved)) {
      return saved;
    }
  } catch (error) {
    console.error('Error loading preferred API:', error);
  }
  return 'auto';
};

// Unified fetch function with user-selected API or automatic fallback
export const fetchMarketData = async (symbol, interval = '1d', range = '1d', prioritizeYahoo = false) => {
  const preferredApi = await getPreferredApi();
  const errors = [];
  
  // If prioritizeYahoo is true (needed for chart data), try Yahoo Finance first
  if (prioritizeYahoo) {
    try {
      const result = await fetchYahooFinance(symbol, interval, range);
      return result;
    } catch (error) {
      errors.push(`Yahoo: ${error.message}`);
      // Continue to fallback options
    }
  }
  
  // In development, Yahoo Finance works via Vite proxy
  if (import.meta.env.DEV) {
    try {
      const result = await fetchYahooFinance(symbol, interval, range);
      return result;
    } catch (error) {
      errors.push(`Yahoo: ${error.message}`);
    }
  }
  
  // In production, prioritize Finnhub (no CORS issues) for basic quote data
  // Then fall back to Yahoo Finance via CORS proxy
  
  // If user selected a specific API, respect that choice
  if (preferredApi === 'yahoo') {
    try {
      const result = await fetchYahooFinance(symbol, interval, range);
      return result;
    } catch (error) {
      errors.push(`Yahoo: ${error.message}`);
    }
  } else if (preferredApi === 'finnhub') {
    try {
      const result = await fetchFinnhub(symbol);
      return result;
    } catch (error) {
      errors.push(`Finnhub: ${error.message}`);
    }
  }
  
  // Auto mode or fallback: Try all APIs
  // For production, Finnhub is more reliable since it doesn't need CORS proxy
  // But only if we don't need historical data (prioritizeYahoo = false)
  if (!import.meta.env.DEV && !prioritizeYahoo) {
    // Try Finnhub first in production (no CORS issues) for basic quotes
    try {
      const result = await fetchFinnhub(symbol);
      return result;
    } catch (error) {
      errors.push(`Finnhub: ${error.message}`);
    }
  }
  
  // Try Yahoo Finance (may work with CORS proxies)
  try {
    const result = await fetchYahooFinance(symbol, interval, range);
    return result;
  } catch (error) {
    errors.push(`Yahoo: ${error.message}`);
  }
  
  // If in development and Yahoo failed, try Finnhub as last resort
  if (import.meta.env.DEV) {
    try {
      const result = await fetchFinnhub(symbol);
      return result;
    } catch (error) {
      errors.push(`Finnhub: ${error.message}`);
    }
  }
  
  // All APIs failed
  throw new Error(`All APIs failed for ${symbol}`);
};

// Convert Yahoo Finance data to monitor format
const convertYahooToMonitor = (symbol, yahooData) => {
  if (!yahooData?.chart?.result?.[0]) {
    throw new Error('Invalid data format from Yahoo Finance');
  }
  
  const result = yahooData.chart.result[0];
  const meta = result.meta;
  const quote = result.indicators?.quote?.[0];
  
  const currentPrice = meta.regularMarketPrice || meta.previousClose || 0;
  const previousClose = meta.previousClose || currentPrice;
  const change = currentPrice - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;
  
  // Calculate response time based on market status
  const isMarketOpen = meta.marketState === 'REGULAR';
  const responseTime = isMarketOpen ? Math.floor(Math.random() * 200) + 50 : 0;
  
  // Determine status based on market data
  let status = 'operational';
  if (!isMarketOpen) {
    status = 'paused';
  } else if (Math.abs(changePercent) > 5) {
    status = 'degraded';
  }
  
  return {
    id: symbol,
    name: `${meta.shortName || symbol} (${symbol})`,
    url: `https://finance.yahoo.com/quote/${symbol}`,
    type: 'http',
    status: status,
    isUp: isMarketOpen,
    responseTime: responseTime,
    avgResponseTime: responseTime,
    uptime: 99.9,
    uptimePercent: 99.9,
    lastCheck: new Date().toISOString(),
    paused: !isMarketOpen,
    // Additional Yahoo Finance data
    price: currentPrice,
    change: change,
    changePercent: changePercent,
    volume: meta.regularMarketVolume || 0,
    marketState: meta.marketState,
    symbol: symbol,
    apiSource: 'yahoo',
  };
};

// Convert Finnhub data to monitor format
const convertFinnhubToMonitor = (symbol, finnhubData) => {
  if (!finnhubData || finnhubData.c === null || finnhubData.c === undefined) {
    throw new Error('Invalid data format from Finnhub');
  }
  
  const currentPrice = finnhubData.c || 0;
  const previousClose = finnhubData.pc || currentPrice;
  const change = currentPrice - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;
  
  // Finnhub doesn't provide market state, so we'll assume market is open if price changed
  const isMarketOpen = finnhubData.t && finnhubData.t > 0;
  const responseTime = isMarketOpen ? Math.floor(Math.random() * 200) + 50 : 0;
  
  // Determine status based on market data
  let status = 'operational';
  if (!isMarketOpen) {
    status = 'paused';
  } else if (Math.abs(changePercent) > 5) {
    status = 'degraded';
  }
  
  return {
    id: symbol,
    name: `${symbol} (${symbol})`,
    url: `https://finance.yahoo.com/quote/${symbol}`,
    type: 'http',
    status: status,
    isUp: isMarketOpen,
    responseTime: responseTime,
    avgResponseTime: responseTime,
    uptime: 99.9,
    uptimePercent: 99.9,
    lastCheck: new Date().toISOString(),
    paused: !isMarketOpen,
    // Additional Finnhub data
    price: currentPrice,
    change: change,
    changePercent: changePercent,
    volume: finnhubData.v || 0,
    marketState: isMarketOpen ? 'REGULAR' : 'CLOSED',
    symbol: symbol,
    apiSource: 'finnhub',
  };
};

// Convert Massive data to monitor format
const convertMassiveToMonitor = (symbol, massiveData) => {
  if (!massiveData || massiveData.c === null || massiveData.c === undefined) {
    throw new Error('Invalid data format from Massive');
  }
  
  const currentPrice = massiveData.c || 0;
  const previousClose = massiveData.pc || currentPrice;
  const change = currentPrice - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;
  
  // Massive API - assume market is open if timestamp is recent
  const isMarketOpen = massiveData.t && massiveData.t > 0;
  const responseTime = isMarketOpen ? Math.floor(Math.random() * 200) + 50 : 0;
  
  // Determine status based on market data
  let status = 'operational';
  if (!isMarketOpen) {
    status = 'paused';
  } else if (Math.abs(changePercent) > 5) {
    status = 'degraded';
  }
  
  return {
    id: symbol,
    name: `${symbol} (${symbol})`,
    url: `https://finance.yahoo.com/quote/${symbol}`,
    type: 'http',
    status: status,
    isUp: isMarketOpen,
    responseTime: responseTime,
    avgResponseTime: responseTime,
    uptime: 99.9,
    uptimePercent: 99.9,
    lastCheck: new Date().toISOString(),
    paused: !isMarketOpen,
    // Additional Massive data
    price: currentPrice,
    change: change,
    changePercent: changePercent,
    volume: massiveData.v || 0,
    marketState: isMarketOpen ? 'REGULAR' : 'CLOSED',
    symbol: symbol,
    apiSource: 'massive',
  };
};

// Unified convert function
const convertToMonitor = (symbol, apiResult) => {
  if (apiResult.source === 'finnhub') {
    return convertFinnhubToMonitor(symbol, apiResult.data);
  } else if (apiResult.source === 'massive') {
    return convertMassiveToMonitor(symbol, apiResult.data);
  } else {
    return convertYahooToMonitor(symbol, apiResult.data);
  }
};

// Read from storage (adapter or localStorage)
const getStorageValue = async (key) => {
  try {
    if (storageAdapter?.getItem) {
      return await storageAdapter.getItem(key);
    }
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  } catch (error) {
    console.error(`Error loading ${key}:`, error);
    return null;
  }
};

const setStorageValue = async (key, value) => {
  try {
    if (storageAdapter?.setItem) {
      await storageAdapter.setItem(key, value);
      return;
    }
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value ?? null));
  } catch (error) {
    console.error(`Error saving ${key}:`, error);
  }
};

// Get all monitors (default popular stocks + custom monitors)
export const getMonitors = async () => {
  try {
    let defaultSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
    const savedSymbols = await getStorageValue(STORAGE_KEYS.DEFAULT_SYMBOLS);
    if (Array.isArray(savedSymbols) && savedSymbols.length > 0) {
      defaultSymbols = savedSymbols;
    }

    let deletedMonitors = [];
    const savedDeleted = await getStorageValue(STORAGE_KEYS.DELETED_MONITORS);
    if (Array.isArray(savedDeleted)) {
      deletedMonitors = savedDeleted;
    }
    
    // Filter out deleted monitors
    const activeSymbols = defaultSymbols.filter(symbol => !deletedMonitors.includes(symbol));
    
    // Fetch data for all symbols in parallel with automatic fallback
    const promises = activeSymbols.map(symbol => 
      fetchMarketData(symbol, '1d', '1d').then(result => convertToMonitor(symbol, result))
        .catch(error => {
          console.error(`Failed to fetch ${symbol}:`, error);
          // Return a fallback monitor
          return {
            id: symbol,
            name: `${symbol}`,
            url: `https://finance.yahoo.com/quote/${symbol}`,
            type: 'http',
            status: 'down',
            isUp: false,
            responseTime: 0,
            avgResponseTime: 0,
            uptime: 0,
            uptimePercent: 0,
            lastCheck: new Date().toISOString(),
            paused: false,
            symbol: symbol,
            apiSource: 'none',
          };
        })
    );
    
    const monitors = await Promise.all(promises);
    return monitors.filter(m => m !== null);
  } catch (error) {
    console.error('Failed to fetch monitors:', error);
    return [];
  }
};

// Create a new monitor (add a new symbol to monitor)
export const createMonitor = async (monitorData) => {
  try {
    // Extract symbol from form data
    let symbol = monitorData.symbol;
    if (!symbol && monitorData.url) {
      // Try to extract from URL if symbol not provided
      symbol = monitorData.url.split('/').pop()?.toUpperCase().replace(/[^A-Z]/g, '');
    }
    if (!symbol) {
      throw new Error('Stock symbol is required');
    }
    symbol = symbol.toUpperCase().trim();
    
    try {
      let deletedMonitors = [];
      const savedDeleted = await getStorageValue(STORAGE_KEYS.DELETED_MONITORS);
      if (Array.isArray(savedDeleted)) deletedMonitors = savedDeleted;
      deletedMonitors = deletedMonitors.filter(s => s !== symbol);
      await setStorageValue(STORAGE_KEYS.DELETED_MONITORS, deletedMonitors);
    } catch (error) {
      console.error('Error updating deleted monitors:', error);
    }
    
    const result = await fetchMarketData(symbol, '1d', '1d');
    const monitor = convertToMonitor(symbol, result);
    // Override name if provided
    if (monitorData.name) {
      monitor.name = monitorData.name;
    }
    
    try {
      let defaultSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
      const savedSymbols = await getStorageValue(STORAGE_KEYS.DEFAULT_SYMBOLS);
      if (Array.isArray(savedSymbols) && savedSymbols.length > 0) defaultSymbols = savedSymbols;
      if (!defaultSymbols.includes(symbol)) {
        defaultSymbols = [...defaultSymbols, symbol];
        await setStorageValue(STORAGE_KEYS.DEFAULT_SYMBOLS, defaultSymbols);
      }
    } catch (error) {
      console.error('Error saving default symbols:', error);
    }
    
    return monitor;
  } catch (error) {
    console.error('Failed to create monitor:', error);
    throw error;
  }
};

// Update a monitor
export const updateMonitor = async (id, monitorData) => {
  try {
    const symbol = monitorData.symbol || id;
    const result = await fetchMarketData(symbol, '1d', '1d');
    const monitor = convertToMonitor(symbol, result);
    return monitor;
  } catch (error) {
    console.error('Failed to update monitor:', error);
    throw error;
  }
};

// Delete a monitor (removes from storage)
export const deleteMonitor = async (id) => {
  try {
    let defaultSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
    const savedSymbols = await getStorageValue(STORAGE_KEYS.DEFAULT_SYMBOLS);
    if (Array.isArray(savedSymbols) && savedSymbols.length > 0) defaultSymbols = savedSymbols;

    let deletedMonitors = [];
    const savedDeleted = await getStorageValue(STORAGE_KEYS.DELETED_MONITORS);
    if (Array.isArray(savedDeleted)) deletedMonitors = savedDeleted;

    if (!deletedMonitors.includes(id)) {
      deletedMonitors = [...deletedMonitors, id];
      await setStorageValue(STORAGE_KEYS.DELETED_MONITORS, deletedMonitors);
    }

    const updatedSymbols = defaultSymbols.filter(symbol => symbol !== id);
    await setStorageValue(STORAGE_KEYS.DEFAULT_SYMBOLS, updatedSymbols);
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting monitor:', error);
    throw error;
  }
};

// Toggle pause status (not applicable for live data, but kept for compatibility)
export const togglePauseMonitor = async (id) => {
  // For live data, we can't really pause, but we'll return the current state
  const result = await fetchMarketData(id, '1d', '1d');
  const monitor = convertToMonitor(id, result);
  return monitor;
};

// Get response time chart data from Yahoo Finance
export const getMonitorResponseTimeChart = async (id) => {
  try {
    const result = await fetchMarketData(id, '1m', '1d');
    
    // Only Yahoo Finance provides historical chart data
    if (result.source === 'finnhub') {
      // Finnhub doesn't provide historical data in free tier, return empty
      return [];
    }
    
    const data = result.data;
    if (!data?.chart?.result?.[0]) {
      throw new Error('Invalid data format');
    }
    
    const chartResult = data.chart.result[0];
    const timestamps = chartResult.timestamp || [];
    const quotes = chartResult.indicators?.quote?.[0];
    const closes = quotes?.close || [];
    
    // Convert to chart format
    return timestamps.map((timestamp, index) => ({
      time: new Date(timestamp * 1000).toISOString(),
      timestamp: new Date(timestamp * 1000).toISOString(),
      value: closes[index] || 0,
      responseTime: closes[index] || 0,
    }));
  } catch (error) {
    console.error('Failed to fetch chart data:', error);
    // Return empty data
    return [];
  }
};

// Get uptime chart data
export const getMonitorUptimeChart = async (id) => {
  // For Yahoo Finance, uptime is always high, so we'll use price data
  return getMonitorResponseTimeChart(id);
};

// Get monitor history
export const getMonitorHistory = async (id) => {
  try {
    const result = await fetchMarketData(id, '5m', '1d');
    
    // Only Yahoo Finance provides historical chart data
    if (result.source === 'finnhub') {
      // Finnhub doesn't provide historical data in free tier, return empty
      return [];
    }
    
    const data = result.data;
    if (!data?.chart?.result?.[0]) {
      throw new Error('Invalid data format');
    }
    
    const chartResult = data.chart.result[0];
    const timestamps = chartResult.timestamp || [];
    const quotes = chartResult.indicators?.quote?.[0];
    const closes = quotes?.close || [];
    const volumes = quotes?.volume || [];
    
    return timestamps.map((timestamp, index) => ({
      time: new Date(timestamp * 1000).toISOString(),
      timestamp: new Date(timestamp * 1000).toISOString(),
      status: closes[index] ? 'up' : 'down',
      responseTime: closes[index] || 0,
      volume: volumes[index] || 0,
    }));
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return [];
  }
};

// Get latest downtime period info
export const getMonitorDowntime = async (id) => {
  // For live data, we don't track downtime the same way
  return {
    start: null,
    end: null,
    duration: 0,
  };
};

// Legacy function name for compatibility
export const getMonitorChartData = async (id, type = 'response-time') => {
  if (type === 'uptime') {
    return getMonitorUptimeChart(id);
  }
  return getMonitorResponseTimeChart(id);
};

// Get price chart data for Charts page
export const getPriceChartData = async (symbol, interval = '1d') => {
  try {
    // Map intervals to Yahoo Finance format
    let yahooInterval = '1d';
    let range = '1mo'; // 1 month for daily data
    
    if (interval === '1H' || interval === '1h') {
      yahooInterval = '1h';
      range = '1d'; // 1 day for hourly data
    } else if (interval === '1D' || interval === '1d') {
      yahooInterval = '1d';
      range = '1mo'; // 1 month for daily data
    }
    
    // prioritizeYahoo = true because we need historical data for charts
    // Finnhub only provides current quote, not historical data
    const result = await fetchMarketData(symbol, yahooInterval, range, true);
    
    // Only Yahoo Finance provides historical chart data
    if (result.source === 'finnhub') {
      // For Finnhub, we can only get current quote, not historical
      // Return minimal data with current price
      const finnhubData = result.data;
      return {
        symbol: symbol,
        currentPrice: finnhubData.c || 0,
        data: [{
          time: new Date().toISOString(),
          timestamp: Date.now(),
          open: finnhubData.o || finnhubData.c || 0,
          high: finnhubData.h || finnhubData.c || 0,
          low: finnhubData.l || finnhubData.c || 0,
          close: finnhubData.c || 0,
          volume: finnhubData.v || 0,
        }],
      };
    }
    
    const data = result.data;
    if (!data?.chart?.result?.[0]) {
      throw new Error('Invalid data format from API');
    }
    
    const chartResult = data.chart.result[0];
    const timestamps = chartResult.timestamp || [];
    const quotes = chartResult.indicators?.quote?.[0];
    
    if (!quotes) {
      throw new Error('No quote data available');
    }
    
    const closes = quotes.close || [];
    const opens = quotes.open || [];
    const highs = quotes.high || [];
    const lows = quotes.low || [];
    const volumes = quotes.volume || [];
    
    // Validate we have data
    if (timestamps.length === 0 || closes.length === 0) {
      throw new Error('No historical data available for this symbol');
    }
    
    // Get meta data for current price
    const meta = chartResult.meta;
    const currentPrice = meta?.regularMarketPrice || meta?.previousClose || closes[closes.length - 1] || 0;
    
    // Build data array, ensuring all arrays are aligned
    const chartData = [];
    const maxLength = Math.min(timestamps.length, closes.length);
    
    for (let i = 0; i < maxLength; i++) {
      const timestamp = timestamps[i];
      const close = closes[i];
      
      // Only include data points with valid timestamp and close price
      if (timestamp && close !== null && close !== undefined && !isNaN(close)) {
        chartData.push({
          time: new Date(timestamp * 1000).toISOString(),
          timestamp: timestamp * 1000,
          open: opens[i] !== null && opens[i] !== undefined ? opens[i] : close,
          high: highs[i] !== null && highs[i] !== undefined ? highs[i] : close,
          low: lows[i] !== null && lows[i] !== undefined ? lows[i] : close,
          close: close,
          volume: volumes[i] !== null && volumes[i] !== undefined ? volumes[i] : 0,
        });
      }
    }
    
    if (chartData.length === 0) {
      throw new Error('No valid price data points found');
    }
    
    return {
      symbol: symbol,
      currentPrice: currentPrice,
      data: chartData,
    };
  } catch (error) {
    console.error('Failed to fetch price chart data:', error);
    throw error;
  }
};
