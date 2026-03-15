import 'dotenv/config';
import './startTime.js';
import express from 'express';
import cors from 'cors';
import { pool, initSchema, seedAdmin } from './db.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import sentimentBackendRoutes from './routes/sentimentBackend.js';

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

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const corsOptions = isProduction
  ? (allowedOrigins.length > 0
      ? { origin: allowedOrigins, credentials: true }
      : { origin: false })
  : { origin: true };
app.use(cors(corsOptions));

app.use(express.json({ limit: '256kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sentiment-backend', sentimentBackendRoutes);

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

const isTest = process.env.VITEST === 'true' || process.env.NODE_TEST === '1';
if (!isTest) {
  start().catch((err) => {
    console.error('Startup error:', err);
    process.exit(1);
  });
}

export { app };
