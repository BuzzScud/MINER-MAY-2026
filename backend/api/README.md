# Algonov26 API

Node.js + Express REST API with PostgreSQL and JWT auth.

## Prerequisites

- PostgreSQL 16+ (Homebrew: `brew install postgresql@16`)
- Node.js 18+

## Setup

1. Start PostgreSQL (e.g. on port 5433).
2. Create database: `createdb -p 5433 algonov26` or `psql -p 5433 -c "CREATE DATABASE algonov26;"`
3. Copy `.env.example` to `.env` and fill:
   - `DATABASE_URL=postgresql://localhost:5433/algonov26`
   - `JWT_SECRET=<generate-random-32-char-string>`
   - `ADMIN_INITIAL_PASSWORD=<password>` (optional; creates admin user on first run if set)
4. Install: `npm install`
5. Init schema: `npm run init-db`

## Run

- Dev (with watch): `npm run dev`
- Prod: `npm start`

API listens on port 4000. Vite dev server proxies `/api/auth`, `/api/data`, and `/api/admin` to this API.
