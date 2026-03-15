import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5433/algonov26',
  max: 10,
  idleTimeoutMillis: 30000,
});

export { pool };

export async function initSchema() {
  try {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Schema initialized');
  } catch (err) {
    console.error('Schema init error:', err.message);
    throw err;
  }
}

export async function seedAdmin() {
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  const bcrypt = (await import('bcryptjs')).default;
  const r = await pool.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
  if (r.rows.length > 0) {
    if (adminPassword) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await pool.query(`UPDATE users SET password_hash = $1 WHERE username = 'admin'`, [hash]);
      console.log('Admin password updated from ADMIN_INITIAL_PASSWORD');
    }
    return;
  }
  if (!adminPassword) return;
  const hash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', $1, true)`,
    [hash]
  );
  console.log('Admin user created (username: admin)');
}
