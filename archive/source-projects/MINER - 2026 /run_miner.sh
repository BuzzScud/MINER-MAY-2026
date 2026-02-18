#!/bin/sh
# Run from project root: ./run_miner.sh
# Starts the miner web UI and opens it in your browser.
# For CLI-only: MINER_CLI=1 ./run_miner.sh (requires BTC_MINING_ADDRESS set)
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PYTHONPATH="$ROOT"
cd "$ROOT/miner_server" || exit 1
if [ "${MINER_CLI}" = "1" ]; then
    exec ./run_miner.sh "$@"
fi
PORT="${MINER_WEB_PORT:-5000}"
URL="http://127.0.0.1:${PORT}"
echo "Starting BTC Miner web UI at $URL"
echo "Opening browser..."
(sleep 2.5 && open "$URL" 2>/dev/null) &
exec python3 web_ui.py
