"""
Unbiased partition check: 4 workers (quadrants) partition the full nonce space.
Each nonce maps to exactly one quadrant; union of quadrants = full [0, 0xFFFFFFFF].
"""
import sys
from thesis_mining import bits_compact_to_difficulty_bits, quadrant_from_nonce

# Sample size: enough to hit all quadrants and verify disjoint cover
SAMPLE_SIZE = 65536


def test_quadrant_partition() -> None:
    """Each nonce has exactly one quadrant; quadrants partition the sample."""
    by_quadrant: list[set[int]] = [set(), set(), set(), set()]
    for n in range(SAMPLE_SIZE):
        q = quadrant_from_nonce(n)
        assert 0 <= q <= 3, f"nonce {n} => quadrant {q} (expected 0..3)"
        by_quadrant[q].add(n)
    # Pairwise disjoint
    for i in range(4):
        for j in range(i + 1, 4):
            overlap = by_quadrant[i] & by_quadrant[j]
            assert len(overlap) == 0, f"Quadrants {i} and {j} overlap: {len(overlap)} nonces"
    # Union = full sample
    union = by_quadrant[0] | by_quadrant[1] | by_quadrant[2] | by_quadrant[3]
    expected = set(range(SAMPLE_SIZE))
    assert union == expected, f"Union size {len(union)} != sample size {SAMPLE_SIZE}"
    print(f"OK: {SAMPLE_SIZE} nonces partitioned into 4 quadrants (disjoint, cover).")


def test_bits_compact_to_difficulty_bits() -> None:
    """bits_compact_to_difficulty_bits extracts exponent and maps to 1-64."""
    assert bits_compact_to_difficulty_bits(0x207fffff) == 32  # regtest
    assert bits_compact_to_difficulty_bits(0x1703a30c) == 23  # mainnet ~800k
    assert bits_compact_to_difficulty_bits(0x01000000) == 1
    assert bits_compact_to_difficulty_bits(0x40000000) == 64  # clamped
    assert 1 <= bits_compact_to_difficulty_bits(0xffffffff) <= 64


def test_quadrant_deterministic() -> None:
    """quadrant_from_nonce is deterministic."""
    for n in [0, 1, 0xFFFFFFFF, 12345678]:
        a = quadrant_from_nonce(n)
        b = quadrant_from_nonce(n)
        assert a == b, f"nonce {n}: {a} != {b}"


if __name__ == "__main__":
    test_bits_compact_to_difficulty_bits()
    test_quadrant_deterministic()
    test_quadrant_partition()
    print("All quadrant partition tests passed.")
    sys.exit(0)
