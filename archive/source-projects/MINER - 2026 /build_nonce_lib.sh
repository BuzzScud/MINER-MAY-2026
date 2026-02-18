#!/bin/sh
# Build C micro model (libalgorithms) for optional use by Python miner.
# Run from project root. When built, thesis_mining will try C for base nonce;
# if the C call does not return within a few seconds (probe), Python is used.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
CMATH="${ROOT}/c. math"
cd "$CMATH/math"
echo "Building math library..."
make -j4 2>/dev/null || make
cd "$CMATH/algorithms"
echo "Building algorithms library (nonce micro model)..."
make -j4 2>/dev/null || make
if [ -f libalgorithms.so ] || [ -f libalgorithms.dylib ]; then
    echo "Nonce C library ready: $CMATH/algorithms/libalgorithms.so (or .dylib)"
    echo "Miner will probe C on first use; if C returns in time, base nonce uses C."
else
    echo "Build may have produced libalgorithms in current dir: $(pwd)"
    ls -la libalgorithms.* 2>/dev/null || true
fi
