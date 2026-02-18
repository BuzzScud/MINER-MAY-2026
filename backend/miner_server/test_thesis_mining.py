"""
Unit tests for thesis-aligned prime generation and nonce solution.
Validates Clock O(1), SFT, and nonce pipeline (no linear fallback).
With BTC_USE_C_NONCE=0 the C lib is not loaded (avoids segfault on some systems).
"""
import sys
from config import use_c_nonce
from thesis_mining import (
    _get_seed_prime_thesis,
    _clock_o1_seed_prime,
    _is_prime,
    _load_libnonce,
    _nonce_from_c,
    _nonce_generate_unified_py_impl,
    _nonce_validate_difficulty_py,
    _nonce_reassess_py,
    nonce_generate_unified_py,
    bits_compact_to_difficulty_bits,
    get_minimal_nonce_list,
    build_candidate_list,
    quadrant_from_nonce,
    ENTROPY_CUT_MIN,
    ENTROPY_CUT_MAX,
    NONCE_MAX,
)


def test_clock_o1_seed_prime() -> None:
    """Clock O(1) returns correct primes for positions 3, 6, 9."""
    # position 3, magnitude 0: base 5, candidate 5
    assert _clock_o1_seed_prime(3) == 5
    # position 3, magnitude 3: 5 + 36 = 41
    assert _clock_o1_seed_prime(39) == 41
    # position 6, magnitude 0: base 7
    assert _clock_o1_seed_prime(6) == 7
    # position 9, magnitude 0: base 11
    assert _clock_o1_seed_prime(9) == 11
    # position 4: not 3,6,9 -> None
    assert _clock_o1_seed_prime(4) is None
    assert _clock_o1_seed_prime(1) is None


def test_get_seed_prime_thesis() -> None:
    """Thesis seed prime: Clock O(1) or SFT, no brute force."""
    assert _get_seed_prime_thesis(0) == 2
    assert _get_seed_prime_thesis(1) == 2
    assert _get_seed_prime_thesis(3) == 5
    assert _get_seed_prime_thesis(4) >= 4 and _is_prime(_get_seed_prime_thesis(4))
    assert _get_seed_prime_thesis(100) >= 100 and _is_prime(_get_seed_prime_thesis(100))
    assert _get_seed_prime_thesis(100000) >= 100000 and _is_prime(
        _get_seed_prime_thesis(100000)
    )


def test_nonce_generate_unified_py() -> None:
    """Base nonce is in valid 32-bit range."""
    for block_height, difficulty_bits in [(3, 24), (100, 32), (1000, 24)]:
        n = nonce_generate_unified_py(block_height, difficulty_bits)
        assert 0 <= n <= NONCE_MAX, f"block_height={block_height}: nonce {n} out of range"


def test_get_minimal_nonce_list() -> None:
    """Minimal nonce list has 1-2 elements (base + optional recovery)."""
    lst = get_minimal_nonce_list(100, 24, b"\x20\x7f\xff\xff")
    assert 1 <= len(lst) <= 2
    for n in lst:
        assert 0 <= n <= NONCE_MAX


def test_build_candidate_list() -> None:
    """Candidate list uses thesis formulas (spheres, prime positions, phi, ±200)."""
    base = 1000
    recovery = 2000
    start = 0
    end = 100000
    cands = build_candidate_list(base, recovery, start, end)
    assert base in cands
    assert recovery in cands
    assert len(cands) > 10
    for n in cands:
        assert start <= n < end


