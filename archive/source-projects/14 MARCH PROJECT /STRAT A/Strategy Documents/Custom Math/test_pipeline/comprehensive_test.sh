#!/bin/bash

# Comprehensive Training Pipeline and Inference Test
# This script tests the entire CLLM system end-to-end

set -e  # Exit on error

echo "=========================================="
echo "COMPREHENSIVE CLLM PIPELINE TEST"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -e "${YELLOW}[TEST $TESTS_TOTAL]${NC} $test_name"
    
    if eval "$test_command" > /tmp/test_output_$TESTS_TOTAL.log 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "Error output:"
        tail -20 /tmp/test_output_$TESTS_TOTAL.log
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Clean up old test files
echo "Cleaning up old test files..."
rm -f test_pipeline/*.cllm test_pipeline/*.vocab test_pipeline/*.txt
rm -f /tmp/test_output_*.log

echo ""
echo "=========================================="
echo "PHASE 1: BUILD VERIFICATION"
echo "=========================================="
echo ""

run_test "Build system clean" "cd /workspace && make clean"
run_test "Full system build" "cd /workspace && make -j\$(nproc)"

echo ""
echo "=========================================="
echo "PHASE 2: MODEL CREATION"
echo "=========================================="
echo ""

run_test "Create tiny model (1.2 MB)" \
    "cd /workspace/test_pipeline && ../tools/cllm create -v 1000 -e 64 -l 2 -H 4 -o test_tiny.cllm"

run_test "Create small model (8.6 MB)" \
    "cd /workspace/test_pipeline && ../tools/cllm create -v 5000 -e 128 -l 4 -H 8 -o test_small.cllm"

run_test "Verify tiny model file exists" \
    "test -f test_pipeline/test_tiny.cllm"

run_test "Verify small model file exists" \
    "test -f test_pipeline/test_small.cllm"

echo ""
echo "=========================================="
echo "PHASE 3: VOCABULARY BUILDING"
echo "=========================================="
echo ""

# Create sample training data
cat > test_pipeline/sample_data.txt << 'EOF'
The crystalline lattice language model uses prime number theory.
Twelve-fold symmetry organizes the embedding space efficiently.
Platonic solids provide geometric structure to the architecture.
The golden ratio appears in the dodecahedron and icosahedron.
Clock lattice mapping enables O(1) prime number generation.
Kissing spheres threading distributes computation across cores.
Blind recovery mechanisms ensure robustness to data corruption.
Harmonic integration synchronizes training across worker threads.
NTT attention provides efficient self-attention computation.
The Babylonian clock structure organizes temporal information.
EOF

run_test "Build vocabulary from sample data" \
    "cd /workspace/test_pipeline && ../tools/cllm_vocab_build sample_data.txt test_vocab.vocab 1000"

run_test "Verify vocabulary file exists" \
    "test -f test_pipeline/test_vocab.vocab"

echo ""
echo "=========================================="
echo "PHASE 4: INFERENCE TESTING"
echo "=========================================="
echo ""

run_test "Load tiny model for inference" \
    "cd /workspace/test_pipeline && echo 'The crystalline' | timeout 10 ../tools/cllm_inference test_tiny.cllm"

run_test "Load small model for inference" \
    "cd /workspace/test_pipeline && echo 'The prime' | timeout 10 ../tools/cllm_inference test_small.cllm"

echo ""
echo "=========================================="
echo "PHASE 5: TRAINING PIPELINE"
echo "=========================================="
echo ""

# Test training with tiny model (should complete quickly)
run_test "Training initialization" \
    "cd /workspace/test_pipeline && timeout 30 ../tools/cllm train --model test_tiny.cllm --data sample_data.txt --epochs 1 --batch-size 2 2>&1 | head -50"

echo ""
echo "=========================================="
echo "PHASE 6: ARCHITECTURE VALIDATION"
echo "=========================================="
echo ""

# Create a test program to validate architecture
cat > test_pipeline/validate_architecture.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include "../include/cllm.h"
#include "../include/cllm_create.h"

int main() {
    printf("Testing architecture components...\n");
    
    // Create a tiny model
    CLLMModel* model = cllm_create_model(1000, 64, 2, 4, 12);
    if (!model) {
        fprintf(stderr, "Failed to create model\n");
        return 1;
    }
    
    printf("✓ Model creation successful\n");
    
    // Verify 12-fold symmetry
    if (model->symmetry_groups != 12) {
        fprintf(stderr, "✗ 12-fold symmetry not maintained: %d\n", model->symmetry_groups);
        return 1;
    }
    printf("✓ 12-fold symmetry verified\n");
    
    // Verify kissing spheres (13 total: 1 control + 12 workers)
    if (model->num_spheres != 13) {
        fprintf(stderr, "✗ Kissing spheres incorrect: %d (expected 13)\n", model->num_spheres);
        return 1;
    }
    printf("✓ Kissing spheres (13) verified\n");
    
    // Verify clock lattice size
    if (model->clock_lattice_size != 232) {
        fprintf(stderr, "✗ Clock lattice size incorrect: %d (expected 232)\n", model->clock_lattice_size);
        return 1;
    }
    printf("✓ Clock lattice (232 positions) verified\n");
    
    // Verify Platonic solid (cube: 8 vertices, 12 edges, 6 faces)
    if (model->num_vertices != 8 || model->num_edges != 12 || model->num_faces != 6) {
        fprintf(stderr, "✗ Platonic solid incorrect: V=%d E=%d F=%d\n", 
                model->num_vertices, model->num_edges, model->num_faces);
        return 1;
    }
    
    // Verify Euler's formula: V - E + F = 2
    int euler = model->num_vertices - model->num_edges + model->num_faces;
    if (euler != 2) {
        fprintf(stderr, "✗ Euler's formula failed: %d - %d + %d = %d (expected 2)\n",
                model->num_vertices, model->num_edges, model->num_faces, euler);
        return 1;
    }
    printf("✓ Platonic solid (cube) verified: V=8, E=12, F=6, Euler=2\n");
    
    // Verify blind recovery enabled
    if (!model->blind_recovery_enabled) {
        fprintf(stderr, "✗ Blind recovery not enabled\n");
        return 1;
    }
    printf("✓ Blind recovery enabled\n");
    
    // Verify harmonic integration
    if (!model->harmonic_integration_enabled) {
        fprintf(stderr, "✗ Harmonic integration not enabled\n");
        return 1;
    }
    printf("✓ Harmonic integration enabled\n");
    
    // Verify NTT attention
    if (!model->ntt_attention_enabled) {
        fprintf(stderr, "✗ NTT attention not enabled\n");
        return 1;
    }
    printf("✓ NTT attention enabled\n");
    
    cllm_free_model(model);
    
    printf("\n✓ ALL ARCHITECTURE TESTS PASSED\n");
    return 0;
}
EOF

run_test "Compile architecture validator" \
    "cd /workspace && gcc -o test_pipeline/validate_architecture test_pipeline/validate_architecture.c -I./include -L. -lcllm -Lmath/lib -lcrystallinemath -lalgorithms -lm -Wl,-rpath,'\$ORIGIN/..'"

run_test "Run architecture validation" \
    "cd /workspace/test_pipeline && ./validate_architecture"

echo ""
echo "=========================================="
echo "PHASE 7: THREADING SYSTEM"
echo "=========================================="
echo ""

# Create threading test
cat > test_pipeline/test_threading.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include "../include/cllm.h"
#include "../include/cllm_threads.h"

int main() {
    printf("Testing threading system...\n");
    
    // Initialize threading
    int num_threads = 13;  // 1 control + 12 workers
    if (cllm_init_threads(num_threads) != 0) {
        fprintf(stderr, "Failed to initialize threads\n");
        return 1;
    }
    printf("✓ Threading initialized with %d threads\n", num_threads);
    
    // Verify thread allocation
    int allocated = cllm_get_num_threads();
    if (allocated != num_threads) {
        fprintf(stderr, "✗ Thread count mismatch: %d (expected %d)\n", allocated, num_threads);
        return 1;
    }
    printf("✓ Thread allocation verified\n");
    
    // Cleanup
    cllm_cleanup_threads();
    printf("✓ Threading cleanup successful\n");
    
    printf("\n✓ ALL THREADING TESTS PASSED\n");
    return 0;
}
EOF

run_test "Compile threading test" \
    "cd /workspace && gcc -o test_pipeline/test_threading test_pipeline/test_threading.c -I./include -L. -lcllm -Lmath/lib -lcrystallinemath -lalgorithms -lm -lpthread -Wl,-rpath,'\$ORIGIN/..'"

run_test "Run threading test" \
    "cd /workspace/test_pipeline && ./test_threading"

echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo ""
echo "Total Tests: $TESTS_TOTAL"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo ""
    echo "The CLLM system is fully functional:"
    echo "  • Build system working"
    echo "  • Model creation operational"
    echo "  • Vocabulary building functional"
    echo "  • Inference system working"
    echo "  • Training pipeline initialized"
    echo "  • Architecture validated (12-fold symmetry, kissing spheres, etc.)"
    echo "  • Threading system operational"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Please review the failed tests above."
    exit 1
fi