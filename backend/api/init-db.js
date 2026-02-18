import 'dotenv/config';
import pg from 'pg';
import { pool, initSchema } from './db.js';

async function ensureDatabase() {
  const url = process.env.DATABASE_URL || 'postgresql://localhost:5433/algonov26';
  const baseUrl = url.replace(/\/[^/]*$/, '/postgres');
  const client = new pg.Client({ connectionString: baseUrl });
  try {
    await client.connect();
    await client.query('CREATE DATABASE algonov26');
    console.log('Database algonov26 created');
  } catch (e) {
    if (e.code !== '42P04') throw e;
    // 42P04 = duplicate_database
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureDatabase();
  await initSchema();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