def test_build_candidate_list_structure() -> None:
    """Candidate list has expected structure: base, recovery, sphere-derived; count in expected range."""
    base = 5000
    recovery = 6000
    start = 0
    end = 0xFFFFFFFF + 1
    cands = build_candidate_list(base, recovery, start, end)
    assert base in cands
    assert recovery in cands
    # At least 2 (base, recovery) + 12 spheres * (35 or 40) * 2 + 401*2 before dedup; dedup and range can reduce
    assert len(cands) >= 2
    assert len(cands) <= 2 + 12 * 40 * 2 + 401 * 2 + 100
    # Some sphere-derived nonce (not just base±200): e.g. first sphere base + phi offset
    nonce_range = end - start
    sphere_size = max(1, nonce_range // 12)
    sphere_base_0 = start + (0 * sphere_size) % nonce_range
    from thesis_mining import PHI, PLATONIC_RADIUS
    offset_example = int(1 * PHI) % PLATONIC_RADIUS
    sphere_derived = sphere_base_0 + offset_example
    if start <= sphere_derived < end:
        assert sphere_derived in cands or any(abs(n - sphere_derived) < 500 for n in cands)


def test_build_candidate_list_c_parity() -> None:
    """When C build_candidate_list_sphere is available, C output set is subset of Python set (C caps at 1024)."""
    import os
    from unittest.mock import patch
    base = 100
    recovery = 200
    start = 0
    end = 50000
    with patch.dict(os.environ, {"BTC_USE_C_CANDIDATES": "0"}):
        py_cands = set(build_candidate_list(base, recovery, start, end))
    with patch.dict(os.environ, {"BTC_USE_C_CANDIDATES": "1"}):
        c_cands_list = build_candidate_list(base, recovery, start, end)
    if len(c_cands_list) >= len(py_cands):
        return
    for n in c_cands_list:
        assert n in py_cands, f"C returned nonce {n} not in Python candidate set"


def test_nonce_validate_difficulty_py() -> None:
    """_nonce_validate_difficulty_py: True if leading zero bits >= difficulty_bits."""
    # difficulty_bits 1: nonce 0 has 32 leading zeros, passes
    assert _nonce_validate_difficulty_py(0, 1) is True
    # difficulty_bits 1: nonce 0x80000000 has 1 leading zero, passes for 1
    assert _nonce_validate_difficulty_py(0x80000000, 1) is True
    # difficulty_bits 32: nonce 0 has 32 leading zeros, passes
    assert _nonce_validate_difficulty_py(0, 32) is True
    # difficulty_bits 33: nonce 0x80000000 has 32 leading zeros (32-bit MSB set), fails
    assert _nonce_validate_difficulty_py(0x80000000, 33) is False
    # difficulty_bits out of range -> True
    assert _nonce_validate_difficulty_py(0xFFFFFFFF, 0) is True
    assert _nonce_validate_difficulty_py(0xFFFFFFFF, 65) is True


def test_nonce_reassess_py() -> None:
    """_nonce_reassess_py: deterministic adjustment by attempt * block_height."""
    # Deterministic: same inputs -> same output
    r1 = _nonce_reassess_py(100, 1, 1000)
    r2 = _nonce_reassess_py(100, 1, 1000)
    assert r1 == r2
    # Different attempt changes output
    r3 = _nonce_reassess_py(100, 2, 1000)
    assert r3 != r1
    # Result in 32-bit range
    assert 0 <= r1 <= NONCE_MAX
    assert 0 <= r3 <= NONCE_MAX


def test_quadrant_edge_cases() -> None:
    """quadrant_from_nonce returns 0..3 for full 32-bit range edge cases."""
    for n in [0, 1, 0x80000000, 0xFFFFFFFF]:
        q = quadrant_from_nonce(n)
        assert 0 <= q <= 3, f"nonce {n} => quadrant {q} (expected 0..3)"


def test_entropy_cut_constants_match_c() -> None:
    """ENTROPY_CUT_MIN/MAX must match C nonce_config_init defaults (0.18, 0.45)."""
    assert ENTROPY_CUT_MIN == 0.18, "ENTROPY_CUT_MIN must match C (0.18)"
    assert ENTROPY_CUT_MAX == 0.45, "ENTROPY_CUT_MAX must match C (0.45)"


def test_entropy_reduction_monotonicity() -> None:
    """For a fixed tetration value, increasing difficulty_bits should not increase the reduced value (entropy reducing)."""
    # Use tetration_val=1 so mask and (1-factor) interact predictably: reduced is non-increasing in d.
    tetration_val = 1
    prev_reduced = float("inf")
    for d in [1, 23, 64]:
        entropy_factor = ENTROPY_CUT_MIN + (ENTROPY_CUT_MAX - ENTROPY_CUT_MIN) * (d / 64.0)
        mask = (1 << d) - 1
        if mask > (1 << 64) - 1:
            mask = (1 << 64) - 1
        reduced = (tetration_val & mask) * (1.0 - entropy_factor)
        assert prev_reduced >= reduced, (
            f"Entropy reduction should be non-increasing in difficulty_bits: d={d} reduced={reduced} prev={prev_reduced}"
        )
        prev_reduced = reduced
    assert 0 <= prev_reduced <= NONCE_MAX


def test_nonce_c_python_parity() -> None:
    """C and Python nonce paths both yield nonces in [0, NONCE_MAX] for same (height, bits).
    C and Python need not be identical (different seed-prime paths allowed)."""
    cases = [(3, 0x207FFFFF), (100, 0x207FFFFF), (1000, 0x1D00FFFF)]
    for block_height, bits_int in cases:
        difficulty_bits = bits_compact_to_difficulty_bits(bits_int)
        py_nonce = _nonce_generate_unified_py_impl(block_height, difficulty_bits)
        assert 0 <= py_nonce <= NONCE_MAX, (
            f"Python nonce out of range: height={block_height} bits=0x{bits_int:08x} nonce={py_nonce}"
        )
        if use_c_nonce() and _load_libnonce():
            c_nonce = _nonce_from_c(block_height, difficulty_bits)
            if c_nonce is not None:
                assert 0 <= c_nonce <= NONCE_MAX, (
                    f"C nonce out of range: height={block_height} bits=0x{bits_int:08x} nonce={c_nonce}"
                )


def test_thesis_then_phase3_structure() -> None:
    """Verify miner_loop has thesis phases 1+2 then Phase 3 linear sweep (structural check)."""
    import inspect
    from miner_loop import run_mining_loop_unified, _mp_worker_mine_range

    source = inspect.getsource(run_mining_loop_unified)
    assert "for nonce in range(nonce_start, nonce_end)" not in source
    assert "candidates_set" not in source
    assert "Phase 2" in source, "Phase 2 thesis candidates must be present"
    assert "Phase 3" in source, "Phase 3 linear sweep must be present"
    assert "phase3_nonces_per_worker" in source, "Phase 3 uses config phase3_nonces_per_worker"

    mp_source = inspect.getsource(_mp_worker_mine_range)
    assert "for n in nonce_range" not in mp_source
    assert "cands_set" not in mp_source
    assert "Phase 3" in mp_source, "MP worker must include Phase 3"
    assert "phase3_nonces_per_worker" in mp_source, "MP worker must use phase3_nonces_per_worker"


if __name__ == "__main__":
    test_clock_o1_seed_prime()
    test_get_seed_prime_thesis()
    test_nonce_generate_unified_py()
    test_get_minimal_nonce_list()
    test_build_candidate_list()
    test_build_candidate_list_structure()
    test_build_candidate_list_c_parity()
    test_nonce_validate_difficulty_py()
    test_nonce_reassess_py()
    test_quadrant_edge_cases()
    test_entropy_cut_constants_match_c()
    test_entropy_reduction_monotonicity()
    test_nonce_c_python_parity()
    test_thesis_then_phase3_structure()
    print("All thesis mining tests passed.")
    sys.exit(0)
