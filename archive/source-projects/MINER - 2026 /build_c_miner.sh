#!/bin/sh
# Build the C miner binary for integration with Python.
# Run from project root. Output: "c. math/tools/bitcoin-miner"
# Single miner: Python delegates to this when BTC_USE_C_MINER=1.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/c. math/tools" || cd "$ROOT/c math/tools" || {
    echo "Error: c. math/tools not found"
    exit 1
}
echo "Building C miner..."
make bitcoin-miner 2>/dev/null || {
    echo "Build failed. Ensure dependencies are built (recovery libs, algorithms, duality)."
    echo "Try: cd 'c. math/lib/recovery_core' && make"
    echo "     cd 'c. math/lib/recovery_crypto' && make"
    echo "     cd 'c. math/lib/recovery_network' && make"
    exit 1
}
echo "C miner built: $(pwd)/bitcoin-miner"
echo "To use: BTC_USE_C_MINER=1 python3 miner_server/main.py mine -a ADDRESS"
