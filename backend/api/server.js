import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool, initSchema, seedAdmin } from './db.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import adminRoutes from './routes/admin.js';

// Security: refuse to start in production without a strong JWT_SECRET
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET;
if (isProduction && (!jwtSecret || jwtSecret.length < 32 || jwtSecret === 'dev-secret')) {
  console.error('FATAL: Set JWT_SECRET to a secure random string (32+ chars) in production.');
  process.exit(1);
}

const PORT = process.env.PORT || 4000;
const app = express();

app.set('trust proxy', 1);
app.use(cors({ origin: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

async function start() {
  await initSchema();
  await seedAdmin();
  try {
    await pool.query('SELECT 1');
    console.log('Database connection verified');
  } catch (err) {
    console.error('Database health check failed:', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
