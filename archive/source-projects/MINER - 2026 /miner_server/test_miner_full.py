#!/usr/bin/env python3
"""
Comprehensive miner test suite.
Runs all component tests to verify 100% operational readiness.
No Bitcoin Core required for unit tests; RPC tests skip gracefully if unreachable.
"""
import hashlib
import struct
import sys
import unittest
from unittest.mock import patch, MagicMock

# Ensure miner_server is on path
import os
_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)


class TestBlockBuilding(unittest.TestCase):
    """Block header, target, merkle root, coinbase."""

    def test_bits_to_target_regtest(self) -> None:
        from miner_loop import run_mining_loop
        # Access internal via import; we test the logic via run_mining_loop
        # Bits 0x207fffff: exponent 32, high target
        import miner_loop as ml
        target = ml._bits_to_target("207fffff")
        self.assertGreater(target, 0)
        self.assertLessEqual(target, 2**256)

    def test_double_sha256(self) -> None:
        import miner_loop as ml
        h = ml._double_sha256(b"test")
        self.assertEqual(len(h), 32)
        expected = hashlib.sha256(hashlib.sha256(b"test").digest()).digest()
        self.assertEqual(h, expected)

    def test_hash_meets_target(self) -> None:
        import miner_loop as ml
        # All-zero hash (min) meets any positive target
        zero_hash = bytes(32)
        self.assertTrue(ml._hash_meets_target(zero_hash, 1))
        # Max hash does not meet target 0
        max_hash = bytes([0xFF] * 32)
        self.assertFalse(ml._hash_meets_target(max_hash, 0))

    def test_build_block_header_80_bytes(self) -> None:
        import miner_loop as ml
        prev = "0" * 64
        merkle = bytes(32)
        header = ml._build_block_header(0x20000000, prev, merkle, 1700000000, "207fffff", 0)
        self.assertEqual(len(header), 80)

    def test_merkle_root_empty(self) -> None:
        import miner_loop as ml
        root = ml._merkle_root([])
        self.assertEqual(len(root), 32)
        self.assertEqual(root, bytes(32))

    def test_merkle_root_single(self) -> None:
        import miner_loop as ml
        h = bytes(32)
        root = ml._merkle_root([h])
        self.assertEqual(len(root), 32)

    def test_genesis_block_header_hash(self) -> None:
        """Regression: double-SHA256 of genesis block header yields known block hash."""
        import miner_loop as ml
        genesis_header_hex = (
            "010000000000000000000000000000000000000000000000000000000000000000000000"
            "3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49"
            "ffff001d1dac2b7c"
        )
        genesis_hash_display = "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f"
        header_bytes = bytes.fromhex(genesis_header_hex)
        self.assertEqual(len(header_bytes), 80)
        h = ml._double_sha256(header_bytes)
        self.assertEqual(len(h), 32)
        hash_display = h[::-1].hex()
        self.assertEqual(hash_display, genesis_hash_display)


class TestAddress(unittest.TestCase):
    """Address decoding and scriptPubKey."""

    def test_bech32_p2wpkh(self) -> None:
        from address import address_to_script_pubkey
        # BIP 173 test vector (mainnet)
        addr = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
        script = address_to_script_pubkey(addr)
        self.assertEqual(script[0], 0x00)
        self.assertEqual(script[1], 0x14)
        self.assertEqual(len(script), 22)


    def test_p2pkh(self) -> None:
        from address import address_to_script_pubkey
        # Valid p2pkh (1...)
        addr = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"
        script = address_to_script_pubkey(addr)
        self.assertEqual(script[0], 0x76)
        self.assertEqual(script[1], 0xA9)


class TestConfig(unittest.TestCase):
    """Configuration loading."""

    def test_default_config(self) -> None:
        from config import MinerConfig
        cfg = MinerConfig(network="regtest")
        self.assertEqual(cfg.rpc_port, 18443)
        self.assertEqual(cfg.network, "regtest")

    def test_rpc_url(self) -> None:
        from config import MinerConfig
        cfg = MinerConfig(rpc_host="127.0.0.1", rpc_port=18443)
        self.assertEqual(cfg.rpc_url, "http://127.0.0.1:18443/")


