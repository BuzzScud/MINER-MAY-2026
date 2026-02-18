/**
 * Smoke test for QuantBot Trading Bot API (port 8080).
 * Run when the backend is already running: node scripts/smoke-trading-bot-api.js
 * Exits 0 if all checked endpoints respond; non-zero otherwise.
 */

const BASE = 'http://127.0.0.1:8080';

async function request(method, path, body = null) {
  const url = `${BASE}${path}`;
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body != null) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  let failed = 0;

  const stateRes = await request('GET', '/api/state');
  if (!stateRes.ok) {
    console.error('GET /api/state failed:', stateRes.status, stateRes.data);
    failed++;
  } else {
    console.log('GET /api/state OK');
  }

  const tfRes = await request('POST', '/api/timeframe', { interval: '15m' });
  if (!tfRes.ok || !tfRes.data?.ok) {
    console.error('POST /api/timeframe 15m failed:', tfRes.status, tfRes.data);
    failed++;
  } else {
    console.log('POST /api/timeframe 15m OK');
  }

  const feedRes = await request('POST', '/api/feed', { provider: 'yahoo' });
  if (!feedRes.ok || !feedRes.data?.ok) {
    console.error('POST /api/feed yahoo failed:', feedRes.status, feedRes.data);
    failed++;
  } else {
    console.log('POST /api/feed yahoo OK');
  }

  const symbolsRes = await request('POST', '/api/symbols', { action: 'remove', symbol: 'GBPUSD' });
  if (!symbolsRes.ok) {
    console.error('POST /api/symbols remove failed:', symbolsRes.status, symbolsRes.data);
    failed++;
  } else {
    console.log('POST /api/symbols remove OK');
  }
  const addBack = await request('POST', '/api/symbols', { action: 'add', symbol: 'GBPUSD' });
  if (!addBack.ok) console.error('POST /api/symbols add GBPUSD failed (non-fatal):', addBack.status);

  if (failed) {
    console.error('Smoke test failed:', failed, 'check(s)');
    process.exit(1);
  }
  console.log('Smoke test passed.');
}

main().catch((err) => {
  console.error('Smoke test error:', err.message);
  console.error('Is the QuantBot server running on port 8080? Start it with: npm run trading-bot:server');
  process.exit(1);
});
