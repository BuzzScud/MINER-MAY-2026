import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';
import { startTime } from '../startTime.js';
import { extractAuthToken } from '../utils/authCookie.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

async function adminRequired(req, res, next) {
  const token = extractAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const r = await pool.query(
      'SELECT id, username, is_admin FROM users WHERE id = $1',
      [decoded.id]
    );
    const user = r.rows[0];
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.userId = user.id;
    req.username = user.username;
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function getClientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || null;
}

async function logActivity(req) {
  try {
    const ipAddress = getClientIp(req);
    await pool.query(
      `INSERT INTO user_activity (user_id, username, route, method, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.userId,
        req.username || 'unknown',
        req.path || req.url || '',
        req.method || 'GET',
        ipAddress,
      ]
    );
  } catch (e) {
    console.error('Activity log error:', e.message);
  }
}

router.use(adminRequired);

router.get('/stats', async (req, res) => {
  await logActivity(req);
  try {
    const totalResult = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const totalUsers = totalResult.rows[0]?.count ?? 0;
    const newResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE created_at >= now() - interval '7 days'`
    );
    const newUsers7d = newResult.rows[0]?.count ?? 0;
    const start = Date.now();
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - start;
    const dbUri = process.env.DATABASE_URL || '';
    const databaseType = dbUri.includes('postgresql') ? 'PostgreSQL' : dbUri.includes('sqlite') ? 'SQLite' : 'Unknown';

    const dbMetrics = { databaseType, latencyMs, connected: true };
    let appDataRowCount = 0;
    let appDataSizeBytes = 0;
    let recentActivity = [];

    if (databaseType === 'PostgreSQL') {
      try {
        const versionResult = await pool.query('SELECT version() AS v');
        dbMetrics.version = versionResult.rows[0]?.v ?? null;
        const connResult = await pool.query('SELECT count(*)::int AS n FROM pg_stat_activity');
        dbMetrics.activeConnections = connResult.rows[0]?.n ?? null;
        const sizeResult = await pool.query('SELECT pg_database_size(current_database()) AS size');
        dbMetrics.databaseSizeBytes = sizeResult.rows[0]?.size ?? null;
        const appDataCountResult = await pool.query('SELECT count(*)::int AS count FROM app_data');
        appDataRowCount = appDataCountResult.rows[0]?.count ?? 0;
        const appDataSizeResult = await pool.query("SELECT pg_total_relation_size('app_data')::bigint AS size");
        appDataSizeBytes = Number(appDataSizeResult.rows[0]?.size ?? 0);
      } catch (metricsErr) {
        console.error('DB metrics error:', metricsErr.message);
      }
    }

    try {
      const activityResult = await pool.query(
        `SELECT id, user_id, username, route, method, timestamp, ip_address
         FROM user_activity ORDER BY timestamp DESC LIMIT 10`
      );
      recentActivity = activityResult.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        username: row.username,
        route: row.route,
        method: row.method,
        timestamp: row.timestamp,
        ip_address: row.ip_address,
      }));
    } catch (activityErr) {
      console.error('Recent activity error:', activityErr.message);
    }

    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    res.json({
      totalUsers,
      newUsers7d,
      ...dbMetrics,
      currentTime: new Date().toISOString(),
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV || 'development',
      uptimeSeconds,
      appDataRowCount,
      appDataSizeBytes,
      recentActivity,
    });
  } catch (e) {
    console.error('Admin stats error:', e);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

async function getSystemSetting(key) {
  const r = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
  return r.rows[0]?.value ?? null;
}

async function setSystemSetting(key, value) {
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

router.get('/settings/maintenance', async (req, res) => {
  await logActivity(req);
  try {
    const raw = await getSystemSetting('maintenance_mode');
    const enabled = raw === true || raw === 'true';
    res.json({ enabled });
  } catch (e) {
    console.error('Get maintenance error:', e.message);
    res.status(500).json({ error: 'Failed to get maintenance setting' });
  }
});

router.post('/settings/maintenance', async (req, res) => {
  await logActivity(req);
  try {
    const enabled = !!req.body?.enabled;
    await setSystemSetting('maintenance_mode', enabled);
    res.json({ enabled });
  } catch (e) {
    console.error('Set maintenance error:', e.message);
    res.status(500).json({ error: 'Failed to set maintenance' });
  }
});

router.get('/settings/announcement', async (req, res) => {
  await logActivity(req);
  try {
    const raw = await getSystemSetting('announcement');
    const announcement = raw && typeof raw === 'object'
      ? { text: raw.text ?? '', active: !!raw.active }
      : { text: '', active: false };
    res.json(announcement);
  } catch (e) {
    console.error('Get announcement error:', e.message);
    res.status(500).json({ error: 'Failed to get announcement' });
  }
});

router.post('/settings/announcement', async (req, res) => {
  await logActivity(req);
  try {
    const { text, active } = req.body ?? {};
    const announcement = { text: typeof text === 'string' ? text : '', active: !!active };
    await setSystemSetting('announcement', announcement);
    res.json(announcement);
  } catch (e) {
    console.error('Set announcement error:', e.message);
    res.status(500).json({ error: 'Failed to set announcement' });
  }
});

router.get('/login-attempts', async (req, res) => {
  await logActivity(req);
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await pool.query(
      `SELECT id, username, success, ip_address, timestamp
       FROM login_attempts ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
    res.json({ attempts: result.rows });
  } catch (e) {
    console.error('Login attempts error:', e.message);
    res.status(500).json({ error: 'Failed to load login attempts' });
  }
});

router.get('/users', async (req, res) => {
  await logActivity(req);
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.per_page, 10) || 10));
    const offset = (page - 1) * perPage;
    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    const total = countResult.rows[0]?.count ?? 0;
    const result = await pool.query(
      `SELECT id, username, created_at, is_admin, is_active, can_access_dashboard, can_register, can_edit_own_profile
       FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [perPage, offset]
    );
    res.json({
      users: result.rows,
      pagination: { page, perPage, total },
    });
  } catch (e) {
    console.error('Admin users list error:', e);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.post('/users', async (req, res) => {
  await logActivity(req);
  try {
    const { username, password, is_admin } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const usernameTrimmed = username.trim();
    const hash = await bcrypt.hash(String(password), 10);
    const isAdmin = !!is_admin;
    await pool.query(
      'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3)',
      [usernameTrimmed, hash, isAdmin]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Username already taken' });
    console.error('Admin create user error:', e);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/users/:id', async (req, res) => {
  await logActivity(req);
  try {
    const { id } = req.params;
    const userId = req.userId;
    const body = req.body || {};
    const target = await pool.query('SELECT id, username, is_admin FROM users WHERE id = $1', [id]);
    const user = target.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.username === 'admin') return res.status(403).json({ error: 'Cannot modify admin user' });
    const updates = [];
    const values = [];
    let v = 1;
    if (body.username !== undefined) {
      const u = String(body.username).trim();
      if (u.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
      updates.push(`username = $${v++}`);
      values.push(u);
    }
    if (body.password !== undefined && body.password !== '') {
      if (String(body.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const hash = await bcrypt.hash(String(body.password), 10);
      updates.push(`password_hash = $${v++}`);
      values.push(hash);
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = $${v++}`);
      values.push(!!body.is_active);
    }
    if (body.can_access_dashboard !== undefined) {
      updates.push(`can_access_dashboard = $${v++}`);
      values.push(!!body.can_access_dashboard);
    }
    if (body.can_register !== undefined) {
      updates.push(`can_register = $${v++}`);
      values.push(!!body.can_register);
    }
    if (body.can_edit_own_profile !== undefined) {
      updates.push(`can_edit_own_profile = $${v++}`);
      values.push(!!body.can_edit_own_profile);
    }
    if (body.is_admin !== undefined) {
      updates.push(`is_admin = $${v++}`);
      values.push(!!body.is_admin);
    }
    if (updates.length === 0) return res.json({ ok: true });
    values.push(id);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${v}`,
      values
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Username already taken' });
    console.error('Admin update user error:', e);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/users/:id', async (req, res) => {
  await logActivity(req);
  try {
    const { id } = req.params;
    if (id === req.userId) return res.status(403).json({ error: 'Cannot delete your own user' });
    const target = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    const user = target.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.username === 'admin') return res.status(403).json({ error: 'Cannot delete admin user' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Admin delete user error:', e);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/activity', async (req, res) => {
  await logActivity(req);
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const result = await pool.query(
      `SELECT id, user_id, username, route, method, timestamp, ip_address
       FROM user_activity ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Admin activity error:', e);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

router.post('/activity/clear', async (req, res) => {
  await logActivity(req);
  try {
    await pool.query('DELETE FROM user_activity');
    res.json({ ok: true });
  } catch (e) {
    console.error('Admin activity clear error:', e);
    res.status(500).json({ error: 'Failed to clear activity' });
  }
});

const DEPENDENCY_CHECK_TIMEOUT_MS = 2500;
const DEPENDENCY_CACHE_MS = 45000;
let dependencyCache = { result: null, at: 0 };

async function checkService(url, name) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEPENDENCY_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, method: 'GET' });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    return { name, up: res.ok, latencyMs };
  } catch {
    clearTimeout(timeout);
    return { name, up: false, latencyMs: Date.now() - start };
  }
}

router.get('/dependencies', async (req, res) => {
  await logActivity(req);
  const now = Date.now();
  if (dependencyCache.result && now - dependencyCache.at < DEPENDENCY_CACHE_MS) {
    return res.json(dependencyCache.result);
  }
  try {
    const services = [
      { url: 'http://127.0.0.1:8080/', name: 'Trading Bot (8080)' },
      { url: 'http://127.0.0.1:5001/', name: 'Miner (5001)' },
      { url: 'http://127.0.0.1:4000/api/health', name: 'API (4000)' },
    ];
    const results = await Promise.all(services.map((s) => checkService(s.url, s.name)));
    const payload = results;
    dependencyCache = { result: payload, at: now };
    res.json(payload);
  } catch (e) {
    console.error('Dependencies check error:', e.message);
    res.status(500).json({ error: 'Failed to check dependencies' });
  }
});

router.get('/rate-limits', async (req, res) => {
  await logActivity(req);
  res.json({
    limits: [
      {
        id: 'api-general',
        window_ms: 15 * 60 * 1000,
        max_requests: 100,
        scope: '/api/*',
      },
      {
        id: 'auth-login',
        window_ms: 15 * 60 * 1000,
        max_requests: 5,
        scope: '/api/auth/login',
      },
      {
        id: 'auth-register',
        window_ms: 15 * 60 * 1000,
        max_requests: 5,
        scope: '/api/auth/register',
      },
    ],
  });
});

function escapeCsvCell(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const EXPORT_ACTIVITY_LIMIT = 10000;

router.get('/export/users', async (req, res) => {
  await logActivity(req);
  const wantsCsv = req.query.format === 'csv' || req.get('accept')?.includes('text/csv');
  if (!wantsCsv) {
    return res.status(400).json({ error: 'Use ?format=csv or Accept: text/csv' });
  }
  try {
    const result = await pool.query(
      `SELECT id, username, created_at, is_admin, is_active
       FROM users ORDER BY created_at DESC`
    );
    const headers = ['id', 'username', 'created_at', 'is_admin', 'is_active'];
    const lines = [headers.join(',')];
    for (const row of result.rows) {
      lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    console.error('Export users error:', e.message);
    res.status(500).json({ error: 'Failed to export users' });
  }
});

router.get('/export/activity', async (req, res) => {
  await logActivity(req);
  const wantsCsv = req.query.format === 'csv' || req.get('accept')?.includes('text/csv');
  if (!wantsCsv) {
    return res.status(400).json({ error: 'Use ?format=csv or Accept: text/csv' });
  }
  try {
    const from = req.query.from;
    const to = req.query.to;
    let query = `SELECT id, user_id, username, route, method, timestamp, ip_address
                 FROM user_activity`;
    const params = [];
    const conditions = [];
    let paramIndex = 1;
    if (from) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(to);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY timestamp DESC LIMIT $' + paramIndex;
    params.push(EXPORT_ACTIVITY_LIMIT);
    const result = await pool.query(query, params);
    const headers = ['id', 'user_id', 'username', 'route', 'method', 'timestamp', 'ip_address'];
    const lines = [headers.join(',')];
    for (const row of result.rows) {
      lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="activity.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    console.error('Export activity error:', e.message);
    res.status(500).json({ error: 'Failed to export activity' });
  }
});

router.post('/emergency-logout', async (req, res) => {
  await logActivity(req);
  try {
    await pool.query(
      `INSERT INTO emergency_logout (id, generation) VALUES (1, 1)
       ON CONFLICT (id) DO UPDATE SET generation = emergency_logout.generation + 1`
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Emergency logout error:', e);
    res.status(500).json({ error: 'Failed to update emergency logout' });
  }
});

router.post('/restart-server', async (req, res) => {
  await logActivity(req);
  try {
    await pool.query(
      `INSERT INTO emergency_logout (id, generation) VALUES (1, 1)
       ON CONFLICT (id) DO UPDATE SET generation = emergency_logout.generation + 1`
    );
    res.json({ ok: true });
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction) {
      const serverPath = path.join(__dirname, '../server.js');
      const now = Date.now() / 1000;
      try {
        fs.utimesSync(serverPath, now, now);
      } catch (touchErr) {
        console.error('Restart touch error:', touchErr.message);
      }
      return;
    }
    const apiDir = path.join(__dirname, '..');
    const scriptPath = path.join(__dirname, '../scripts/restart-after-exit.js');
    const child = spawn(process.execPath, [scriptPath], {
      detached: true,
      stdio: 'ignore',
      cwd: apiDir,
    });
    child.unref();
    setTimeout(() => process.exit(0), 2000);
  } catch (e) {
    console.error('Restart server error:', e);
    res.status(500).json({ error: 'Failed to prepare restart' });
  }
});

export default router;
