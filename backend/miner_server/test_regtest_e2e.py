#!/usr/bin/env python3
"""
End-to-end regtest test: start a temporary Bitcoin Core regtest node,
mine a block with our miner, and verify it is accepted.

Requirements:
  - bitcoin-cli and bitcoind on PATH or at BITCOIND_PATH / BITCOIN_CLI_PATH
  - No other regtest node on the same port (18543 by default to avoid conflicts)

Usage:
    python3 test_regtest_e2e.py
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

# Use a non-default port to avoid conflicts with any running regtest node
E2E_RPC_PORT = 18543
E2E_P2P_PORT = 18544

# Paths to bitcoin binaries; override via env vars if not on PATH
BITCOIND_PATH = os.environ.get(
    "BITCOIND_PATH",
    shutil.which("bitcoind") or "/Users/server1/Desktop/MINER 2/bitcoin-28.1/bin/bitcoind",
)
BITCOIN_CLI_PATH = os.environ.get(
    "BITCOIN_CLI_PATH",
    shutil.which("bitcoin-cli") or "/Users/server1/Desktop/MINER 2/bitcoin-28.1/bin/bitcoin-cli",
)


def _cli(datadir: str, *args: str, timeout: int = 30) -> str:
    """Run bitcoin-cli against our test regtest node."""
    cmd = [
        BITCOIN_CLI_PATH,
        f"-datadir={datadir}",
        "-regtest",
        f"-rpcport={E2E_RPC_PORT}",
    ] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"bitcoin-cli {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def _wait_for_rpc(datadir: str, max_wait: int = 30) -> bool:
    """Wait for bitcoind RPC to become available."""
    deadline = time.time() + max_wait
    while time.time() < deadline:
        try:
            _cli(datadir, "getblockchaininfo")
            return True
        except Exception:
            time.sleep(0.5)
    return False


class TestRegtestE2E(unittest.TestCase):
    """End-to-end: start regtest bitcoind, mine a block with our miner, verify acceptance."""

    _datadir: str = ""
    _bitcoind_proc: subprocess.Popen = None  # type: ignore

    @classmethod
    def setUpClass(cls) -> None:
        if not os.path.isfile(BITCOIND_PATH):
            raise unittest.SkipTest(f"bitcoind not found at {BITCOIND_PATH}")
        if not os.path.isfile(BITCOIN_CLI_PATH):
            raise unittest.SkipTest(f"bitcoin-cli not found at {BITCOIN_CLI_PATH}")

        cls._datadir = tempfile.mkdtemp(prefix="btc_e2e_regtest_")
        regtest_dir = os.path.join(cls._datadir, "regtest")
        os.makedirs(regtest_dir, exist_ok=True)

        conf_path = os.path.join(cls._datadir, "bitcoin.conf")
        with open(conf_path, "w") as f:
            f.write(
                f"regtest=1\n"
                f"server=1\n"
                f"rpcport={E2E_RPC_PORT}\n"
                f"port={E2E_P2P_PORT}\n"
                f"listen=0\n"
                f"listenonion=0\n"
                f"rpcallowip=127.0.0.1\n"
                f"fallbackfee=0.0001\n"
                f"[regtest]\n"
                f"rpcbind=127.0.0.1\n"
            )

        cls._bitcoind_proc = subprocess.Popen(
            [BITCOIND_PATH, f"-datadir={cls._datadir}", "-regtest", f"-rpcport={E2E_RPC_PORT}", f"-port={E2E_P2P_PORT}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if not _wait_for_rpc(cls._datadir, max_wait=30):
            cls._bitcoind_proc.kill()
            cls._bitcoind_proc.wait()
            shutil.rmtree(cls._datadir, ignore_errors=True)
            raise unittest.SkipTest("bitcoind did not start in time")

        # Create a wallet for address generation
        try:
            _cli(cls._datadir, "createwallet", "test_e2e")
        except RuntimeError:
            pass  # wallet may already exist

    @classmethod
    def tearDownClass(cls) -> None:
        if cls._bitcoind_proc and cls._bitcoind_proc.poll() is None:
            try:
                _cli(cls._datadir, "stop")
                cls._bitcoind_proc.wait(timeout=15)
            except Exception:
                cls._bitcoind_proc.kill()
                cls._bitcoind_proc.wait(timeout=5)
        if cls._datadir and os.path.isdir(cls._datadir):
            shutil.rmtree(cls._datadir, ignore_errors=True)

    def test_mine_block_on_regtest(self) -> None:
        """Mine a block using our miner on regtest and verify it was accepted."""
        from config import MinerConfig
        from miner_loop import run_mining_loop_unified
        from btc_rpc import getblockchaininfo

        # Get a regtest address from Bitcoin Core
        address = _cli(self._datadir, "getnewaddress", "", "bech32")
        self.assertTrue(address.startswith("bcrt1"), f"Expected bcrt1 address, got: {address}")

        # Read cookie auth from our temporary datadir
        cookie_path = os.path.join(self._datadir, "regtest", ".cookie")
        self.assertTrue(os.path.isfile(cookie_path), f"Cookie file not found: {cookie_path}")

        config = MinerConfig(
            rpc_host="127.0.0.1",
            rpc_port=E2E_RPC_PORT,
            network="regtest",
            mining_address=address,
            num_workers=1,
            use_unified=True,
            rpc_cookie_file=cookie_path,
        )

        # Check initial height
        info = getblockchaininfo(config)
        initial_height = info["blocks"]

        # Mine with our miner (regtest difficulty is trivial; should find block quickly)
        logs = []
        hashes, blocks = run_mining_loop_unified(
            config,
            on_log=lambda msg: logs.append(msg),
        )
        self.assertGreaterEqual(hashes, 1, "Should have computed at least 1 hash")
        self.assertEqual(blocks, 1, f"Should have found exactly 1 block. Logs: {logs}")

        # Verify block was accepted
        info_after = getblockchaininfo(config)
        new_height = info_after["blocks"]
        self.assertEqual(new_height, initial_height + 1, "Chain height should have incremented by 1")

    def test_mine_multiple_blocks(self) -> None:
        """Mine 3 blocks sequentially to verify continuous mining works."""
        from config import MinerConfig
        from miner_loop import run_mining_loop_unified
        from btc_rpc import getblockchaininfo

        address = _cli(self._datadir, "getnewaddress", "", "bech32")
        cookie_path = os.path.join(self._datadir, "regtest", ".cookie")
        config = MinerConfig(
            rpc_host="127.0.0.1",
            rpc_port=E2E_RPC_PORT,
            network="regtest",
            mining_address=address,
            num_workers=1,
            use_unified=True,
            rpc_cookie_file=cookie_path,
        )

        info = getblockchaininfo(config)
        initial_height = info["blocks"]

        for i in range(3):
            hashes, blocks = run_mining_loop_unified(config)
            self.assertEqual(blocks, 1, f"Block {i+1}: should have found a block")

        info_after = getblockchaininfo(config)
        self.assertEqual(info_after["blocks"], initial_height + 3)

    def test_supt_streams_after_mining_round(self) -> None:
        """With BTC_SUPT_LOG=1, one mining round produces Stream A and Stream B CSV rows."""
        import csv
        import importlib
        import supt_streams as ss

        supt_dir = tempfile.mkdtemp(prefix="btc_supt_e2e_")
        os.environ["BTC_SUPT_LOG"] = "1"
        os.environ["BTC_SUPT_DATA_DIR"] = supt_dir
        os.environ["BTC_SUPT_SAMPLE_EVERY"] = "64"
        importlib.reload(ss)

        try:
            from config import MinerConfig
            from miner_loop import run_mining_loop_unified

            address = _cli(self._datadir, "getnewaddress", "", "bech32")
            cookie_path = os.path.join(self._datadir, "regtest", ".cookie")
            config = MinerConfig(
                rpc_host="127.0.0.1",
                rpc_port=E2E_RPC_PORT,
                network="regtest",
                mining_address=address,
                num_workers=1,
                use_unified=True,
                rpc_cookie_file=cookie_path,
            )
            run_mining_loop_unified(config)
            path_a = os.path.join(supt_dir, "nonce_hash_stream.csv")
            path_b = os.path.join(supt_dir, "block_cadence.csv")
            self.assertTrue(os.path.isfile(path_a), "Stream A CSV should exist")
            self.assertTrue(os.path.isfile(path_b), "Stream B CSV should exist")
            with open(path_b, encoding="utf-8") as f:
                rows_b = list(csv.reader(f))
            self.assertGreaterEqual(len(rows_b), 2, "Stream B should have header + at least one row")

            import importlib
            import supt_probe as sp

            importlib.reload(sp)
            report = sp.run_probe_report()
            self.assertTrue(report.get("ok"), report)
            probes = report.get("probes", {})
            for key in (
                "stream_a_hash_int_512",
                "stream_a_hash_int_71",
                "stream_b_hashes_tried_512",
                "stream_b_hashes_tried_71",
            ):
                self.assertIn(key, probes, f"missing probe key {key}")
        finally:
            ss.shutdown_writer()
            os.environ.pop("BTC_SUPT_DATA_DIR", None)
            shutil.rmtree(supt_dir, ignore_errors=True)

    def test_search_mode_benchmark_compare(self) -> None:
        """Thesis vs linear benchmark produces mode-tagged SUPT compare data."""
        import importlib
        import supt_streams as ss
        from config import MinerConfig, SEARCH_MODE_LINEAR, SEARCH_MODE_THESIS
        from miner_loop import run_search_mode_benchmark
        from supt_probe import run_compare_report

        supt_dir = tempfile.mkdtemp(prefix="btc_mode_e2e_")
        os.environ["BTC_SUPT_LOG"] = "1"
        os.environ["BTC_SUPT_DATA_DIR"] = supt_dir
        os.environ["BTC_SUPT_SAMPLE_EVERY"] = "64"
        os.environ["BTC_NUM_WORKERS"] = "1"
        importlib.reload(ss)

        try:
            address = _cli(self._datadir, "getnewaddress", "", "bech32")
            cookie_path = os.path.join(self._datadir, "regtest", ".cookie")
            base = dict(
                rpc_host="127.0.0.1",
                rpc_port=E2E_RPC_PORT,
                network="regtest",
                mining_address=address,
                num_workers=1,
                use_unified=True,
                rpc_cookie_file=cookie_path,
            )
            thesis_cfg = MinerConfig(**base, search_mode=SEARCH_MODE_THESIS)
            linear_cfg = MinerConfig(**base, search_mode=SEARCH_MODE_LINEAR)
            thesis_result = run_search_mode_benchmark(thesis_cfg, rounds=1)
            self.assertTrue(thesis_result["ok"], thesis_result.get("errors"))
            linear_result = run_search_mode_benchmark(linear_cfg, rounds=1)
            self.assertTrue(linear_result["ok"], linear_result.get("errors"))
            compare = run_compare_report()
            self.assertTrue(compare.get("ok"))
            self.assertGreaterEqual(compare["thesis"]["rounds"], 1)
            self.assertGreaterEqual(compare["linear"]["rounds"], 1)
            linear_samples = compare["linear"].get("stream_a_samples", 0)
            thesis_samples = compare["thesis"].get("stream_a_samples", 0)
            self.assertGreater(
                linear_samples,
                thesis_samples,
                "linear mode should produce more Stream A samples per round than thesis",
            )
        finally:
            ss.shutdown_writer()
            os.environ.pop("BTC_SUPT_DATA_DIR", None)
            os.environ.pop("BTC_NUM_WORKERS", None)
            shutil.rmtree(supt_dir, ignore_errors=True)

    def test_segwit_coinbase_format(self) -> None:
        """Verify the segwit coinbase produces valid witness serialization."""
        from miner_loop import (
            _build_coinbase,
            _coinbase_add_witness,
            _double_sha256,
        )

        # Use a raw P2WPKH script_pubkey directly (20-byte witness program)
        script_pubkey = bytes([0x00, 0x14]) + bytes(20)
        commitment_hex = "6a24aa21a9ed" + "ab" * 32

        stripped = _build_coinbase(100, 5000000000, script_pubkey, {}, commitment_hex)
        witness = _coinbase_add_witness(stripped)

        # Witness version must be longer (marker + flag + witness stack)
        self.assertGreater(len(witness), len(stripped))

        # First 4 bytes (version) must match
        self.assertEqual(witness[:4], stripped[:4])

        # Marker = 0x00, flag = 0x01
        self.assertEqual(witness[4], 0x00)
        self.assertEqual(witness[5], 0x01)

        # Last 4 bytes (locktime) must match
        self.assertEqual(witness[-4:], stripped[-4:])

        # Witness reserved value: 32 bytes of zeros before locktime
        # Format: witness_count(1) + item_len(32) + zeros(32) + locktime(4)
        witness_reserved = witness[-(4 + 32 + 1 + 1):-4]
        self.assertEqual(witness_reserved[0], 1)  # 1 witness item
        self.assertEqual(witness_reserved[1], 32)  # 32 bytes
        self.assertEqual(witness_reserved[2:], bytes(32))  # all zeros

        # Txid must be computed from stripped version (not witness)
        txid_stripped = _double_sha256(stripped)
        txid_witness = _double_sha256(witness)
        self.assertNotEqual(txid_stripped, txid_witness, "txid must differ between stripped and witness")


def run_all() -> int:
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestRegtestE2E)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run_all())
