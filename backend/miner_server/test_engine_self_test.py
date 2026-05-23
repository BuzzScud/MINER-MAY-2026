#!/usr/bin/env python3
"""Unit tests for engine_self_test (genesis MATCH + benchmark)."""
import os
import sys
import unittest

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from engine_self_test import (
    GENESIS_HASH_EXPECTED,
    benchmark_single_thread,
    run_self_test,
    verify_genesis_hash,
)


class TestEngineSelfTest(unittest.TestCase):
    def test_verify_genesis_hash_match(self) -> None:
        r = verify_genesis_hash()
        self.assertTrue(r["match"])
        self.assertEqual(r["genesis_hash"], GENESIS_HASH_EXPECTED)
        self.assertTrue(r["ok"])

    def test_benchmark_positive_hashrate(self) -> None:
        r = benchmark_single_thread(duration_sec=0.15)
        self.assertGreater(r["hashes"], 0)
        self.assertGreater(r["hashrate_hs"], 0)
        self.assertEqual(r["target_diff"], 1.0)

    def test_run_self_test(self) -> None:
        r = run_self_test(benchmark_duration_sec=0.15)
        self.assertTrue(r["match"])
        self.assertTrue(r["ok"])
        self.assertIn("MATCH", r["text"])
        self.assertNotIn("MISMATCH", r["text"].split("\n")[4])


if __name__ == "__main__":
    unittest.main()
