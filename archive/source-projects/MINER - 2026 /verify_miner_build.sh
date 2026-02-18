#!/bin/bash
# Verify miner build: run miner test suite from project root.
# Exit 0 if all tests pass; non-zero otherwise.
set -e
ROOT="$(dirname "$0")"
cd "$ROOT/miner_server"
if [ -x ./run_tests.sh ]; then
  ./run_tests.sh
else
  bash run_tests.sh
fi
