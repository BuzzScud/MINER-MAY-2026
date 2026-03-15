# Start / Stop — MAIN SITE 2026

## Kill all dev servers

```bash
./scripts/kill-all-dev.sh
```

Or manually free ports 5001, 5173, 8000 and stop `web_ui.py`, Vite, and the sentiment API.

## Start services

**1. Miner API (Flask, port 5001)**

```bash
npm run miner:server
# or
cd backend/miner_server && MINER_WEB_PORT=5001 python3 web_ui.py
```

**2. App (Vite + optional Sentiment API)**

If `npm` is not found, load NVM first:

```bash
source ~/.nvm/nvm.sh
cd "/Users/server1/Desktop/MAIN SITE - 2026"
npm run dev
```

- App: http://localhost:5173  
- Miner page: http://localhost:5173/miner  
- Miner API: http://127.0.0.1:5001  

**3. Sentiment API only (port 8000)**

```bash
./scripts/run-sentiment-api.sh
```

## Ports

| Port | Service        |
|------|----------------|
| 5001 | Miner API      |
| 5173 | Vite (frontend)|
| 8000 | Sentiment API  |
