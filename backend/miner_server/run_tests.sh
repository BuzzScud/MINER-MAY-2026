#!/bin/bash
# Run full miner test suite.
# Exit 0 = all pass; non-zero = failure.
# Disable C libs and recovery to avoid segfaults when .so/.dylib are missing or incompatible.
set -e
cd "$(dirname "$0")"
export BTC_USE_C_NONCE=0
export BTC_USE_C_CANDIDATES=0
export BTC_DISABLE_RECOVERY=1
echo "=== Miner Test Suite ==="
python3 test_miner_full.py
python3 test_thesis_mining.py
python3 test_nonce_log.py
python3 test_quadrant_partition.py
python3 test_partition_candidates.py
python3 address.py
echo ""
echo "=== All tests passed ==="
