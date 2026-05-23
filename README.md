# MINER-MAY-2026

Bitcoin solo-mining dashboard with React frontend, Node API, and Python miner server (thesis/linear/hybrid search, SUPT probes, Stream A/B cadence logging).

## Quick start

```bash
npm install
cd backend/api && npm install && cd ../..

# Terminal 1 — web app + auth API (ports 5173 + 4000)
npm run dev

# Terminal 2 — miner server (port 5001, proxied at /api/miner)
npm run miner:server
```

Open `http://localhost:5173/miner`. Configure Bitcoin Core RPC (mainnet default port 8332) and your payout address in the Miner page.

Copy `backend/api/.env.example` to `backend/api/.env` and set `JWT_SECRET`, database URL, and admin credentials before production use.

## Verify

```bash
npm run build          # production frontend build
npm run test:miner     # Python miner unit tests
cd backend/api && npm run test   # API tests
```

## Miner server

See `backend/miner_server/README.md` for RPC env vars (`BTC_RPC_USER`, `BTC_RPC_PASSWORD`, `BTC_MINING_ADDRESS`), search modes, and regtest setup.

## License

See [LICENSE](LICENSE) (GPL-3.0).
