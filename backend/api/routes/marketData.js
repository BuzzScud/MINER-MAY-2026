import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function sanitizeSymbol(rawSymbol) {
  const normalizedSymbol = String(rawSymbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,20}$/.test(normalizedSymbol)) {
    return null;
  }
  return normalizedSymbol;
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: abortController.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { response, json, text };
  } finally {
    clearTimeout(timeoutId);
  }
}

router.get('/finnhub/quote', requireAuth, async (req, res) => {
  try {
    const symbol = sanitizeSymbol(req.query.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }

    const finnhubApiKey = process.env.FINNHUB_API_KEY;
    if (!finnhubApiKey) {
      return res.status(503).json({ error: 'FINNHUB_API_KEY is not configured' });
    }

    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubApiKey)}`;
    const { response, json, text } = await fetchJsonWithTimeout(url);
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Finnhub request failed',
        details: typeof json === 'object' && json ? json : text?.slice(0, 200),
      });
    }
    return res.json({ source: 'finnhub', data: json });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Finnhub proxy failed' });
  }
});

router.get('/massive/snapshot', requireAuth, async (req, res) => {
  try {
    const symbol = sanitizeSymbol(req.query.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }

    const massiveApiKey = process.env.MASSIVE_API_KEY;
    if (!massiveApiKey) {
      return res.status(503).json({ error: 'MASSIVE_API_KEY is not configured' });
    }

    const url = `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${encodeURIComponent(massiveApiKey)}`;
    const { response, json, text } = await fetchJsonWithTimeout(url);
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Massive request failed',
        details: typeof json === 'object' && json ? json : text?.slice(0, 200),
      });
    }
    return res.json({ source: 'massive', data: json });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Massive proxy failed' });
  }
});

router.get('/health-check', requireAuth, async (req, res) => {
  try {
    const provider = String(req.query.provider || '').trim().toLowerCase();
    const symbol = sanitizeSymbol(req.query.symbol || 'QQQ');
    if (!symbol) {
      return res.status(400).json({ error: 'Invalid symbol' });
    }

    if (provider === 'finnhub') {
      const finnhubApiKey = process.env.FINNHUB_API_KEY;
      if (!finnhubApiKey) {
        return res.status(503).json({ error: 'FINNHUB_API_KEY is not configured' });
      }
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(finnhubApiKey)}`;
      const { response } = await fetchJsonWithTimeout(url);
      return res.status(response.ok ? 200 : 502).json({ ok: response.ok, provider: 'finnhub', status: response.status });
    }

    if (provider === 'massive') {
      const massiveApiKey = process.env.MASSIVE_API_KEY;
      if (!massiveApiKey) {
        return res.status(503).json({ error: 'MASSIVE_API_KEY is not configured' });
      }
      const url = `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev?apiKey=${encodeURIComponent(massiveApiKey)}`;
      const { response } = await fetchJsonWithTimeout(url);
      return res.status(response.ok ? 200 : 502).json({ ok: response.ok, provider: 'massive', status: response.status });
    }

    return res.status(400).json({ error: 'provider must be finnhub or massive' });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Health check failed' });
  }
});

export default router;
