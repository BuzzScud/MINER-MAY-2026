/**
 * Smoke test for Budget Tracker persistence via the Auth/API backend.
 *
 * Usage:
 *   node scripts/smoke-budget-tracker.js --username admin --password 'YOUR_PASSWORD'
 *
 * Optional:
 *   --base http://localhost:4000
 *   --min  1
 */

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

const base = getArg('--base') || process.env.SMOKE_BASE || 'http://localhost:4000';
const username = getArg('--username') || process.env.SMOKE_USERNAME || 'admin';
const password = getArg('--password') || process.env.SMOKE_PASSWORD || null;
const min = Number(getArg('--min') || process.env.SMOKE_MIN || '1');

async function request(method, path, body = null, headers = {}) {
  const url = `${base}${path}`;
  const options = { method, headers: { ...headers } };
  if (body != null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  if (!password) {
    console.error('Missing password. Provide --password or SMOKE_PASSWORD.');
    process.exit(2);
  }

  const login = await request('POST', '/api/auth/login', { username, password });
  if (!login.ok || !login.data?.token) {
    console.error('Login failed:', login.status, login.data);
    process.exit(1);
  }
  console.log('Login OK');

  const token = login.data.token;
  const authz = { Authorization: `Bearer ${token}` };

  const load1 = await request('GET', '/api/data?keys=budgetTracker_reminders', null, authz);
  if (!load1.ok) {
    console.error('Load reminders failed:', load1.status, load1.data);
    process.exit(1);
  }

  const bills1 = load1.data?.budgetTracker_reminders;
  if (!Array.isArray(bills1)) {
    console.error('Reminders not an array:', load1.data);
    process.exit(1);
  }
  console.log('Bills loaded:', bills1.length);
  if (bills1.length < min) {
    console.error(`Expected at least ${min} bill(s), got ${bills1.length}.`);
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 3000));

  const load2 = await request('GET', '/api/data?keys=budgetTracker_reminders', null, authz);
  if (!load2.ok) {
    console.error('Reload reminders failed:', load2.status, load2.data);
    process.exit(1);
  }
  const bills2 = load2.data?.budgetTracker_reminders;
  if (!Array.isArray(bills2)) {
    console.error('Reload reminders not an array:', load2.data);
    process.exit(1);
  }

  console.log('Bills after 3s:', bills2.length);
  if (bills2.length !== bills1.length) {
    console.error('Bill count changed after delay (possible overwrite):', bills1.length, '->', bills2.length);
    process.exit(1);
  }

  console.log('Budget Tracker smoke test passed.');
}

main().catch((err) => {
  console.error('Smoke test error:', err?.message || String(err));
  process.exit(1);
});

