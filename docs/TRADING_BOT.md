# Trading Bot Page

The Trading Bot dashboard (algorithmic trading, paper and live modes) depends on a **QuantBot backend** server running on **port 8080**. The main app proxies `/api/*` and `/socket.io` to that server.

## Starting the backend

**Option 1 – from project root (recommended)**

```bash
npm run trading-bot:server
```

This runs the QuantBot Flask-SocketIO server from `archive/source-projects/TRADING BOT - 2026`.

**Option 2 – manually**

```bash
cd "archive/source-projects/TRADING BOT - 2026"
python -m quantbot.server
```

Requirements: Python with `flask` and `flask-socketio` installed. The server listens on `http://127.0.0.1:8080`.

## Using the Trading Bot page

1. Start the QuantBot server (see above).
2. Start the main app: `npm run dev`.
3. Open the app and go to the **Trading Bot** page.
4. Timeframe, feed, and symbol add/remove will work; the chart and panels (Market Overview, Positions, Trades, Performance) will load when the backend is running.

If the backend is not running, you will see a banner and error toasts when changing timeframe, feed, or symbols; the chart and data panels will stay empty until the server is available.

## Verifying the API

With the QuantBot server running, you can run a quick smoke test from the project root:

```bash
npm run trading-bot:smoke
```

This calls `GET /api/state`, `POST /api/timeframe` (15m), `POST /api/feed` (yahoo), and `POST /api/symbols` (remove/add) and reports success or failure.
