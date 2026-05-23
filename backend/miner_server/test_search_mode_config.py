#!/usr/bin/env python3
"""Unit tests for search_mode config (thesis | linear | hybrid)."""
import os
import shutil
import sys
import tempfile
import unittest

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from config import (
    MinerConfig,
    SEARCH_MODE_HYBRID,
    SEARCH_MODE_LINEAR,
    SEARCH_MODE_THESIS,
    effective_phase3_count,
    normalize_search_mode,
    search_mode_from_env,
)


class TestSearchModeConfig(unittest.TestCase):
    def test_normalize_defaults_to_thesis(self) -> None:
        self.assertEqual(normalize_search_mode(None), SEARCH_MODE_THESIS)
        self.assertEqual(normalize_search_mode(""), SEARCH_MODE_THESIS)
        self.assertEqual(normalize_search_mode("invalid"), SEARCH_MODE_THESIS)

    def test_normalize_valid_modes(self) -> None:
        self.assertEqual(normalize_search_mode("linear"), SEARCH_MODE_LINEAR)
        self.assertEqual(normalize_search_mode("HYBRID"), SEARCH_MODE_HYBRID)
        self.assertEqual(normalize_search_mode("thesis"), SEARCH_MODE_THESIS)

    def test_miner_config_post_init_syncs_use_unified(self) -> None:
        thesis = MinerConfig(search_mode="thesis")
        self.assertTrue(thesis.use_unified)
        self.assertEqual(thesis.search_mode, SEARCH_MODE_THESIS)
        linear = MinerConfig(search_mode="linear", use_unified=True)
        self.assertFalse(linear.use_unified)
        hybrid = MinerConfig(search_mode="hybrid")
        self.assertTrue(hybrid.use_unified)

    def test_search_mode_from_env(self) -> None:
        old = os.environ.get("BTC_SEARCH_MODE")
        try:
            os.environ["BTC_SEARCH_MODE"] = "linear"
            self.assertEqual(search_mode_from_env(), SEARCH_MODE_LINEAR)
        finally:
            if old is None:
                os.environ.pop("BTC_SEARCH_MODE", None)
            else:
                os.environ["BTC_SEARCH_MODE"] = old

    def test_effective_phase3_hybrid_default(self) -> None:
        old = os.environ.get("BTC_PHASE3_NONCES_PER_WORKER")
        try:
            os.environ.pop("BTC_PHASE3_NONCES_PER_WORKER", None)
            cfg = MinerConfig(search_mode=SEARCH_MODE_HYBRID)
            self.assertEqual(effective_phase3_count(cfg), 65536)
            cfg2 = MinerConfig(search_mode=SEARCH_MODE_HYBRID, phase3_override=1000)
            self.assertEqual(effective_phase3_count(cfg2), 1000)
        finally:
            if old is not None:
                os.environ["BTC_PHASE3_NONCES_PER_WORKER"] = old

    def test_compare_report_tracks_modes(self) -> None:
        import importlib
        import supt_streams as ss
        from supt_probe import run_compare_report

        tmpdir = tempfile.mkdtemp()
        os.environ["BTC_SUPT_LOG"] = "1"
        os.environ["BTC_SUPT_DATA_DIR"] = tmpdir
        importlib.reload(ss)
        try:
            ss.set_active_search_mode("thesis")
            rid = ss.begin_round(100, search_mode="thesis")
            ss.sample_hash(rid, 0, bytes([1] * 32))
            ss.sample_hash(rid, 64, bytes([2] * 32))
            ss.end_round(rid, -1, 100, 0.5)
            ss.set_active_search_mode("linear")
            rid2 = ss.begin_round(101, search_mode="linear")
            for n in range(0, 512, 64):
                ss.sample_hash(rid2, n, bytes([n % 256] * 32))
            ss.end_round(rid2, -1, 512, 1.0)
            report = run_compare_report()
            self.assertTrue(report["ok"])
            self.assertEqual(report["thesis"]["rounds"], 1)
            self.assertEqual(report["linear"]["rounds"], 1)
            self.assertGreater(report["linear"]["stream_a_samples"], report["thesis"]["stream_a_samples"])
        finally:
            ss.shutdown_writer()
            os.environ.pop("BTC_SUPT_DATA_DIR", None)
            shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