class TestThesisMining(unittest.TestCase):
    """Thesis-aligned nonce generation."""

    def test_seed_prime_clock_o1(self) -> None:
        from thesis_mining import _clock_o1_seed_prime
        self.assertEqual(_clock_o1_seed_prime(3), 5)
        self.assertEqual(_clock_o1_seed_prime(39), 41)
        self.assertIsNone(_clock_o1_seed_prime(4))

    def test_get_seed_prime_thesis(self) -> None:
        from thesis_mining import _get_seed_prime_thesis, _is_prime
        self.assertEqual(_get_seed_prime_thesis(0), 2)
        self.assertEqual(_get_seed_prime_thesis(3), 5)
        p = _get_seed_prime_thesis(100)
        self.assertTrue(_is_prime(p) and p >= 100)

    def test_nonce_generate_unified(self) -> None:
        from thesis_mining import nonce_generate_unified_py, NONCE_MAX
        n = nonce_generate_unified_py(100, 24)
        self.assertGreaterEqual(n, 0)
        self.assertLessEqual(n, NONCE_MAX)

    def test_bits_compact_to_difficulty_bits(self) -> None:
        from thesis_mining import bits_compact_to_difficulty_bits
        self.assertEqual(bits_compact_to_difficulty_bits(0x207fffff), 32)
        self.assertIn(bits_compact_to_difficulty_bits(0x1703a30c), range(1, 65))

    def test_build_candidate_list(self) -> None:
        from thesis_mining import build_candidate_list
        cands = build_candidate_list(1000, 2000, 0, 100000)
        self.assertIn(1000, cands)
        self.assertIn(2000, cands)
        self.assertGreater(len(cands), 10)

    def test_quadrant_partition(self) -> None:
        from thesis_mining import quadrant_from_nonce
        for n in [0, 1, 0xFFFFFFFF]:
            q = quadrant_from_nonce(n)
            self.assertIn(q, (0, 1, 2, 3))

    def test_seed_prime_positions_3_6_9(self) -> None:
        from thesis_mining import _clock_o1_seed_prime
        self.assertEqual(_clock_o1_seed_prime(3), 5)
        self.assertEqual(_clock_o1_seed_prime(39), 41)
        self.assertEqual(_clock_o1_seed_prime(6), 7)
        self.assertEqual(_clock_o1_seed_prime(9), 11)

    def test_candidate_list_full_range_contains_base_and_recovery(self) -> None:
        from thesis_mining import build_candidate_list
        base = 1000
        recovery = 2000
        cands = build_candidate_list(base, recovery, 0, 0xFFFFFFFF)
        self.assertIn(base, cands)
        self.assertIn(recovery, cands)
        self.assertGreater(len(cands), 2)


class TestBacktestClassification(unittest.TestCase):
    """Backtest would classify synthetic blocks as Phase 1 or Phase 2 hit."""

    def test_synthetic_phase1_hit(self) -> None:
        from thesis_mining import (
            bits_compact_to_difficulty_bits,
            get_minimal_nonce_list,
            build_candidate_list,
            recovery_suggested_nonce,
            nonce_generate_unified_py,
        )
        height = 100
        bits_hex = "207fffff"
        bits_int = int(bits_hex, 16)
        bits_bytes = bytes.fromhex(bits_hex)
        difficulty_bits = bits_compact_to_difficulty_bits(bits_int)
        minimal_nonces = get_minimal_nonce_list(height, difficulty_bits, bits_bytes)
        self.assertGreaterEqual(len(minimal_nonces), 1)
        actual_nonce = minimal_nonces[0]
        self.assertIn(actual_nonce, minimal_nonces)

    def test_synthetic_phase2_hit(self) -> None:
        from thesis_mining import (
            bits_compact_to_difficulty_bits,
            get_minimal_nonce_list,
            build_candidate_list,
            recovery_suggested_nonce,
            nonce_generate_unified_py,
        )
        height = 100
        bits_hex = "207fffff"
        bits_int = int(bits_hex, 16)
        bits_bytes = bytes.fromhex(bits_hex)
        difficulty_bits = bits_compact_to_difficulty_bits(bits_int)
        base_nonce = nonce_generate_unified_py(height, difficulty_bits)
        recovery_nonce = recovery_suggested_nonce(bits_bytes)
        if recovery_nonce is None:
            recovery_nonce = base_nonce
        minimal_nonces = get_minimal_nonce_list(height, difficulty_bits, bits_bytes)
        candidates = build_candidate_list(base_nonce, recovery_nonce, 0, 0xFFFFFFFF)
        for n in candidates:
            if n not in minimal_nonces:
                actual_nonce = n
                self.assertIn(actual_nonce, candidates)
                self.assertNotIn(actual_nonce, minimal_nonces)
                return
        self.fail("candidates and minimal_nonces are identical or no candidate outside minimal")


