# UI Real-Time Updates & Multiprocessing Plan

## Goals
1. UI displays and updates in real-time (100% functional)
2. Miner uses multiprocessing with 4 workers
3. Stats (hashrate, hashes, blocks) update live during mining

## Implementation Steps

### 1. Config: num_workers and use_unified
- Add `num_workers` and `use_unified` to `_config_from_request()` (from request or env)
- Default: num_workers=4, use_unified=True

### 2. Multiprocessing real-time progress
- Pass `multiprocessing.Value('Q', 0)` (shared counter) to workers
- Workers increment every 1000 hashes to reduce contention
- Main loop: read shared value, call on_hash(total), update stats
- Ensures UI gets incremental updates during MP mining

### 3. API /api/stats
- Add `num_workers` to response
- Add `use_unified` to response
- _mining_stats stores num_workers when mining starts

### 4. UI (index.html)
- Add "Workers" metric to mining section
- Reduce poll interval when mining: 500ms (from 1000ms)
- Display workers count and "Unified (4 workers)" when active
- Ensure mining log and network activity poll consistently

### 5. Validation
- Start mining → verify hashrate/hashes update every ~500ms
- Verify workers: 4 displayed
- Verify mining log updates
- Verify stop works cleanly

---

## Validation Results (Mining UI Nonce Hash Verification)

Completed validation per plan:

### MP Phase 2 hash count
- **Fix**: `_run_mining_loop_unified_mp` now calls `on_hash(phase1_hashes + live_total)` so displayed hashes include Phase 1 during Phase 2.
- No drop in displayed hashes when Phase 2 starts.

### Nonce progress label
- **web_ui.py**: Stats log line simplified to "Hashrate: X H/s, Hashes: Y" (removed misleading "Nonce progress % of 32-bit space").
- **index.html**: Metric label changed to "Hashes % of 32-bit (cumulative)" to clarify cumulative hash count, not linear nonce coverage.

### Thesis and nonce correctness
- Unit tests: `_nonce_validate_difficulty_py`, `_nonce_reassess_py`, `quadrant_from_nonce` edge cases (0, 0x80000000, 0xFFFFFFFF).
- Genesis block header hash regression test: double-SHA256 yields known block hash.
- Full test suite: `test_miner_full`, `test_thesis_mining`, `test_quadrant_partition`, `address.py` — all pass.
