/**
 * Start the BTC Miner API server (Flask on port 5001).
 * The Miner page proxies /api/miner to this server for Bitcoin Core connection and mining.
 *
 * Run from project root: node scripts/start-miner-server.js
 * Or: npm run miner:server
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const minerServerPath = path.join(projectRoot, 'backend', 'miner_server');

const child = spawn('python3', ['web_ui.py'], {
  cwd: minerServerPath,
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, MINER_WEB_PORT: '5001', BTC_MINING_ADDRESS: 'bc1q578vf2hd0vrtr6hf83ag4e4q3dwx0u0aeyjvzv' },
});

child.on('error', (err) => {
  console.error('Failed to start miner server:', err.message);
  console.error('Ensure Python is installed. From backend/miner_server run: MINER_WEB_PORT=5001 python3 web_ui.py');
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (code != null && code !== 0) process.exit(code);
  if (signal) process.exit(1);
});