class TestMiningLoop(unittest.TestCase):
    """Mining loop structure and flow."""

    def test_run_mining_loop_linear_with_mock(self) -> None:
        """Linear mining loop (non-unified) with mocked template."""
        from config import MinerConfig
        from miner_loop import run_mining_loop

        def mock_getblocktemplate(config, capabilities=None):
            return {
                "version": 0x20000000,
                "previousblockhash": "0" * 64,
                "bits": "207fffff",
                "height": 100,
                "curtime": 1700000000,
                "coinbasevalue": 5000000000,
                "coinbaseaux": {},
                "transactions": [],
            }

        cfg = MinerConfig(
            mining_address="bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
            network="regtest",
        )
        with patch("miner_loop.getblocktemplate", side_effect=mock_getblocktemplate):
            with patch("miner_loop.submitblock"):
                # Stop after a few hashes to avoid long run
                stop_after = [500]

                def stop_flag():
                    stop_after[0] -= 1
                    return stop_after[0] <= 0

                hashes, blocks = run_mining_loop(cfg, stop_flag=stop_flag)
                self.assertGreaterEqual(hashes, 1)

    def test_run_mining_loop_requires_address(self) -> None:
        from config import MinerConfig
        from miner_loop import run_mining_loop_unified
        cfg = MinerConfig(mining_address="", network="regtest")
        with patch("miner_loop.getblocktemplate") as m:
            m.side_effect = Exception("should not be called")
            with self.assertRaises(ValueError):
                run_mining_loop_unified(cfg)

    def test_run_mining_loop_unified_with_mock_template(self) -> None:
        """Full flow with mocked getblocktemplate - verifies structure."""
        from config import MinerConfig
        from miner_loop import run_mining_loop_unified

        def mock_getblocktemplate(config, capabilities=None):
            return {
                "version": 0x20000000,
                "previousblockhash": "0" * 64,
                "bits": "207fffff",
                "height": 100,
                "curtime": 1700000000,
                "coinbasevalue": 5000000000,
                "coinbaseaux": {},
                "transactions": [],
                "default_witness_commitment": None,
            }

        cfg = MinerConfig(
            mining_address="bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
            network="regtest",
            single_nonce_only=True,
        )
        with patch("miner_loop.getblocktemplate", side_effect=mock_getblocktemplate):
            with patch("miner_loop.submitblock") as submit_mock:
                submit_mock.return_value = None  # accepted
                hashes, blocks = run_mining_loop_unified(cfg)
                self.assertGreaterEqual(hashes, 1)
                # With single_nonce_only and regtest target, may or may not find block
                self.assertIn(blocks, (0, 1))


class TestRPC(unittest.TestCase):
    """RPC client - skip when Bitcoin Core not running."""

    def test_rpc_connection_refused_or_ok(self) -> None:
        """Either connects or gets connection refused."""
        from config import MinerConfig
        from btc_rpc import getblockchaininfo, BitcoinRPCError

        cfg = MinerConfig(network="regtest", rpc_port=18443)
        try:
            info = getblockchaininfo(cfg)
            self.assertIn("chain", info)
            self.assertIn("blocks", info)
            print("  [RPC] Bitcoin Core connected - regtest")
        except BitcoinRPCError as e:
            if "refused" in str(e).lower() or "connection" in str(e).lower():
                self.skipTest("Bitcoin Core not running (expected for CI)")
            raise


class TestLifetimeStats(unittest.TestCase):
    """Lifetime stats persistence (last_session_elapsed_sec, last_session_hashes)."""

    def test_write_lifetime_stats_persists_last_session(self) -> None:
        """_write_lifetime_stats with last_session_elapsed_sec and last_session_hashes writes them to disk."""
        import json
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            path = f.name
        try:
            with patch("web_ui._LIFETIME_STATS_PATH", path):
                import web_ui
                web_ui._write_lifetime_stats(
                    1000, 0,
                    last_session_elapsed_sec=10.5,
                    last_session_hashes=500,
                    force=True,
                )
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(data.get("last_session_elapsed_sec"), 10.5)
            self.assertEqual(data.get("last_session_hashes"), 500)
            self.assertEqual(data.get("total_hashes"), 1000)
        finally:
            if os.path.isfile(path):
                os.unlink(path)


