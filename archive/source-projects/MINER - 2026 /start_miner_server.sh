#!/bin/sh
# Start the miner web server and open it in your browser.
# Run from project root: ./start_miner_server.sh
# After code changes, restart (Ctrl+C then run again) so /api/mining_log and fixes load.
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PYTHONPATH="$ROOT"
export BTC_NUM_WORKERS="${BTC_NUM_WORKERS:-8}"
cd "$ROOT/miner_server" || exit 1
if [ "$(uname -s)" = "Darwin" ]; then
  export MINER_WEB_PORT="${MINER_WEB_PORT:-5001}"
fi
PORT="${MINER_WEB_PORT:-5000}"
URL="http://127.0.0.1:${PORT}"
echo "Starting BTC Miner web UI at $URL"
(sleep 2.5 && open "$URL" 2>/dev/null) &
exec python3 web_ui.py
