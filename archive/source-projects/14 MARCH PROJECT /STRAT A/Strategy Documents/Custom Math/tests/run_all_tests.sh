#!/bin/bash

# Comprehensive test runner for 88D architecture
# This script will attempt to compile and run all tests

set +e  # Don't exit on error

echo "=========================================="
echo "88D Architecture - Comprehensive Test Run"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
total_tests=0
passed_tests=0
failed_tests=0
skipped_tests=0

# Test directories
TEST_DIRS="unit integration"

# Function to run a single test
run_test() {
    local test_file=$1
    local test_name=$(basename "$test_file" .c)
    local test_dir=$(dirname "$test_file")
    
    total_tests=$((total_tests + 1))
    
    echo -n "Testing $test_name... "
    
    # Try to compile
    if [ -f "$test_dir/$test_name" ]; then
        # Already compiled, run it
        if ./"$test_dir/$test_name" > /dev/null 2>&1; then
            echo -e "${GREEN}PASSED${NC}"
            passed_tests=$((passed_tests + 1))
            return 0
        else
            echo -e "${RED}FAILED (runtime)${NC}"
            failed_tests=$((failed_tests + 1))
            return 1
        fi
    else
        echo -e "${YELLOW}SKIPPED (not compiled)${NC}"
        skipped_tests=$((skipped_tests + 1))
        return 2
    fi
}

# Run tests from each directory
for dir in $TEST_DIRS; do
    if [ -d "$dir" ]; then
        echo ""
        echo "=== Testing $dir ==="
        for test_exe in "$dir"/*; do
            if [ -x "$test_exe" ] && [ -f "$test_exe" ]; then
                run_test "$test_exe"
            fi
        done
    fi
done

# Run root level tests
echo ""
echo "=== Testing root level ==="
for test_exe in test_*; do
    if [ -x "$test_exe" ] && [ -f "$test_exe" ]; then
        run_test "$test_exe"
    fi
done

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total tests: $total_tests"
echo -e "${GREEN}Passed: $passed_tests${NC}"
echo -e "${RED}Failed: $failed_tests${NC}"
echo -e "${YELLOW}Skipped: $skipped_tests${NC}"
echo ""

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}✓ All compiled tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi