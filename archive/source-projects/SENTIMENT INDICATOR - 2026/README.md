# Market Sentiment Indicator

Backend (Python/FastAPI, Postgres, VADER, Reddit/RSS gatherers) and frontend (Vite/React, Recharts) for a pluggable market sentiment indicator. No LLM APIs; rule-based sentiment only.

## Setup

### Backend

1. Create a virtualenv and install dependencies:

   ```bash
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r backend/requirements.txt
   ```

2. Download NLTK VADER lexicon (one-time, so VADER works without internet at runtime):

   ```bash
   python -m nltk.downloader vader_lexicon
   ```

3. Copy env example and set variables:

   ```bash
   cp backend/.env.example .env
   ```

   Edit `.env` (use the project root so both Alembic and the API see it):

   - **DATABASE_URL** (required): e.g. `postgresql://user:password@localhost:5432/sentiment_db`
   - **REDDIT_CLIENT_ID**, **REDDIT_CLIENT_SECRET**, **REDDIT_USER_AGENT** (optional): for Reddit gatherer; if missing, Reddit is skipped
   - **SENTIMENT_SYMBOLS** (optional): comma-separated, e.g. `AAPL,BTC`
   - **SCHEDULER_INTERVAL_MINUTES** (optional): default `15`
   - **MASSIVE_API_KEY**, **FINNHUB_API_KEY**, **ALPHA_VANTAGE_API_KEY** (optional): for on-demand symbol lookup from the provider dropdown; if a key is missing, that provider returns a clear error. Keys are used only in the backend, never in the frontend.

4. Create the Postgres database and run migrations:

   ```bash
   createdb sentiment_db   # or your DB name from DATABASE_URL
   alembic upgrade head
   ```

5. Run the API (from project root, so `backend` is on the path):

   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

   The backend loads `.env` from the project root. If you see "Database unavailable", ensure you are running from the project root or export `DATABASE_URL` before starting (e.g. `export $(grep -v '^#' .env | xargs)` then uvicorn). The scheduler runs on startup and every 15 minutes (or `SCHEDULER_INTERVAL_MINUTES`). First run may take a moment while gatherers and VADER run.

6. Run tests (from project root):

   ```bash
   PYTHONPATH=. pytest tests/ -v
   ```

### Frontend

1. Install and run (from project root):

   ```bash
   cd frontend && npm install && npm run dev
   ```

2. Open http://localhost:5173. The dashboard shows current sentiment (gauge) and a trend chart; use the asset dropdown (e.g. AAPL, BTC). Data appears after the first scheduler run.

## Testing with AAPL

- Ensure `SENTIMENT_SYMBOLS` includes `AAPL` (default).
- After backend and migrations are up, wait for one scheduler run or restart the backend to trigger an immediate run.
- Frontend will show “No sentiment data yet” until the first run completes and enough signals meet the min volume threshold (default 10). You can lower `min_volume` in the default strategy for testing.

## Troubleshooting

- **“Internal Server Error” or “Database unavailable” on the dashboard**  
  The backend returns 503 when it cannot reach Postgres. Fix it by:
  1. Ensuring Postgres is running and the database in `DATABASE_URL` exists (e.g. `createdb sentiment_db`).
  2. Running migrations from the project root: `PYTHONPATH=. alembic upgrade head`.
  3. Restarting the backend so the scheduler and API use the DB.

- **404 “No sentiment data for this asset”**  
  Expected before the first scheduler run completes or if there are too few signals (min volume threshold). Wait for the next 15‑minute run or restart the backend to trigger a run.

## Project layout

- **backend/** — FastAPI app, sentiment module, DB
  - **sentiment/gatherers.py** — Reddit (PRAW) and Yahoo Finance RSS
  - **sentiment/analyzer.py** — VADER scoring, aggregation, entry/exit/staleness rules
  - **sentiment/models.py** — SQLAlchemy `signals` and `aggregates` tables
  - **sentiment/scheduler.py** — APScheduler job: gather → analyze → store
  - **sentiment/api.py** — `GET /api/sentiment/{asset}`, `GET /api/sentiment/historical/{asset}`
  - **sentiment/strategies/** — Pluggable strategy (base + default)
- **frontend/** — Vite + React + Recharts; `SentimentIndicator` gauge and chart
- **alembic/** — Migrations for Postgres

## Adding a new gatherer

1. In `backend/sentiment/gatherers.py`, add a function that accepts `symbols: list[str] | None` and returns a list of `RawSignal` dicts (`asset_symbol`, `source`, `text`, `timestamp`, optional `url`).
2. Register it in the active strategy’s `get_gatherers()` (e.g. in `backend/sentiment/strategies/default.py`).

## Switching strategy

Replace the active strategy in the pipeline: in `backend/sentiment/scheduler.py`, change the import and the strategy passed to `run_pipeline(...)` (e.g. from `default_strategy` to another implementation of `Strategy`).
