#!/usr/bin/env python3
"""
Fix RPC 503 (Work queue depth exceeded) by adding rpcworkqueue=32 to bitcoin.conf.
Run from miner_server: python3 fix_rpc_503.py
Uses default Bitcoin Core datadir (macOS: ~/Library/Application Support/Bitcoin).
After running, restart Bitcoin Core for the change to take effect.
"""
import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from config import get_bitcoin_datadir, ensure_rpcworkqueue


def main() -> int:
    datadir = get_bitcoin_datadir("mainnet")
    changed, message = ensure_rpcworkqueue(datadir)
    print(message)
    if changed:
        print("\nRestart Bitcoin Core (Bitcoin-Qt or bitcoind) for the change to take effect.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
