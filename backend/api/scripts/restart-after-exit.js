/**
 * Spawned by POST /api/admin/restart-server before the parent process exits.
 * Waits so the parent can exit and release the port, then starts the API again.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, '..');
const RESTART_DELAY_MS = 3000;

setTimeout(() => {
  const child = spawn(process.execPath, ['--watch', 'server.js'], {
    detached: true,
    stdio: 'inherit',
    cwd: apiDir,
    env: process.env,
  });
  child.unref();
}, RESTART_DELAY_MS);
