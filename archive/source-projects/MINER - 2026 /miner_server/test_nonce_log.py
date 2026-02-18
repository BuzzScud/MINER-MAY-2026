"""
Tests for nonce logger: log file creation, required fields, and disable via env.
"""
import json
import os
import sys
import tempfile
from unittest.mock import patch

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)


def test_nonce_log_path_default() -> None:
    """get_nonce_log_path returns a path when logging not disabled."""
    with patch.dict(os.environ, {"BTC_DISABLE_NONCE_LOG": "0"}):
        from nonce_logger import get_nonce_log_path
        path = get_nonce_log_path()
    assert path is not None
    assert "nonces_tried" in path or "nonce" in path.lower()


def test_nonce_log_disabled() -> None:
    """get_nonce_log_path returns None when BTC_DISABLE_NONCE_LOG=1."""
    with patch.dict(os.environ, {"BTC_DISABLE_NONCE_LOG": "1"}, clear=False):
        from nonce_logger import get_nonce_log_path
        path = get_nonce_log_path()
    assert path is None


def test_log_nonce_round_creates_file() -> None:
    """log_nonce_round creates file and writes one round with required fields."""
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = os.path.join(tmpdir, "nonces_tried.json")
        with patch.dict(os.environ, {"BTC_NONCE_LOG_PATH": log_path, "BTC_DISABLE_NONCE_LOG": ""}, clear=False):
            from nonce_logger import log_nonce_round
            log_nonce_round(
                height=100,
                bits="207fffff",
                base_nonce=12345,
                recovery_nonce=12346,
                minimal_nonces=[12345, 12346],
                candidate_count=2000,
                candidates=list(range(100, 300)),
            )
        assert os.path.isfile(log_path)
        with open(log_path, "r", encoding="utf-8") as f:
            line = f.readline()
        data = json.loads(line)
        assert data["height"] == 100
        assert data["bits"] == "207fffff"
        assert data["base_nonce"] == 12345
        assert data["recovery_nonce"] == 12346
        assert data["minimal_nonces"] == [12345, 12346]
        assert data["candidate_count"] == 2000
        assert "nonce_sample" in data
        sample = data["nonce_sample"]
        assert 20 <= len(sample) <= 40
        assert 100 in sample
        assert "timestamp_iso" in data


def test_log_nonce_round_no_write_when_disabled() -> None:
    """log_nonce_round does not write when BTC_DISABLE_NONCE_LOG=1."""
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = os.path.join(tmpdir, "nonces_tried.json")
        with patch.dict(os.environ, {"BTC_NONCE_LOG_PATH": log_path, "BTC_DISABLE_NONCE_LOG": "1"}, clear=False):
            from nonce_logger import log_nonce_round
            log_nonce_round(
                height=1, bits="20000000", base_nonce=0, recovery_nonce=0,
                minimal_nonces=[0], candidate_count=0, candidates=[],
            )
        assert not os.path.isfile(log_path)


if __name__ == "__main__":
    test_nonce_log_path_default()
    test_nonce_log_disabled()
    test_log_nonce_round_creates_file()
    test_log_nonce_round_no_write_when_disabled()
    print("All nonce log tests passed.")
    sys.exit(0)
