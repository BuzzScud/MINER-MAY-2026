import 'dotenv/config';
import './startTime.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pool, initSchema, seedAdmin } from './db.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import predictRoutes from './routes/predict.js';
import marketDataRoutes from './routes/marketData.js';

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

if (isProduction && allowedOrigins.length === 0) {
  console.error('FATAL: ALLOWED_ORIGINS must be set in production.');
  process.exit(1);
}

const corsOptions = isProduction
  ? { origin: allowedOrigins, credentials: true }
  : { origin: true, credentials: true };

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(cors(corsOptions));

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

app.use(express.json({ limit: '256kb' }));
app.use('/api', apiRateLimiter);
app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/predict', predictRoutes);
app.use('/api/market-data', marketDataRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error('Unhandled API error:', err);
  if (res.headersSent) {
    return next(err);
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request entity too large' });
  }
  return res.status(500).json({ error: 'Internal server error' });
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
