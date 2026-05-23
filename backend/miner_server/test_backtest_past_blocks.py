"""
Integration tests: backtest pipeline against synthetic "past blocks" (mocked RPC).
Ensures classification (minimal list vs thesis candidates vs miss) matches _run_backtest.
"""
import os
import sys
import unittest
from unittest.mock import patch

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from config import MinerConfig
from thesis_mining import (
    build_candidate_list,
    get_minimal_nonce_list,
    nonce_generate_unified_py,
    recovery_suggested_nonce,
)
from backtest_last_100_blocks import _run_backtest

NONCE_SPACE = 0xFFFFFFFF + 1
BITS_REGTEST = "207fffff"


def _thesis_sets(height: int, bits_hex: str = BITS_REGTEST):
    from thesis_mining import bits_compact_to_difficulty_bits

    bits_int = int(bits_hex, 16)
    bits_bytes = bytes.fromhex(bits_hex)
    difficulty_bits = bits_compact_to_difficulty_bits(bits_int)
    base = nonce_generate_unified_py(height, difficulty_bits)
    minimal = get_minimal_nonce_list(height, difficulty_bits, bits_bytes)
    rec = recovery_suggested_nonce(bits_bytes)
    rec_val = rec if rec is not None else base
    cands = build_candidate_list(base, rec_val, 0, NONCE_SPACE, block_height=height)
    cand_set = set(cands)
    min_set = set(minimal)
    return base, minimal, cands, cand_set, min_set


def _first_nonce_outside_thesis(height: int) -> int:
    """Deterministic nonce not in minimal or candidate list."""
    _, _, _, cand_set, min_set = _thesis_sets(height)
    for n in range(0, 0x100000):
        if n not in cand_set and n not in min_set:
            return n
    raise RuntimeError("could not find nonce outside thesis sets")


class TestBacktestPastBlocksMock(unittest.TestCase):
    """Mock Bitcoin Core: replay fixed heights with known nonces."""

    def test_phase2_hit_when_nonce_in_candidate_list(self) -> None:
        height = 100
        _, _, cands, _, min_set = _thesis_sets(height)
        chosen = next((n for n in cands if n not in min_set), None)
        self.assertIsNotNone(chosen, "need candidate outside minimal set")

        def mock_info(cfg: MinerConfig):
            return {"blocks": height, "chain": "regtest"}

        def mock_hash(cfg: MinerConfig, h: int):
            return f"{h:064x}"

        def mock_getblock(cfg: MinerConfig, block_hash: str, verbosity: int):
            return {"nonce": chosen, "bits": BITS_REGTEST}

        with patch("backtest_last_100_blocks.getblockchaininfo", mock_info):
            with patch("backtest_last_100_blocks.getblockhash", mock_hash):
                with patch("backtest_last_100_blocks.getblock", mock_getblock):
                    cfg = MinerConfig(network="regtest", rpc_port=18443)
                    r = _run_backtest(cfg, num_blocks=1)

        self.assertEqual(r["total"], 1)
        self.assertEqual(r["phase2_hits"], 1)
        self.assertEqual(r["phase1_hits"], 0)
        self.assertEqual(r["misses"], 0)
        self.assertEqual(r["block_details"][0]["hit_type"], "phase2")

    def test_miss_when_nonce_outside_thesis_sets(self) -> None:
        height = 200
        outsider = _first_nonce_outside_thesis(height)

        def mock_info(cfg: MinerConfig):
            return {"blocks": height, "chain": "regtest"}

        def mock_hash(cfg: MinerConfig, h: int):
            return f"{h:064x}"

        def mock_getblock(cfg: MinerConfig, block_hash: str, verbosity: int):
            return {"nonce": outsider, "bits": BITS_REGTEST}

        with patch("backtest_last_100_blocks.getblockchaininfo", mock_info):
            with patch("backtest_last_100_blocks.getblockhash", mock_hash):
                with patch("backtest_last_100_blocks.getblock", mock_getblock):
                    cfg = MinerConfig(network="regtest", rpc_port=18443)
                    r = _run_backtest(cfg, num_blocks=1)

        self.assertEqual(r["total"], 1)
        self.assertEqual(r["misses"], 1)
        self.assertEqual(r["phase1_hits"], 0)
        self.assertEqual(r["phase2_hits"], 0)

    def test_multi_block_window_counts(self) -> None:
        """Three heights: phase2 hit, miss, phase1 hit."""
        h0, h1, h2 = 50, 51, 52
        _, _, cands0, _, ms0 = _thesis_sets(h0)
        p2_nonce = next((n for n in cands0 if n not in ms0), None)
        self.assertIsNotNone(p2_nonce)
        miss_nonce = _first_nonce_outside_thesis(h1)
        _, min2, _, _, _ = _thesis_sets(h2)
        p1_nonce = min2[0]

        blocks_by_height = {
            h0: {"nonce": p2_nonce, "bits": BITS_REGTEST},
            h1: {"nonce": miss_nonce, "bits": BITS_REGTEST},
            h2: {"nonce": p1_nonce, "bits": BITS_REGTEST},
        }

        def mock_info(cfg: MinerConfig):
            return {"blocks": h2, "chain": "regtest"}

        hash_to_block: dict[str, dict] = {}

        def mock_hash(cfg: MinerConfig, h: int) -> str:
            hs = f"{h:064x}"
            hash_to_block[hs] = blocks_by_height[h]
            return hs

        def mock_getblock(cfg: MinerConfig, block_hash: str, verbosity: int) -> dict:
            return hash_to_block[block_hash]

        with patch("backtest_last_100_blocks.getblockchaininfo", mock_info):
            with patch("backtest_last_100_blocks.getblockhash", mock_hash):
                with patch("backtest_last_100_blocks.getblock", mock_getblock):
                    cfg = MinerConfig(network="regtest", rpc_port=18443)
                    r = _run_backtest(cfg, num_blocks=3)

        self.assertEqual(r["total"], 3)
        self.assertEqual(r["phase2_hits"], 1)
        self.assertEqual(r["misses"], 1)
        self.assertEqual(r["phase1_hits"], 1)


if __name__ == "__main__":
    unittest.main()
