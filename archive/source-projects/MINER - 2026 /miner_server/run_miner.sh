#!/bin/sh
# Run the Python miner. Requires Bitcoin Core (bitcoind) running with RPC on regtest.
# Start Bitcoin Core in regtest first, then get an address:
#   bitcoin-cli -regtest getnewaddress
# Then run this script with that address.

cd "$(dirname "$0")"

# Defaults (override with env or pass args to main.py)
: "${BTC_RPC_USER:=user}"
: "${BTC_RPC_PASSWORD:=pass}"
: "${BTC_NETWORK:=regtest}"

if [ -z "$BTC_MINING_ADDRESS" ]; then
    echo "Set BTC_MINING_ADDRESS (from: bitcoin-cli -regtest getnewaddress)"
    echo "Example: export BTC_MINING_ADDRESS=\$(bitcoin-cli -regtest getnewaddress)"
    echo "Then: python3 main.py --network regtest"
    echo ""
    echo "Checking RPC connection..."
    python3 main.py --status --user "$BTC_RPC_USER" --password "$BTC_RPC_PASSWORD" --network "$BTC_NETWORK" || true
    exit 1
fi

export BTC_RPC_USER BTC_RPC_PASSWORD BTC_NETWORK
exec python3 main.py --user "$BTC_RPC_USER" --password "$BTC_RPC_PASSWORD" --address "$BTC_MINING_ADDRESS" --network "$BTC_NETWORK"
