"""
Persist tried nonces per round for analysis and improvement over time.
Writes one JSON object per line (JSONL) to data/nonces_tried.json.
Set BTC_NONCE_LOG_PATH to override path; set BTC_DISABLE_NONCE_LOG=1 to disable.
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from typing import List, Optional

_here = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_PATH = os.path.join(_here, "data", "nonces_tried.json")
_LOCK = threading.Lock()
_SAMPLE_FIRST = 20
_SAMPLE_LAST = 20


def get_nonce_log_path() -> Optional[str]:
    """Return path to nonce log file, or None if logging disabled."""
    if os.environ.get("BTC_DISABLE_NONCE_LOG", "").strip() in ("1", "true", "yes"):
        return None
    path = os.environ.get("BTC_NONCE_LOG_PATH", "").strip()
    if path:
        return os.path.abspath(path)
    return _DEFAULT_PATH


def _sample_nonces(candidates: List[int]) -> List[int]:
    """Return first 20 + last 20 nonces for bounded log size."""
    if len(candidates) <= _SAMPLE_FIRST + _SAMPLE_LAST:
        return list(candidates)
    return list(candidates[:_SAMPLE_FIRST]) + list(candidates[-_SAMPLE_LAST:])


def log_nonce_round(
    height: int,
    bits: str,
    base_nonce: int,
    recovery_nonce: int,
    minimal_nonces: List[int],
    candidate_count: int,
    candidates: Optional[List[int]] = None,
) -> None:
    """
    Append one round of nonce data to the log file.
    Call after building the candidate list for the round.
    """
    path = get_nonce_log_path()
    if not path:
        return
    timestamp_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "timestamp_iso": timestamp_iso,
        "height": height,
        "bits": bits,
        "base_nonce": base_nonce,
        "recovery_nonce": recovery_nonce,
        "minimal_nonces": minimal_nonces,
        "candidate_count": candidate_count,
    }
    if candidates is not None:
        payload["nonce_sample"] = _sample_nonces(candidates)
    line = json.dumps(payload) + "\n"
    try:
        dirpath = os.path.dirname(path)
        if dirpath and not os.path.isdir(dirpath):
            os.makedirs(dirpath, exist_ok=True)
        with _LOCK:
            with open(path, "a", encoding="utf-8") as f:
                f.write(line)
    except (OSError, IOError):
        pass
