#!/usr/bin/env python3
"""Tests for bounded log rotation and tail reads."""
import os
import sys
import tempfile
import unittest

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from log_utils import prune_archives, read_tail_lines, refresh_file_if_oversized, rotate_file_if_oversized


class TestLogUtils(unittest.TestCase):
    def test_read_tail_lines(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "sample.log")
            with open(path, "w", encoding="utf-8") as f:
                for i in range(100):
                    f.write(f"line-{i}\n")
            tail = read_tail_lines(path, 3)
            self.assertEqual(tail, ["line-97", "line-98", "line-99"])

    def test_refresh_discards_oversized_log(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "mining_activity.log")
            with open(path, "wb") as f:
                f.write(b"x" * 2048)
            archive = os.path.join(tmp, "mining_activity.old.log")
            with open(archive, "wb") as f:
                f.write(b"old")
            self.assertTrue(refresh_file_if_oversized(path, max_bytes=1024))
            self.assertFalse(os.path.isfile(path))
            self.assertFalse(os.path.isfile(archive))

    def test_rotate_and_prune(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "stream.csv")
            with open(path, "wb") as f:
                f.write(b"x" * 2048)
            rotate_file_if_oversized(path, max_bytes=1024, keep_archives=1)
            self.assertFalse(os.path.isfile(path))
            archives = [n for n in os.listdir(tmp) if n.startswith("stream.")]
            self.assertEqual(len(archives), 1)
            with open(path, "wb") as f:
                f.write(b"y" * 2048)
            rotate_file_if_oversized(path, max_bytes=1024, keep_archives=1)
            archives = sorted(n for n in os.listdir(tmp) if n.startswith("stream."))
            self.assertEqual(len(archives), 1)
            prune_archives(tmp, "stream.", ".csv", keep=0)
            self.assertEqual(os.listdir(tmp), [])


if __name__ == "__main__":
    unittest.main()
