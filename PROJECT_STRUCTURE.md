# Project Structure

This document describes the organization of the ALGONOV26 project.

## Root

| Item | Purpose |
|------|---------|
| `package.json` | Node dependencies and scripts |
| `vite.config.js` | Vite build configuration |
| `tailwind.config.js` | Tailwind CSS configuration |
| `postcss.config.js` | PostCSS configuration |
| `eslint.config.js` | ESLint configuration |
| `jsconfig.json` | JavaScript path/config for IDE |
| `index.html` | Entry HTML |
| `.htaccess` | Apache config (root deployment) |
| `README.md` | Project readme |
| `LICENSE` | License |

## Directories

### `src/` – Frontend (React + Vite)

| Path | Purpose |
|------|---------|
| `src/App.jsx` | Root app and routing |
| `src/main.jsx` | Entry point |
| `src/index.css` | Global styles (Tailwind) |
| `src/assets/` | Static assets (optional) |
| `src/components/` | Shared UI components |
| `src/features/` | Feature modules (api-monitor, mempool, trading-bot) |
| `src/layouts/` | Layout components (MainLayout) |
| `src/pages/` | Route-level page components |
| `src/services/` | API and data services |
| `src/utils/` | Shared utilities |

### `src/components/` – Shared UI

| Subfolder | Contents |
|-----------|----------|
| `common/` | ErrorBoundary, Panel (shared card wrapper) |
| `grid/` | GridGenerator, GridControls, GridPreview, GridCodeOutput |
| `sidebar/` | Sidebar, SidebarClock, UserProfile |
| `calendar/` | EconomicCalendarWidget |

### `src/features/` – Feature modules

| Module | Purpose |
|--------|---------|
| `api-monitor/` | API health checks, latency, connection log |
| `mempool/` | Mempool panels, transaction detail (used by Miner page) |
| `trading-bot/` | Trading Bot dashboard, settings, backtest |

### `scripts/`

| Script | Purpose |
|--------|---------|
| `deploy.sh` | Deploy `dist/` to server (run from project root) |
| `server-fix.sh` | Server-side clean redeploy (run on server) |
| `update-htaccess.js` | Post-build .htaccess update |
| `verify-build.js` | Post-build verification |
| `resolve-conflict.sh` | Git conflict resolution helper |
| `start-trading-bot-server.js` | Start QuantBot Trading Bot backend (port 8080) |
| `smoke-trading-bot-api.js` | Smoke-test Trading Bot API (run when backend is up) |

### `config/`

| File | Purpose |
|------|---------|
| `nginx.conf` | Nginx server configuration |

### `docs/`

| Subfolder | Purpose |
|-----------|---------|
| `deployment/` | Deployment guides and checklists |
| `debugging/` | Debugging and troubleshooting |
| `development/` | Development and production readiness |
| `integration/` | Integration and formula references |
| `assets/` | Documentation assets (e.g. PDFs) |

### `backend/`

| Item | Purpose |
|------|---------|
| `server.py` | Python backend server |
| `requirements.txt` | Python dependencies |
| `README.md` | Backend setup notes |

### `backend/api/` – Node API

| Path | Purpose |
|------|---------|
| `server.js` | API entry (Express, port 4000) |
| `startTime.js` | Process start time for uptime |
| `db.js` | PostgreSQL connection and schema init |
| `schema.sql` | DB schema (users, app_data, etc.) |
| `routes/` | admin, auth, settings |
| `scripts/restart-after-exit.js` | Detached restart script for admin restart |

### `public/`

Static files served as-is (e.g. `vite.svg`, `.htaccess`).

### `dist/`

Build output (generated; do not edit).

### `archive/`

| Subfolder | Purpose |
|-----------|---------|
| `old-workspaces/` | Legacy workspace snapshots |
| `source-projects/` | Reference projects (Budget Tracker, Fib Calc, mem pool replica) |

## Where files live

| Location | Contents |
|----------|----------|
| **Root** | Config only: `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `eslint.config.js`, `jsconfig.json`, `index.html`, `.gitignore`, `.htaccess`, `README.md`, `LICENSE`, `PROJECT_STRUCTURE.md` |
| **`src/`** | All app source: `App.jsx`, `main.jsx`, `index.css`, plus `components/`, `features/`, `layouts/`, `pages/`, `services/`, `utils/` |
| **`public/`** | Static assets copied to build output: `vite.svg`, `.htaccess` |
| **`scripts/`** | Build, deploy, and tooling scripts (e.g. `deploy.sh`, `start-trading-bot-server.js`) |
| **`docs/`** | All documentation (top-level `.md` and subfolders `deployment/`, `debugging/`, `integration/`) |
| **`config/`** | Server/config files (e.g. `nginx.conf`) |
| **`backend/`** | Backend services (e.g. `miner_server/`, `server.py`, `requirements.txt`) |
| **`archive/`** | Reference/legacy projects only; not part of the build |

## Conventions

- **Components**: One component per file. Shared UI in `src/components/`; feature-specific code in `src/features/<name>/`.
- **Shared UI**: Use `src/components/common/Panel.jsx` for card-style panels; use `ErrorBoundary` from `common/` for route-level error handling.
- **Imports**: Use paths relative to the current file (e.g. `../../../components/common/Panel` from a feature).
- **Scripts**: Run from project root. Add new scripts under `scripts/`.
- **Documentation**: Keep under `docs/` with subfolders by topic.
- **Archive**: The `archive/` folder holds reference and legacy projects only; it is not part of the build. Keep active app code in `src/`, `scripts/`, and `docs/`.
