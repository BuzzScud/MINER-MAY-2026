#!/usr/bin/env python3
"""
Regtest self-validation: run backtest on the last block only.
Exits 0 if phase1_hits + phase2_hits >= 1 (our thesis would have found that block), else 1.
Run with Bitcoin Core regtest and at least one block (mine one with this miner first for a guaranteed hit).
"""
import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from config import load_config_from_env
from btc_rpc import getblockchaininfo, BitcoinRPCError
from backtest_last_100_blocks import _run_backtest


def main() -> int:
    config = load_config_from_env()
    if config.network != "regtest":
        print("Self-check is for regtest. Set BTC_NETWORK=regtest or use regtest connection.", file=sys.stderr)
        return 1
    try:
        info = getblockchaininfo(config)
        tip = int(info.get("blocks", -1))
    except BitcoinRPCError as e:
        print(f"RPC error: {e}", file=sys.stderr)
        return 1
    if tip < 1:
        print("Regtest has no blocks. Generate at least one block (e.g. mine with this miner), then run again.", file=sys.stderr)
        return 1
    try:
        result = _run_backtest(config, num_blocks=1)
    except BitcoinRPCError as e:
        print(f"RPC error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    hits = (result.get("phase1_hits") or 0) + (result.get("phase2_hits") or 0)
    total = result.get("total") or 0
    if total == 0:
        print("No block was backtested.", file=sys.stderr)
        return 1
    if hits >= 1:
        print(f"Self-check passed: {hits} hit(s) on last block (tip {result.get('tip')}).")
        return 0
    print(
        f"Self-check failed: 0 hits on last block (tip {result.get('tip')}). "
        "Mine a block with this miner on regtest, then run this script again.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
