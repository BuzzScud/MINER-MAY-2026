import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Route file is backend/api/routes/sentimentBackend.js -> project root is 3 levels up
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const SENTIMENT_DIR = path.join(projectRoot, 'archive', 'source-projects', 'SENTIMENT INDICATOR - 2026');

const SENTIMENT_PORT = 8000;
const SENTIMENT_HEALTH_URL = `http://127.0.0.1:${SENTIMENT_PORT}/`;

const router = Router();

router.use(requireAuth);

async function isSentimentRunning() {
  try {
    const res = await fetch(SENTIMENT_HEALTH_URL, { method: 'GET', signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

function getUvicornCommand() {
  const isWin = process.platform === 'win32';
  const venvPython = isWin
    ? path.join(SENTIMENT_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(SENTIMENT_DIR, '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython)) {
    return { cmd: venvPython, args: ['-m', 'uvicorn', 'backend.main:app', '--reload', '--host', '0.0.0.0', '--port', '8000'] };
  }
  return { cmd: 'python3', args: ['-m', 'uvicorn', 'backend.main:app', '--reload', '--host', '0.0.0.0', '--port', '8000'] };
}

router.post('/start', async (req, res) => {
  try {
    if (await isSentimentRunning()) {
      return res.json({ status: 'already_running', message: 'Sentiment API is already running.' });
    }
    const { cmd, args } = getUvicornCommand();
    const child = spawn(cmd, args, {
      cwd: SENTIMENT_DIR,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PYTHONPATH: SENTIMENT_DIR },
      shell: false,
    });
    child.unref();
    res.json({ status: 'started', message: 'Sentiment API is starting. Try "Get sentiment" in a few seconds.' });
  } catch (err) {
    console.error('Sentiment backend start error:', err);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to start Sentiment API.' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const running = await isSentimentRunning();
    res.json({ running });
  } catch (err) {
    res.status(500).json({ running: false, error: err.message });
  }
});

export default router;
