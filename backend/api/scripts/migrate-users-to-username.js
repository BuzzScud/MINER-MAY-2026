/**
 * One-time migration: transform legacy users(email, password_hash, created_at)
 * into the current username-based schema expected by schema.sql.
 *
 * Run from project root:
 *   node backend/api/scripts/migrate-users-to-username.js
 *
 * or from backend/api:
 *   node scripts/migrate-users-to-username.js
 */
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`
  );
  const names = cols.rows.map((r) => r.column_name);

  const isLegacy =
    names.length === 4 &&
    names[0] === 'id' &&
    names[1] === 'email' &&
    names[2] === 'password_hash' &&
    names[3] === 'created_at';

  if (!isLegacy && !(names.includes('username') && names.includes('password_hash'))) {
    console.error('users table is in an unexpected shape; aborting migration:', names);
    process.exit(1);
  }

  if (isLegacy) {
    console.log('Migrating legacy users(email, ...) table to username-based schema...');
    await pool.query('ALTER TABLE users RENAME COLUMN email TO username');
    await pool.query(
      `ALTER TABLE users
         ADD COLUMN is_admin BOOLEAN DEFAULT false NOT NULL,
         ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL,
         ADD COLUMN can_access_dashboard BOOLEAN DEFAULT true NOT NULL,
         ADD COLUMN can_register BOOLEAN DEFAULT true NOT NULL,
         ADD COLUMN can_edit_own_profile BOOLEAN DEFAULT false NOT NULL`
    );
  }

  // Ensure all columns from schema.sql exist (id, username, password_hash, created_at, flags)
  await pool.query(
    `ALTER TABLE users
       ALTER COLUMN username SET NOT NULL,
       ADD CONSTRAINT users_username_unique UNIQUE (username)`
  );

  console.log('users table now has username-based schema.');
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });

