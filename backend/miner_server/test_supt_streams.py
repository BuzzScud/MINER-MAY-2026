#!/usr/bin/env python3
"""Unit tests for SUPT dual-stream CSV logging."""
import csv
import os
import sys
import tempfile
import unittest

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)


class TestSuptStreams(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.mkdtemp()
        os.environ["BTC_SUPT_LOG"] = "1"
        os.environ["BTC_SUPT_DATA_DIR"] = self._tmpdir
        os.environ["BTC_SUPT_SAMPLE_EVERY"] = "64"
        import importlib
        import supt_streams as ss
        importlib.reload(ss)
        self.ss = ss

    def tearDown(self) -> None:
        self.ss.shutdown_writer()
        os.environ.pop("BTC_SUPT_DATA_DIR", None)

    def test_stream_headers_and_round(self) -> None:
        rid = self.ss.begin_round(950000)
        self.assertGreaterEqual(rid, 1)
        for nonce in (0, 64, 128):
            h = bytes([nonce % 256] * 32)
            self.ss.sample_hash(rid, nonce, h)
        self.ss.end_round(rid, -1, 200, 0.5)
        path_a = os.path.join(self._tmpdir, "nonce_hash_stream.csv")
        path_b = os.path.join(self._tmpdir, "block_cadence.csv")
        self.assertTrue(os.path.isfile(path_a))
        self.assertTrue(os.path.isfile(path_b))
        with open(path_a, encoding="utf-8") as f:
            rows_a = list(csv.reader(f))
        self.assertEqual(rows_a[0], ["block", "nonce", "hash_int"])
        self.assertEqual(len(rows_a) - 1, 3)
        with open(path_b, encoding="utf-8") as f:
            rows_b = list(csv.reader(f))
        self.assertEqual(rows_b[0], ["block", "nonce_found", "hashes_tried", "seconds"])
        self.assertEqual(rows_b[1][0], str(rid))
        self.assertEqual(rows_b[1][1], "-1")

    def test_sample_every_skips(self) -> None:
        rid = self.ss.begin_round(1)
        h = bytes(32)
        self.ss.sample_hash(rid, 1, h)
        self.ss.sample_hash(rid, 64, h)
        self.ss.end_round(rid, -1, 2, 0.01)
        path_a = os.path.join(self._tmpdir, "nonce_hash_stream.csv")
        with open(path_a, encoding="utf-8") as f:
            rows = list(csv.reader(f))[1:]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1], "64")

    def test_get_status(self) -> None:
        st = self.ss.get_status()
        self.assertTrue(st["enabled"])
        self.assertEqual(st["sample_every"], 64)


if __name__ == "__main__":
    unittest.main()
