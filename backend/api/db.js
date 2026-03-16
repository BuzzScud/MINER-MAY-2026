import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function chooseConnectionString() {
  const explicit = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
  const candidates = [
    explicit,
    // Common local defaults, including Postgres.app (5434) and Homebrew (5432)
    'postgresql://localhost:5434/algonov26',
    'postgresql://localhost:5432/algonov26',
  ].filter(Boolean);

  let lastError;
  for (const url of candidates) {
    try {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log(`Database connection OK, using ${url}`);
      return url;
    } catch (e) {
      lastError = e;
    }
  }
  console.error('Failed to connect to any candidate DATABASE_URL.');
  throw lastError ?? new Error('No DATABASE_URL candidates worked');
}

const connectionString = await chooseConnectionString();

const pool = new pg.Pool({
  connectionString,
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
  if (!adminPassword) {
    console.warn('No admin user exists and ADMIN_INITIAL_PASSWORD is not set. Set it in backend/api/.env to create an admin.');
    return;
  }
  const hash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', $1, true)`,
    [hash]
  );
  console.log('Admin user created (username: admin). Password from ADMIN_INITIAL_PASSWORD.');
}
