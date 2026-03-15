import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function getClientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || null;
}

async function logLoginAttempt(username, success, req) {
  try {
    const ip = getClientIp(req);
    await pool.query(
      'INSERT INTO login_attempts (username, success, ip_address) VALUES ($1, $2, $3)',
      [username ?? null, !!success, ip]
    );
  } catch (e) {
    console.error('Login attempt log error:', e.message);
  }
}

async function getEmergencyLogoutGeneration() {
  const r = await pool.query('SELECT generation FROM emergency_logout WHERE id = 1');
  return r.rows[0]?.generation ?? 0;
}

function generateToken(user, logoutGen) {
  const payload = {
    id: user.id,
    username: user.username,
    is_admin: user.is_admin,
    logout_gen: logoutGen,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const usernameTrimmed = String(username).trim();
    if (usernameTrimmed.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const password_hash = await bcrypt.hash(String(password), 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, created_at, is_admin, is_active, can_access_dashboard, can_register, can_edit_own_profile`,
      [usernameTrimmed, password_hash]
    );
    const user = result.rows[0];
    const logoutGen = await getEmergencyLogoutGeneration();
    const token = generateToken(user, logoutGen);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already taken' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const usernameTrimmed = String(username).trim();
    const result = await pool.query(
      `SELECT id, username, password_hash, is_admin, is_active, can_access_dashboard, can_register, can_edit_own_profile
       FROM users WHERE LOWER(username) = LOWER($1)`,
      [usernameTrimmed]
    );
    const user = result.rows[0];
    if (!user) {
      await logLoginAttempt(usernameTrimmed, false, req);
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (!user.is_active) {
      await logLoginAttempt(usernameTrimmed, false, req);
      return res.status(401).json({ error: 'Account is disabled' });
    }
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      await logLoginAttempt(usernameTrimmed, false, req);
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const maintenanceRow = await pool.query(
      'SELECT value FROM system_settings WHERE key = $1',
      ['maintenance_mode']
    );
    const maintenanceMode = maintenanceRow.rows[0]?.value === true;
    if (maintenanceMode && !user.is_admin) {
      await logLoginAttempt(usernameTrimmed, false, req);
      return res.status(503).json({ error: 'Maintenance in progress. Try again later.' });
    }
    await logLoginAttempt(usernameTrimmed, true, req);
    const logoutGen = await getEmergencyLogoutGeneration();
    const token = generateToken(user, logoutGen);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
      },
    });
  } catch (err) {
    const usernameAttempt = req.body?.username ? String(req.body.username).trim() : null;
    if (usernameAttempt) logLoginAttempt(usernameAttempt, false, req).catch(() => {});
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = auth.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      `SELECT id, username, created_at, is_admin, is_active, can_access_dashboard, can_register, can_edit_own_profile
       FROM users WHERE id = $1`,
      [decoded.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.is_active) return res.status(401).json({ error: 'Account is disabled' });
    if (!user.is_admin) {
      const currentGen = await getEmergencyLogoutGeneration();
      const tokenGen = decoded.logout_gen ?? 0;
      if (currentGen > tokenGen) {
        return res.status(401).json({ error: 'Session invalidated by administrator' });
      }
    }
    res.json({
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
      },
    });
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

export default router;
