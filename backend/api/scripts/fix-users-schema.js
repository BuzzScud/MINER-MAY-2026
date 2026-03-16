/**
 * One-time: drop old users table (email-based) and reapply schema (username-based).
 * Run from project root: node backend/api/scripts/fix-users-schema.js
 * Or from backend/api: node scripts/fix-users-schema.js
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionString =
  process.env.DATABASE_URL || 'postgresql://localhost:5432/algonov26';

const pool = new pg.Pool({ connectionString });

async function main() {
  await pool.query('DROP TABLE IF EXISTS app_data CASCADE');
  await pool.query('DROP TABLE IF EXISTS user_activity CASCADE');
  await pool.query('DROP TABLE IF EXISTS login_attempts CASCADE');
  await pool.query('DROP TABLE IF EXISTS users CASCADE');
  const sql = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema re-applied. users table now has username.');

  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminPassword) {
    console.warn('Schema applied. Set ADMIN_INITIAL_PASSWORD in backend/api/.env and run: node scripts/set-admin-password.js');
    return;
  }
  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', $1, true)`,
    [hash]
  );
  console.log('Admin user created (username: admin). Password from ADMIN_INITIAL_PASSWORD.');
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
