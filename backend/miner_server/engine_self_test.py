#!/usr/bin/env python3
"""
Genesis block PoW self-test and single-thread hashrate benchmark.

Validates double-SHA256, header layout, and hash display byte order against
the known Bitcoin genesis block hash.
"""
from __future__ import annotations

import time
from typing import Any

GENESIS_HEADER_HEX = (
    "010000000000000000000000000000000000000000000000000000000000000000000000"
    "3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49"
    "ffff001d1dac2b7c"
)
GENESIS_HASH_EXPECTED = "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f"


def verify_genesis_hash() -> dict[str, Any]:
    """Verify double-SHA256 of the genesis header matches the canonical block hash."""
    import miner_loop as ml

    header_bytes = bytes.fromhex(GENESIS_HEADER_HEX)
    if len(header_bytes) != 80:
        return {
            "ok": False,
            "genesis_hash": "",
            "expected": GENESIS_HASH_EXPECTED,
            "match": False,
            "error": f"genesis header length {len(header_bytes)}, expected 80",
        }
    h = ml._double_sha256(header_bytes)
    hash_display = h[::-1].hex()
    match = hash_display == GENESIS_HASH_EXPECTED
    return {
        "ok": match,
        "genesis_hash": hash_display,
        "expected": GENESIS_HASH_EXPECTED,
        "match": match,
    }


def benchmark_single_thread(duration_sec: float = 2.0) -> dict[str, Any]:
    """
    Linear nonce scan on genesis header for ~duration_sec wall time.
    Uses hashlib via miner_loop._double_sha256 (same path as self-test script).
    """
    import miner_loop as ml

    header_bytes = bytes.fromhex(GENESIS_HEADER_HEX)
    template = header_bytes[:76]  # version + prev + merkle + time + bits (nonce slot zeroed)
    t0 = time.time()
    deadline = t0 + max(0.1, duration_sec)
    nonce = 0
    hashes = 0
    while time.time() < deadline:
        header = template + (nonce & 0xFFFFFFFF).to_bytes(4, "little")
        ml._double_sha256(header)
        hashes += 1
        nonce += 1
    elapsed = time.time() - t0
    hashrate = hashes / elapsed if elapsed > 0 else 0.0
    return {
        "hashrate_hs": round(hashrate, 2),
        "hashes": hashes,
        "elapsed_sec": round(elapsed, 4),
        "target_diff": 1.0,
    }


def format_self_test_text(result: dict[str, Any]) -> str:
    """Human-readable self-test output matching supt_miner self-test format."""
    genesis = result.get("genesis", {})
    bench = result.get("benchmark", {})
    lines = [
        "=== SELF-TEST (engine validation against real genesis block) ===",
        f"genesis hash: {genesis.get('genesis_hash', '')}",
        f"expected:     {genesis.get('expected', GENESIS_HASH_EXPECTED)}",
        "target diff:  1.0",
        "MATCH" if genesis.get("match") else "MISMATCH",
        f"single-thread core: {bench.get('hashrate_hs', 0):,.0f} H/s",
        "=" * 64,
    ]
    return "\n".join(lines)


def run_self_test(benchmark_duration_sec: float = 2.0) -> dict[str, Any]:
    """Run genesis verification and single-thread benchmark."""
    genesis = verify_genesis_hash()
    benchmark = benchmark_single_thread(benchmark_duration_sec)
    result = {
        "ok": genesis.get("match", False) and benchmark.get("hashrate_hs", 0) > 0,
        "match": genesis.get("match", False),
        "genesis": genesis,
        "benchmark": benchmark,
        "text": "",
    }
    result["text"] = format_self_test_text(result)
    return result
