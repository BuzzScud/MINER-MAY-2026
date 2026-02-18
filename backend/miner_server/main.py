#!/usr/bin/env python3
"""
CLI entry for BTC miner server: start mining, status, hashrate.
Run from miner_server/ or with PYTHONPATH including miner_server.
"""
import sys
import os
import time
import argparse
import signal

# Allow running from repo root: python miner_server/main.py
_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from config import MinerConfig, QUADRANT_WORKERS, default_num_workers, load_config_from_env
from btc_rpc import getblocktemplate, getblockchaininfo, BitcoinRPCError
from miner_loop import run_mining_loop, run_mining_loop_unified, run_loop_forever


def cmd_status(config: MinerConfig) -> int:
    """Print connection and chain status."""
    try:
        info = getblockchaininfo(config)
        print("Connected to Bitcoin Core")
        print(f"  Chain: {info.get('chain', '?')}")
        print(f"  Blocks: {info.get('blocks', '?')}")
        print(f"  Headers: {info.get('headers', '?')}")
        return 0
    except BitcoinRPCError as e:
        print(f"RPC error: {e}", file=sys.stderr)
        return 1


def cmd_mine(config: MinerConfig, once: bool = False) -> int:
    """Run mining loop; if once, run one template then exit."""
    if not config.mining_address:
        print("Set BTC_MINING_ADDRESS or --address", file=sys.stderr)
        return 1
    stop = {"stop": False}

    def on_stop() -> bool:
        return stop["stop"]

    def on_stats(total_hashes: int, total_blocks: int, hashrate: float) -> None:
        elapsed = time.time() - _start[0]
        print(f"\rHashrate: {hashrate:.1f} H/s | Hashes: {total_hashes} | Blocks: {total_blocks} | Time: {elapsed:.0f}s", end="", flush=True)

    _start = [time.time()]

    def sig_handler(_signum: int, _frame: object) -> None:
        stop["stop"] = True

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    if once:
        try:
            loop_fn = run_mining_loop_unified if config.use_unified else run_mining_loop
            hashes, blocks = loop_fn(config, stop_flag=on_stop)
            print(f"\nHashes: {hashes}, Blocks found: {blocks}")
            return 0
        except BitcoinRPCError as e:
            print(f"RPC error: {e}", file=sys.stderr)
            return 1
    run_loop_forever(config, on_stats=on_stats, stop_flag=on_stop)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="BTC Miner Server (Bitcoin Core)")
    parser.add_argument("--host", default=os.environ.get("BTC_RPC_HOST", "127.0.0.1"), help="RPC host")
    parser.add_argument("--port", type=int, default=0, help="RPC port (0 = default for network)")
    parser.add_argument("--user", default=os.environ.get("BTC_RPC_USER", ""), help="RPC user")
    parser.add_argument("--password", default=os.environ.get("BTC_RPC_PASSWORD", ""), help="RPC password")
    parser.add_argument("--network", default=os.environ.get("BTC_NETWORK", "regtest"), choices=["mainnet", "testnet", "regtest", "signet"])
    parser.add_argument("--address", "-a", default=os.environ.get("BTC_MINING_ADDRESS", ""), help="Mining payout address")
    parser.add_argument("--threads", "-t", type=int, default=1, help="Mining threads (currently 1)")
    parser.add_argument("--once", action="store_true", help="Mine one block template then exit")
    parser.add_argument("--single-nonce-only", action="store_true", help="Thesis validation: try only 1–2 entropy-reduced nonces, no expansion")
    parser.add_argument("--status", action="store_true", help="Show status and exit")
    parser.add_argument("--cookie-file", default=os.environ.get("BTC_COOKIE_FILE", ""), help="Path to .cookie (or BTC_COOKIE_FILE)")
    parser.add_argument("--datadir", default=os.environ.get("BTC_DATADIR", ""), help="Bitcoin datadir (or BTC_DATADIR)")
    parser.add_argument("--quadrant", action="store_true", help="Thesis quadrant mode: force 4 workers (500D lattice partition)")
    parser.add_argument("-v", "--verbose", action="count", default=0, help="Verbose")
    args = parser.parse_args()

    port = args.port
    if port <= 0:
        port = {"mainnet": 8332, "testnet": 18332, "regtest": 18443, "signet": 38332}.get(args.network, 18443)

    config = MinerConfig(
        rpc_host=args.host,
        rpc_port=port,
        rpc_user=args.user,
        rpc_password=args.password,
        network=args.network,
        mining_address=args.address,
        num_threads=args.threads,
        rpc_cookie_file=args.cookie_file.strip() or None,
        rpc_datadir=args.datadir.strip() or None,
        num_workers=QUADRANT_WORKERS if args.quadrant or os.environ.get("BTC_QUADRANT_MODE", "").strip().lower() in ("1", "true", "yes") else max(1, int(os.environ.get("BTC_NUM_WORKERS", str(default_num_workers())))),
        use_unified=os.environ.get("BTC_USE_UNIFIED", "1").strip().lower() in ("1", "true", "yes"),
        single_nonce_only=args.single_nonce_only or os.environ.get("BTC_SINGLE_NONCE_ONLY", "0").strip().lower() in ("1", "true", "yes"),
        verbose=args.verbose,
    )

    if args.status:
        return cmd_status(config)
    return cmd_mine(config, once=args.once)


if __name__ == "__main__":
    sys.exit(main())
