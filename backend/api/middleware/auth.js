import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { extractAuthToken } from '../utils/authCookie.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

async function getEmergencyLogoutGeneration() {
  const r = await pool.query('SELECT generation FROM emergency_logout WHERE id = 1');
  return r.rows[0]?.generation ?? 0;
}

/**
 * Require a valid JWT. Sets req.userId. Non-admin tokens are invalidated when emergency_logout generation increases.
 */
export async function requireAuth(req, res, next) {
  const token = extractAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
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
