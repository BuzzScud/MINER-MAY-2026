#!/bin/bash
# Build libhasher_fast — ARM SHA-256 accelerated batch nonce scanner.
# Requires: clang (Xcode Command Line Tools)
# Output: libhasher_fast.dylib (macOS) or libhasher_fast.so (Linux)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/hasher_fast.c"

if [ "$(uname)" = "Darwin" ]; then
    OUT="$SCRIPT_DIR/libhasher_fast.dylib"
    clang -O3 -march=native -shared -fPIC -o "$OUT" "$SRC"
else
    OUT="$SCRIPT_DIR/libhasher_fast.so"
    cc -O3 -march=native -shared -fPIC -o "$OUT" "$SRC"
fi

echo "Built: $OUT"
ls -lh "$OUT"
