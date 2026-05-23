#!/usr/bin/env python3
"""
Verify miner is 100% ready for live use.
Run: python3 verify_miner_ready.py [--network mainnet|regtest|testnet]
Exits 0 if all checks pass.
"""
import argparse
import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", default=os.environ.get("BTC_NETWORK", "mainnet"),
                        choices=["mainnet", "regtest", "testnet", "signet"])
    args = parser.parse_args()
    network = args.network

    ports = {"mainnet": 8332, "testnet": 18332, "regtest": 18443, "signet": 38332}
    port = ports[network]

    from config import MinerConfig, resolve_cookie_for_auth, get_bitcoin_datadir
    from btc_rpc import getblockchaininfo, getblocktemplate, BitcoinRPCError
    from address import address_to_script_pubkey
    from engine_self_test import run_self_test

    errors: list[str] = []
    cfg = MinerConfig(network=network, rpc_port=port)

    # 0. Genesis engine self-test
    print("0. Engine self-test (genesis block)...", end=" ")
    st = run_self_test(benchmark_duration_sec=0.5)
    if st.get("match"):
        print(f"OK (MATCH, {st['benchmark']['hashrate_hs']:.0f} H/s)")
    else:
        errors.append("Genesis self-test MISMATCH")
        print("FAIL (genesis hash mismatch)")

    # 1. Bitcoin Core RPC
    print(f"1. Bitcoin Core RPC ({network}, port {port})...", end=" ")
    try:
        info = getblockchaininfo(cfg)
        print(f"OK (chain={info.get('chain')}, blocks={info.get('blocks')})")
    except BitcoinRPCError as e:
        errors.append(f"RPC: {e}")
        print(f"FAIL: {e}")
        print("   -> Start Bitcoin Core: bitcoind -daemon (mainnet) or bitcoind -regtest -daemon (regtest)")
        return 1

    # 2. Auth (cookie or credentials)
    print("2. RPC auth...", end=" ")
    auth = cfg.auth_tuple()
    if auth:
        print("OK (cookie or credentials)")
    else:
        print("WARN (no .cookie or rpcuser/rpcpassword - set BTC_RPC_USER, BTC_RPC_PASSWORD)")

    # 3. Mining address
    addr = (os.environ.get("BTC_MINING_ADDRESS", "") or cfg.mining_address or "").strip()
    print("3. Mining address...", end=" ")
    if not addr:
        errors.append("BTC_MINING_ADDRESS or --address required")
        print("FAIL (not set)")
    else:
        try:
            script = address_to_script_pubkey(addr)
            print(f"OK ({addr[:20]}...)")
        except Exception as e:
            err_msg = str(e)
            errors.append(f"Invalid address: {err_msg}")
            print(f"FAIL: {err_msg}")
            if "Bech32" in err_msg or "1" in err_msg or "l" in err_msg:
                print("   -> Tip: Bech32 uses letter 'l' not digit '1'; digit '0' not letter 'O'")

    # 4. getblocktemplate
    print("4. getblocktemplate...", end=" ")
    if not addr:
        print("SKIP (no address)")
    else:
        try:
            cfg2 = MinerConfig(network=network, rpc_port=port, mining_address=addr)
            tpl = getblocktemplate(cfg2, ["segwit"] if network != "regtest" else [])
            print(f"OK (height={tpl.get('height')}, bits={tpl.get('bits')})")
        except BitcoinRPCError as e:
            errors.append(f"getblocktemplate: {e}")
            print(f"FAIL: {e}")

    if errors:
        print("\n--- Fix these before mining ---")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("\n*** Miner ready for live use ***")
    return 0


if __name__ == "__main__":
    sys.exit(main())
