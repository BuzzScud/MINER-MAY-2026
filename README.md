# Prime Tetration Trading Application

A web application for financial market analysis and projections using advanced mathematical models.

## Project Structure

```
/
├── backend/                    # Python backend server
│   ├── server.py              # HTTP server with API proxy
│   ├── requirements.txt       # Python dependencies
│   └── README.md              # Backend documentation
├── src/                       # React frontend application
│   ├── components/            # Reusable React components (by feature)
│   │   ├── common/            # ErrorBoundary, shared UI
│   │   ├── grid/              # GridGenerator, GridControls, GridPreview, GridCodeOutput
│   │   ├── monitor/           # MonitorCard, MonitorChart, AddMonitorModal
│   │   ├── sidebar/           # Sidebar, SidebarClock, UserProfile
│   │   └── calendar/          # EconomicCalendarWidget
│   ├── pages/                # Page components (routes)
│   ├── services/             # API services and data fetching
│   ├── layouts/              # Layout components
│   ├── styles/               # Page-specific styles
│   ├── utils/                # Utility functions
│   ├── assets/               # Static assets (images, etc.)
│   ├── App.jsx               # Main app component
│   ├── App.css               # Global app styles
│   ├── index.css             # Base styles
│   └── main.jsx              # Entry point
├── docs/                      # Documentation
│   ├── deployment/           # Deployment guides and checklists
│   ├── debugging/            # Debugging guides and fixes
│   ├── development/          # Development documentation
│   ├── integration/         # Integration guides and references
│   ├── assets/               # Documentation assets (PDFs, etc.)
│   └── *.md                  # General documentation files
├── config/                    # Configuration files
│   └── nginx.conf            # Nginx server configuration
├── scripts/                   # Build and utility scripts
│   ├── deploy.sh             # Deploy dist/ to server (run from root: ./scripts/deploy.sh)
│   ├── run-dev.sh            # Start dev (sources nvm/fnm/asdf, runs npm run dev)
│   ├── setup-sentiment.sh    # One-time Sentiment setup (venv, pip, NLTK, .env)
│   ├── run-sentiment-api.sh  # Start Sentiment API (venv-aware)
│   ├── server-fix.sh         # Server-side clean redeploy
│   ├── update-htaccess.js    # Post-build script for .htaccess
│   ├── verify-build.js       # Post-build verification
│   └── resolve-conflict.sh   # Git conflict resolution
├── public/                    # Public static assets
├── dist/                      # Build output (gitignored)
└── [config files]             # Root config files (package.json, vite.config.js, etc.)
```

## Features

- Real-time stock market data monitoring
- Prime tetration-based price projections
- Fibonacci retracement tools
- News aggregation from multiple sources
- API monitoring dashboard
- Trading interface
- Data visualization and charts

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+
- PostgreSQL (for Sentiment page; can reuse main app DB on port 5433)

### Frontend Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Run the server (no dependencies required)
python server.py
```

The backend will be available at `http://localhost:8080`

### Sentiment page (optional)

The **Sentiment** page (Market Sentiment and Composite & Indices) requires a separate Python backend. Run **one-time setup** before first use:

```bash
./scripts/setup-sentiment.sh
```

This installs Node deps, creates Sentiment venv, installs pip packages, downloads NLTK data, and creates `.env`. Edit `archive/source-projects/SENTIMENT INDICATOR - 2026/.env` to set `DATABASE_URL` (e.g. `postgresql://localhost:5433/algonov26` for main app DB). Create the DB and run migrations if needed:


```bash
createdb sentiment_db   # or your DB name from DATABASE_URL
cd archive/source-projects/SENTIMENT\ INDICATOR\ -\ 2026 && PYTHONPATH=. .venv/bin/python -m alembic upgrade head
```

Then start dev (Vite + Sentiment API):

```bash
./scripts/run-dev.sh
# or, if npm is in PATH:
npm run dev
```

See `archive/source-projects/SENTIMENT INDICATOR - 2026/README.md` for database and API keys.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run sentiment:api` - Start Sentiment backend (port 8000) for the Sentiment page

### If you see "command not found: npm"

When using nvm, fnm, or asdf, the terminal may not have Node in PATH. Use:

```bash
./scripts/run-dev.sh
```

This script sources nvm/fnm/asdf (if present) and runs `npm run dev`. If npm is still not found, install Node.js 18+ from [nodejs.org](https://nodejs.org/), Homebrew (`brew install node`), or nvm.

## Documentation

See the `docs/` directory for detailed documentation:

- **Deployment** (`docs/deployment/`): Deployment guides, checklists, and server configuration
- **Debugging** (`docs/debugging/`): Debugging guides, fixes, and troubleshooting
- **Development** (`docs/development/`): Development documentation and production readiness
- **Integration** (`docs/integration/`): Integration guides and formula references
- **General** (`docs/*.md`): Formula refinements, projection improvements, and other documentation

## License

See LICENSE file for details.
