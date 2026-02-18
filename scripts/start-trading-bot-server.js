/**
 * Start the QuantBot Trading Bot backend (Flask-SocketIO on port 8080).
 * The Trading Bot dashboard page requires this server to be running for
 * timeframe/feed/symbols and chart data.
 *
 * Run from project root: node scripts/start-trading-bot-server.js
 * Or: npm run trading-bot:server
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const archivePath = path.join(projectRoot, 'archive', 'source-projects', 'TRADING BOT - 2026');

const child = spawn('python', ['-m', 'quantbot.server'], {
  cwd: archivePath,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('error', (err) => {
  console.error('Failed to start QuantBot server:', err.message);
  console.error('Ensure Python is installed and you are in the project root. From archive path run: python -m quantbot.server');
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (code != null && code !== 0) process.exit(code);
  if (signal) process.exit(1);
});
