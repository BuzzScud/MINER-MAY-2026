/**
 * One-time script: set the admin user's password in the DB.
 * Run from backend/api: node scripts/set-admin-password.js
 * Uses ADMIN_INITIAL_PASSWORD from .env, or pass password as first arg.
 */
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const password = process.argv[2] || process.env.ADMIN_INITIAL_PASSWORD;
if (!password) {
  console.error('Usage: node scripts/set-admin-password.js [password]');
  console.error('Or set ADMIN_INITIAL_PASSWORD in .env');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const hash = await bcrypt.hash(String(password), 10);
  const r = await pool.query(
    `UPDATE users SET password_hash = $1 WHERE username = 'admin' RETURNING id`,
    [hash]
  );
  if (r.rowCount === 0) {
    console.error('No user with username "admin" found. Run npm run init-db and start the server once to seed admin.');
    process.exit(1);
  }
  console.log('Admin password updated successfully. You can now log in as admin.');
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
