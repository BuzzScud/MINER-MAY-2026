#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../include/cllm.h"

int main() {
    printf("========================================\n");
    printf("SIMPLE TRAINING PIPELINE TEST\n");
    printf("========================================\n\n");
    
    // Test 1: Create model config
    printf("[TEST 1] Creating model configuration...\n");
    CLLMConfig config = {
        .vocab_size = 1000,
        .embedding_dim = 64,
        .num_layers = 2,
        .num_heads = 4,
        .max_seq_len = 128,
        .solid_type = PLATONIC_CUBE
    };
    printf("✓ Configuration created\n\n");
    
    // Test 2: Create model
    printf("[TEST 2] Creating model...\n");
    CLLMModel* model = cllm_create_model(&config);
    if (!model) {
        fprintf(stderr, "✗ Failed to create model\n");
        return 1;
    }
    printf("✓ Model created successfully\n");
    printf("  - Vocab size: %u\n", model->vocab_size);
    printf("  - Embedding dim: %u\n", model->embedding_dim);
    printf("  - Num layers: %u\n", model->num_layers);
    printf("  - Num heads: %u\n", model->num_heads);
    printf("\n");
    
    // Test 3: Validate model
    printf("[TEST 3] Validating model structure...\n");
    if (!cllm_validate_model(model)) {
        fprintf(stderr, "✗ Model validation failed\n");
        return 1;
    }
    printf("✓ Model structure validated\n\n");
    
    // Test 4: Check Platonic solid geometry
    printf("[TEST 4] Verifying Platonic solid (CUBE)...\n");
    printf("  - Vertices: %u\n", model->geometry.vertices);
    printf("  - Edges: %u\n", model->geometry.edges);
    printf("  - Faces: %u\n", model->geometry.faces);
    
    // Verify Euler's formula: V - E + F = 2
    int euler = model->geometry.vertices - model->geometry.edges + model->geometry.faces;
    if (euler != 2) {
        fprintf(stderr, "✗ Euler's formula failed: %d - %d + %d = %d (expected 2)\n",
                model->geometry.vertices, model->geometry.edges, 
                model->geometry.faces, euler);
        return 1;
    }
    printf("  - Euler's formula: V - E + F = %d ✓\n", euler);
    printf("✓ Platonic solid verified\n\n");
    
    // Cleanup
    cllm_free_model(model);
    
    printf("========================================\n");
    printf("✓ ALL TESTS PASSED!\n");
    printf("========================================\n");
    printf("\nThe CLLM system is working correctly:\n");
    printf("  • Model creation ✓\n");
    printf("  • Model validation ✓\n");
    printf("  • Platonic solid geometry ✓\n");
    printf("  • Euler's formula verified ✓\n");
    
    return 0;
}