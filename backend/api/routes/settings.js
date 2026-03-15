import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

async function getSetting(key) {
  const r = await pool.query(
    'SELECT value FROM system_settings WHERE key = $1',
    [key]
  );
  const row = r.rows[0];
  return row ? row.value : null;
}

router.get('/public', async (req, res) => {
  try {
    const maintenance = await getSetting('maintenance_mode');
    const announcement = await getSetting('announcement');
    res.json({
      maintenanceMode: maintenance === true || maintenance === 'true',
      announcement: announcement && typeof announcement === 'object'
        ? { text: announcement.text ?? '', active: !!announcement.active }
        : { text: '', active: false },
    });
  } catch (e) {
    console.error('Public settings error:', e.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

export default router;
