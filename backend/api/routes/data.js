import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

async function getEmergencyLogoutGeneration() {
  const r = await pool.query('SELECT generation FROM emergency_logout WHERE id = 1');
  return r.rows[0]?.generation ?? 0;
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.is_admin) {
      const currentGen = await getEmergencyLogoutGeneration();
      const tokenGen = decoded.logout_gen ?? 0;
      if (currentGen > tokenGen) {
        return res.status(401).json({ error: 'Session invalidated by administrator' });
      }
    }
    req.userId = decoded.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { keys } = req.query;
    const userId = req.userId;
    let result;
    if (keys) {
      const keyList = String(keys).split(',').map((k) => k.trim()).filter(Boolean);
      if (keyList.length === 0) {
        return res.json({});
      }
      result = await pool.query(
        'SELECT key, value FROM app_data WHERE user_id = $1 AND key = ANY($2)',
        [userId, keyList]
      );
    } else {
      result = await pool.query(
        'SELECT key, value FROM app_data WHERE user_id = $1',
        [userId]
      );
    }
    const data = {};
    for (const row of result.rows) {
      data[row.key] = row.value;
    }
    res.json(data);
  } catch (err) {
    console.error('Data GET error:', err);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const userId = req.userId;
    if (!key || key.length > 100) {
      return res.status(400).json({ error: 'Invalid key' });
    }
    const valueJson = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    await pool.query(
      `INSERT INTO app_data (user_id, key, value, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $3::jsonb, updated_at = now()`,
      [userId, key, valueJson]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Data PUT error:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const { updates } = req.body;
    const userId = req.userId;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid updates' });
    }
    for (const [key, value] of Object.entries(updates)) {
      if (!key || key.length > 100) continue;
      const valueJson = typeof value === 'string' ? value : JSON.stringify(value ?? null);
      await pool.query(
        `INSERT INTO app_data (user_id, key, value, updated_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (user_id, key) DO UPDATE SET value = $3::jsonb, updated_at = now()`,
        [userId, key, valueJson]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Data batch error:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

export default router;
