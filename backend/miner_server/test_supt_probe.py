#!/usr/bin/env python3
"""Unit tests for frozen SUPT probe (alpha=0.01)."""
import csv
import os
import shutil
import sys
import tempfile
import unittest
from typing import Optional

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from supt_probe import (
    ALPHA,
    ANCHORS,
    Z0_OHM,
    anchor_z0,
    frozen_probe,
    reference_fib_ratios,
    reference_phi_lattice,
    regime_label,
    run_probe_report,
    run_z0_probe_report,
)

# Snapshot from fixed ascending sequence (reproducibility)
_FIXED_SEQUENCE = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
_FIXED_D_IJ = 3.3559

_BTC_STUFF_CSV = os.path.join(
    os.path.dirname(_here),
    "..",
    "..",
    "BTC STUFF",
    "nonce_hash_stream.csv",
)
_BTC_STUFF_CSV = os.path.normpath(_BTC_STUFF_CSV)
# Alternate path when run from Desktop layout
_BTC_STUFF_ALT = "/Users/server1/Desktop/BTC STUFF/nonce_hash_stream.csv"


def _fixture_csv_path() -> Optional[str]:
    for p in (_BTC_STUFF_CSV, _BTC_STUFF_ALT):
        if os.path.isfile(p):
            return p
    return None


def _load_hash_ints(path: str) -> list[int]:
    vals: list[int] = []
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            vals.append(int(row["hash_int"]))
    return vals


class TestFrozenProbe(unittest.TestCase):
    def test_known_sequence_reproducibility(self) -> None:
        r = frozen_probe(_FIXED_SEQUENCE)
        self.assertTrue(r["ok"])
        self.assertEqual(r["d_ij"], _FIXED_D_IJ)
        self.assertEqual(r["alpha"], ALPHA)
        r2 = frozen_probe(_FIXED_SEQUENCE)
        self.assertEqual(r["d_ij"], r2["d_ij"])

    def test_length_sensitivity(self) -> None:
        base = list(range(1, 600))
        r512 = frozen_probe(base, window=512)
        r71 = frozen_probe(base, window=71)
        self.assertTrue(r512["ok"] and r71["ok"])
        self.assertNotEqual(r512["d_ij"], r71["d_ij"])
        self.assertEqual(r512["n"], 512)
        self.assertEqual(r71["n"], 71)

    def test_empty_and_short_input(self) -> None:
        r = frozen_probe([])
        self.assertFalse(r["ok"])
        self.assertIn("need >= 3 values", r["error"])
        r2 = frozen_probe([1, 2])
        self.assertFalse(r2["ok"])

    def test_regime_boundaries(self) -> None:
        self.assertEqual(regime_label(0.49), "DEEP_LOCK")
        self.assertEqual(regime_label(0.5), "COHERENCE")
        self.assertEqual(regime_label(0.99), "COHERENCE")
        self.assertEqual(regime_label(1.0), "CLUTCH")
        self.assertEqual(regime_label(1.99), "CLUTCH")
        self.assertEqual(regime_label(2.0), "SUB_FLOOR")
        self.assertEqual(regime_label(3.6), "SUB_FLOOR")
        self.assertEqual(regime_label(3.61), "VACUUM")
        self.assertEqual(regime_label(5.0), "VACUUM")

    def test_anchors_present(self) -> None:
        self.assertIn("solana_slot_timing", ANCHORS)
        self.assertIn("bitcoin_pow_clutch", ANCHORS)
        self.assertEqual(ANCHORS["solana_slot_timing"]["regime"], "DEEP_LOCK")


