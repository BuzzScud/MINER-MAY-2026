# Backend Server

Python HTTP server with CORS support for API proxy requests.

## Setup

No external dependencies required - uses Python standard library only.

## Running the Server

```bash
python server.py
```

The server will start on port 8080 by default.

## API Endpoints

- `GET /api/quote/{symbol}?period={period}` - Proxy requests to Yahoo Finance API
  - `symbol`: Stock ticker symbol (e.g., AAPL, GOOGL)
  - `period`: Time period (1d, 5d, 1mo, 3mo, 6mo, 1y)

## Miner backend (Miner page)

The **Miner** page in the app talks to a separate Flask server. To use the Miner page:

1. From the project root: `cd backend/miner_server`
2. Install dependencies: `pip install flask` (see `backend/miner_server/requirements.txt`)
3. Run: `python3 web_ui.py`
4. The miner API will be at `http://127.0.0.1:5001`. The Vite dev server proxies `/api/miner` to this port.

Without Bitcoin Core running, use **Detect Bitcoin Core** on the Miner page to scan for a node; if none is found, connection will fail until you install and run Bitcoin Core.

## Features

- CORS enabled for cross-origin requests
- SSL certificate verification disabled for development
- Automatic timeout handling (10 seconds)
- Error handling for API failures





