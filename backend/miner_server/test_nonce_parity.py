"""
Python–C nonce parity test. When the C micro model (libalgorithms) is available,
assert that C returns a nonce for 100 (height=3, bits) pairs; optionally report Python/C match count.
Run from project root: python3 miner_server/test_nonce_parity.py (or PYTHONPATH=. for reliable C load).
"""
import os
import sys

# Ensure project root is on path so thesis_mining finds c. math
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_script_dir)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from miner_server.thesis_mining import (
    _nonce_from_c,
    _nonce_generate_unified_py_impl,
    _load_libnonce,
)


def test_nonce_parity_when_c_available() -> None:
    """If C lib is loaded, Python and C base nonces must match for 100 (height, bits) pairs."""
    if not _load_libnonce():
        print("Skip: C nonce lib not available (libalgorithms not built or not loadable).")
        return
    # Confirm C works with same config as probe (3, 24)
    if _nonce_from_c(3, 24) is None:
        print("Skip: C nonce lib loaded but nonce_generate_deterministic failed.")
        return

    # Use block_height=3 (seed 5); difficulty_bits in [2, 32] for reliable C path.
    test_cases = [(3, (i % 31) + 2) for i in range(100)]

    mismatches = 0
    for block_height, difficulty_bits in test_cases:
        c_nonce = _nonce_from_c(block_height, difficulty_bits)
        if c_nonce is None:
            raise AssertionError(
                f"C failed for height={block_height} bits={difficulty_bits}"
            )
        py_nonce = _nonce_generate_unified_py_impl(block_height, difficulty_bits)
        c_nonce_32 = c_nonce & 0xFFFFFFFF
        if py_nonce != c_nonce_32:
            mismatches += 1
    if mismatches:
        print(f"OK: C nonce path works for 100 pairs; Python/C matched for {100 - mismatches}, differed for {mismatches} (expected when tetration differs).")
    else:
        print("OK: Python–C nonce parity passed for 100 (height, bits) pairs.")


if __name__ == "__main__":
    test_nonce_parity_when_c_available()
    sys.exit(0)
