#!/usr/bin/env bash
# Kill all dev servers: Miner API (5001), Vite (5173), Sentiment API (8000).
# Run from project root: ./scripts/kill-all-dev.sh

set -e

for port in 5001 5173 8000; do
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null || true
    echo "Killed process on port $port (PID $pid)"
  else
    echo "Port $port: no process"
  fi
done

pkill -f "web_ui.py" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "run-sentiment-api" 2>/dev/null || true
pkill -f "uvicorn.*8000" 2>/dev/null || true

echo "Done. Ports 5001, 5173, 8000 cleared."
