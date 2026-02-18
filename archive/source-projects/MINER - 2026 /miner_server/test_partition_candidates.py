"""
Search-space partition tests: 4 workers (quadrant) and 8 workers (chunk).
Verifies that worker partitioning covers the thesis candidate set without overlap.
"""
import sys

NONCE_SPACE = 0x100000000  # 2^32


def test_four_workers_quadrant_partition() -> None:
    """Full candidate list split by quadrant: union = full set, pairwise disjoint."""
    from thesis_mining import (
        build_candidate_list,
        quadrant_from_nonce,
        nonce_generate_unified_py,
        recovery_suggested_nonce,
    )

    height = 100
    difficulty_bits = 24
    bits_bytes = b"\x20\x7f\xff\xff"
    base = nonce_generate_unified_py(height, difficulty_bits)
    rec = recovery_suggested_nonce(bits_bytes)
    if rec is None:
        rec = base

    full_list = build_candidate_list(base, rec, 0, NONCE_SPACE)
    by_quadrant: list[set[int]] = [set(), set(), set(), set()]
    for n in full_list:
        q = quadrant_from_nonce(n)
        assert 0 <= q <= 3, f"nonce {n} => quadrant {q}"
        by_quadrant[q].add(n)

    for i in range(4):
        for j in range(i + 1, 4):
            overlap = by_quadrant[i] & by_quadrant[j]
            assert len(overlap) == 0, f"Quadrants {i} and {j} overlap: {len(overlap)}"

    union = by_quadrant[0] | by_quadrant[1] | by_quadrant[2] | by_quadrant[3]
    full_set = set(full_list)
    assert union == full_set, f"Union size {len(union)} vs full {len(full_set)}"
    print("OK: 4-worker quadrant partition (disjoint, cover full candidate set).")


def test_eight_workers_chunk_partition() -> None:
    """Per-worker candidate lists: disjoint; each worker's candidates lie in its chunk."""
    from thesis_mining import (
        build_candidate_list,
        nonce_generate_unified_py,
        recovery_suggested_nonce,
    )

    num_workers = 8
    chunk_size = NONCE_SPACE // num_workers
    height = 200
    difficulty_bits = 24
    bits_bytes = b"\x20\x7f\xff\xff"
    base = nonce_generate_unified_py(height, difficulty_bits)
    rec = recovery_suggested_nonce(bits_bytes)
    if rec is None:
        rec = base

    worker_lists: list[set[int]] = []
    for i in range(num_workers):
        start_n = i * chunk_size
        end_n = (i + 1) * chunk_size if i < num_workers - 1 else NONCE_SPACE
        cands = build_candidate_list(base, rec, start_n, end_n)
        worker_lists.append(set(cands))

    for i in range(num_workers):
        start_n = i * chunk_size
        end_n = (i + 1) * chunk_size if i < num_workers - 1 else NONCE_SPACE
        for n in worker_lists[i]:
            assert start_n <= n < end_n, (
                f"Worker {i} candidate {n} outside chunk [{start_n}, {end_n})"
            )

    for i in range(num_workers):
        for j in range(i + 1, num_workers):
            overlap = worker_lists[i] & worker_lists[j]
            assert len(overlap) == 0, (
                f"Workers {i} and {j} overlap: {len(overlap)} candidates"
            )
    print("OK: 8-worker chunk partition (each worker in-chunk, pairwise disjoint).")


if __name__ == "__main__":
    test_four_workers_quadrant_partition()
    test_eight_workers_chunk_partition()
    print("All partition candidate tests passed.")
    sys.exit(0)
