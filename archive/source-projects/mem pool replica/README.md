# Bitcoin Mempool Dashboard Replica

A real-time Bitcoin mempool dashboard that replicates the mempool.space interface. Built with React, TypeScript, Vite, Tailwind CSS, Recharts, Nivo, and TanStack Query.

## Features

- **Transaction Fees** – Recommended fees for No Priority, Low, Medium, and High with USD equivalents
- **Difficulty Adjustment** – Progress toward next retarget, block time, and adjustment magnitude
- **Mempool Goggles** – Treemap visualization of mempool transactions by fee rate
- **Metrics & Chart** – Minimum fee, memory usage, unconfirmed count, and incoming transactions chart

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- TanStack Query (REST data)
- Recharts (time-series chart)
- Nivo (treemap)
- Lucide React (icons)

## Data Source

Data is fetched directly from [mempool.space](https://mempool.space):

- **REST API** – Fees, prices, difficulty, mempool stats, recent transactions
- **WebSocket** – Live 2-hour chart, mempool stats, fees

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
npm run preview
```
