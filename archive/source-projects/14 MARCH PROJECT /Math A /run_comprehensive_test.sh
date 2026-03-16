#!/bin/bash

# Comprehensive CLLM Testing Script
# Tests the complete training pipeline with our working test_minimal_model

set -e  # Exit on error

echo "=================================="
echo "CLLM Comprehensive Testing Suite"
echo "=================================="
echo ""

# Setup
export LD_LIBRARY_PATH=/workspace:/workspace/algorithms
TEST_DIR="/workspace/test_results"
mkdir -p "$TEST_DIR"

echo "Test 1: Minimal Model Training (5 tokens, 1 epoch)"
echo "=================================================="
echo ""

# Compile a simple training test
cat > "$TEST_DIR/simple_train_test.c" << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include "ai/cllm.h"
#include "ai/cllm_training_system.h"

int main() {
    printf("Creating minimal model...\n");
    
    CLLMConfig config = {
        .vocab_size = 10,
        .embedding_dim = 12,
        .hidden_dim = 24,
        .num_layers = 1,
        .num_heads = 12,
        .max_seq_len = 32,
        .dropout = 0.0f,
        .use_lattice_embeddings = true,
        .use_angular_attention = true,
        .use_crystalline_loss = true,
        .use_ntt_attention = false
    };
    
    CLLMModel* model = cllm_create_model(&config);
    if (!model) {
        fprintf(stderr, "Failed to create model\n");
        return 1;
    }
    printf("✓ Model created\n\n");
    
    // Create simple training data
    printf("Creating training data...\n");
    uint32_t train_tokens[] = {1, 2, 3, 4, 5, 1, 2, 3, 4, 5};
    uint32_t train_targets[] = {2, 3, 4, 5, 1, 2, 3, 4, 5, 1};
    int num_samples = 10;
    
    printf("✓ Training data created (%d samples)\n\n", num_samples);
    
    // Run one training step
    printf("Running training step...\n");
    CLLMTrainingResult result = cllm_train_step(
        model,
        train_tokens,
        train_targets,
        num_samples,
        0.001f  // learning rate
    );
    
    if (result.success) {
        printf("✓ Training step complete\n");
        printf("  Loss: %.4f\n", result.loss);
        printf("  Tokens processed: %d\n", result.tokens_processed);
    } else {
        fprintf(stderr, "✗ Training step failed\n");
        cllm_free_model(model);
        return 1;
    }
    
    printf("\n✓ Test passed!\n");
    
    cllm_free_model(model);
    return 0;
}
EOF

echo "Compiling test..."
gcc -o "$TEST_DIR/simple_train_test" "$TEST_DIR/simple_train_test.c" \
    -I./algorithms/include -I./cllm/include -I./math/include \
    -L. -L./algorithms -lalgorithms -lcllm -L./math/lib -lcrystallinemath \
    -lm -lpthread

if [ $? -eq 0 ]; then
    echo "✓ Test compiled successfully"
    echo ""
    
    echo "Running test..."
    "$TEST_DIR/simple_train_test" 2>&1 | tee "$TEST_DIR/simple_train_output.log"
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo ""
        echo "✓ Test 1 PASSED"
    else
        echo ""
        echo "✗ Test 1 FAILED"
        exit 1
    fi
else
    echo "✗ Compilation failed"
    exit 1
fi

echo ""
echo "=================================="
echo "All tests completed successfully!"
echo "=================================="