class TestProbeReport(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.mkdtemp()
        os.environ["BTC_SUPT_LOG"] = "1"
        os.environ["BTC_SUPT_DATA_DIR"] = self._tmpdir
        import importlib
        import supt_streams as ss
        import supt_probe as sp

        importlib.reload(ss)
        importlib.reload(sp)
        self.ss = ss
        self.sp = sp

    def tearDown(self) -> None:
        self.ss.shutdown_writer()
        os.environ.pop("BTC_SUPT_DATA_DIR", None)
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def test_run_probe_report_keys(self) -> None:
        rid = self.ss.begin_round(100)
        for nonce in range(0, 512, 64):
            self.ss.sample_hash(rid, nonce, bytes([nonce % 256] * 32))
        self.ss.end_round(rid, -1, 512, 1.0)
        report = self.sp.run_probe_report()
        self.assertTrue(report["ok"])
        self.assertIn("probes", report)
        self.assertIn("anchors", report)
        for key in (
            "stream_a_hash_int_512",
            "stream_a_hash_int_71",
            "stream_b_hashes_tried_512",
            "stream_b_hashes_tried_71",
            "stream_b_seconds_512",
            "stream_b_seconds_71",
        ):
            self.assertIn(key, report["probes"])

    def test_window_and_source_filters(self) -> None:
        report = self.sp.run_probe_report(window_filter="71", source_filter="stream_a")
        self.assertIn("stream_a_hash_int_71", report["probes"])
        self.assertNotIn("stream_a_hash_int_512", report["probes"])
        self.assertNotIn("stream_b_seconds_71", report["probes"])


class TestZ0Probe(unittest.TestCase):
    def test_anchor_z0_scales_values(self) -> None:
        vals = [Z0_OHM, Z0_OHM * 2, Z0_OHM * 3]
        anchored = anchor_z0(vals)
        self.assertAlmostEqual(anchored[0], 1.0)
        self.assertAlmostEqual(anchored[1], 2.0)
        self.assertAlmostEqual(anchored[2], 3.0)

    def test_reference_phi_lattice_probe_ok(self) -> None:
        r = frozen_probe(reference_phi_lattice())
        self.assertTrue(r["ok"])
        self.assertIn("regime", r)
        self.assertGreater(r["d_ij"], 0)

    def test_reference_fib_ratios_probe_ok(self) -> None:
        r = frozen_probe(reference_fib_ratios())
        self.assertTrue(r["ok"])
        self.assertIn(r["regime"], ("COHERENCE", "CLUTCH"))

    def test_short_input_returns_error_not_fake_dij(self) -> None:
        r = frozen_probe([1.0, 2.0])
        self.assertFalse(r["ok"])
        self.assertIn("need >= 3 values", r["error"])
        self.assertNotIn("d_ij", r)


class TestZ0ProbeReport(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.mkdtemp()
        os.environ["BTC_SUPT_LOG"] = "1"
        os.environ["BTC_SUPT_DATA_DIR"] = self._tmpdir
        import importlib
        import supt_streams as ss
        import supt_probe as sp

        importlib.reload(ss)
        importlib.reload(sp)
        self.ss = ss
        self.sp = sp

    def tearDown(self) -> None:
        self.ss.shutdown_writer()
        os.environ.pop("BTC_SUPT_DATA_DIR", None)
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def test_run_z0_probe_report_structure(self) -> None:
        rid = self.ss.begin_round(100)
        for nonce in range(0, 512, 64):
            self.ss.sample_hash(rid, nonce, bytes([nonce % 256] * 32))
        self.ss.end_round(rid, -1, 512, 1.0)
        report = self.sp.run_z0_probe_report()
        self.assertTrue(report["ok"])
        self.assertAlmostEqual(report["z0_ohm"], Z0_OHM, delta=0.01)
        self.assertIn("raw", report["probes"])
        self.assertIn("z0_anchored", report["probes"])
        self.assertIn("stream_a_hash_int_512", report["probes"]["raw"])
        self.assertIn("stream_a_hash_int_512", report["probes"]["z0_anchored"])
        self.assertIn("z0_phi_powers", report["reference_lattice"])
        self.assertIn("z0_fib_ratios", report["reference_lattice"])
        self.assertTrue(report["reference_lattice"]["z0_phi_powers"]["ok"])
        self.assertTrue(report["reference_lattice"]["z0_fib_ratios"]["ok"])

    def test_stream_b_cadence_71_rows(self) -> None:
        for i in range(71):
            rid = self.ss.begin_round(200 + i)
            for nonce in range(0, 256, 64):
                self.ss.sample_hash(rid, nonce + i, bytes([(nonce + i) % 256] * 32))
            self.ss.end_round(rid, -1, 1000 + i, 10.0 + i * 0.1)
        report = self.sp.run_z0_probe_report(window_filter="71", source_filter="stream_b")
        sec_raw = report["probes"]["raw"]["stream_b_seconds_71"]
        sec_z0 = report["probes"]["z0_anchored"]["stream_b_seconds_71"]
        self.assertTrue(sec_raw["ok"], sec_raw)
        self.assertTrue(sec_z0["ok"], sec_z0)
        self.assertEqual(sec_raw["n"], 71)
        self.assertGreaterEqual(report["sequence_lengths"]["stream_b_seconds"], 71)


@unittest.skipUnless(_fixture_csv_path(), "BTC STUFF nonce_hash_stream.csv not found")
class TestBtcStuffFixture(unittest.TestCase):
    def test_stream_a_fixture_values(self) -> None:
        path = _fixture_csv_path()
        assert path is not None
        vals = _load_hash_ints(path)
        full = frozen_probe(vals)
        w512 = frozen_probe(vals, window=512)
        self.assertTrue(full["ok"])
        self.assertAlmostEqual(full["d_ij"], 0.3557, delta=0.01)
        self.assertTrue(w512["ok"])
        self.assertAlmostEqual(w512["d_ij"], 0.9802, delta=0.05)


if __name__ == "__main__":
    unittest.main()
