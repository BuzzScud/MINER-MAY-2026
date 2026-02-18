import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

async function adminRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = auth.slice(7);
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
    if (databaseType === 'PostgreSQL') {
      try {
        const versionResult = await pool.query('SELECT version() AS v');
        dbMetrics.version = versionResult.rows[0]?.v ?? null;
        const connResult = await pool.query('SELECT count(*)::int AS n FROM pg_stat_activity');
        dbMetrics.activeConnections = connResult.rows[0]?.n ?? null;
        const sizeResult = await pool.query('SELECT pg_database_size(current_database()) AS size');
        dbMetrics.databaseSizeBytes = sizeResult.rows[0]?.size ?? null;
      } catch (metricsErr) {
        console.error('DB metrics error:', metricsErr.message);
      }
    }

    res.json({
      totalUsers,
      newUsers7d,
      ...dbMetrics,
      currentTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Admin stats error:', e);
    res.status(500).json({ error: 'Failed to load stats' });
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

export default router;