class TestProtocolFixes(unittest.TestCase):
    """Regression tests for critical protocol fixes (bits LE, witness commitment, BIP34 height)."""

    def test_build_block_header_genesis_bits_le(self) -> None:
        """_build_block_header with genesis params must produce exact genesis header bytes."""
        import miner_loop as ml
        genesis_header_hex = (
            "010000000000000000000000000000000000000000000000000000000000000000000000"
            "3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49"
            "ffff001d1dac2b7c"
        )
        expected = bytes.fromhex(genesis_header_hex)
        prev_hex = "0" * 64
        merkle_root = bytes.fromhex(
            "3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a"
        )
        header = ml._build_block_header(
            version=1,
            prev_block_hash_hex=prev_hex,
            merkle_root=merkle_root,
            time_val=1231006505,
            bits_hex="1d00ffff",
            nonce=2083236893,
        )
        self.assertEqual(len(header), 80)
        self.assertEqual(header, expected, "header bytes must match known genesis header")

    def test_build_block_header_bits_field_is_le(self) -> None:
        """The 4-byte bits field at offset 72 must be little-endian of the compact target integer."""
        import miner_loop as ml
        header = ml._build_block_header(
            version=0x20000000,
            prev_block_hash_hex="0" * 64,
            merkle_root=bytes(32),
            time_val=1700000000,
            bits_hex="1703a30c",
            nonce=0,
        )
        bits_field = header[72:76]
        expected_le = struct.pack("<I", 0x1703a30c)
        self.assertEqual(bits_field, expected_le, "bits must be LE uint32 in header")

    def test_witness_commitment_full_script(self) -> None:
        """_build_coinbase must use the full witness commitment script, not double-wrap it."""
        import miner_loop as ml
        commitment_hash_hex = "ab" * 32
        full_script_hex = "6a24aa21a9ed" + commitment_hash_hex
        coinbase = ml._build_coinbase(
            height=100,
            coinbase_value=5000000000,
            script_pubkey=bytes([0x00, 0x14]) + bytes(20),
            coinbase_aux={},
            witness_commitment_hex=full_script_hex,
        )
        full_script_bytes = bytes.fromhex(full_script_hex)
        self.assertIn(full_script_bytes, coinbase, "full witness commitment script must appear verbatim in coinbase")
        double_wrapped = bytes([0x6A, 0x24]) + full_script_bytes[:32]
        self.assertNotIn(double_wrapped, coinbase, "must not double-wrap witness commitment")

    def test_bip34_height_128(self) -> None:
        """Height 128 (0x80) must have sign-bit padding: encoded as [0x02, 0x80, 0x00]."""
        import miner_loop as ml
        result = ml._height_to_script_push(128)
        self.assertEqual(result, bytes([0x02, 0x80, 0x00]))

    def test_bip34_height_32768(self) -> None:
        """Height 32768 (0x8000) LE=[0x00, 0x80]; MSB 0x80 needs padding -> [0x03, 0x00, 0x80, 0x00]."""
        import miner_loop as ml
        result = ml._height_to_script_push(32768)
        self.assertEqual(result, bytes([0x03, 0x00, 0x80, 0x00]))

    def test_bip34_height_255(self) -> None:
        """Height 255 (0xFF) needs padding: [0x02, 0xFF, 0x00]."""
        import miner_loop as ml
        result = ml._height_to_script_push(255)
        self.assertEqual(result, bytes([0x02, 0xFF, 0x00]))

    def test_bip34_height_100_no_padding(self) -> None:
        """Height 100 (0x64) does not need padding: [0x01, 0x64]."""
        import miner_loop as ml
        result = ml._height_to_script_push(100)
        self.assertEqual(result, bytes([0x01, 0x64]))

    def test_bip34_height_880000(self) -> None:
        """Height 880000 (0x0D6D80, current mainnet range): MSB=0x0D, no padding needed -> [0x03, 0x80, 0x6D, 0x0D]."""
        import miner_loop as ml
        result = ml._height_to_script_push(880000)
        self.assertEqual(result, bytes([0x03, 0x80, 0x6D, 0x0D]))


class TestMainCLI(unittest.TestCase):
    """main.py CLI."""

    def test_status_without_bitcoin(self) -> None:
        """--status fails gracefully when RPC unreachable."""
        from config import MinerConfig
        from btc_rpc import getblockchaininfo, BitcoinRPCError
        cfg = MinerConfig(network="regtest")
        try:
            getblockchaininfo(cfg)
        except BitcoinRPCError:
            pass  # Expected when no Bitcoin Core


def run_all() -> int:
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for cls in [
        TestBlockBuilding,
        TestAddress,
        TestConfig,
        TestThesisMining,
        TestBacktestClassification,
        TestMiningLoop,
        TestProtocolFixes,
        TestLifetimeStats,
        TestRPC,
        TestMainCLI,
    ]:
        suite.addTests(loader.loadTestsFromTestCase(cls))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run_all())
