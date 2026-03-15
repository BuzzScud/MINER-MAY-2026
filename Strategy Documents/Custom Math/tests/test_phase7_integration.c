/**
 * @file test_phase7_integration.c
 * @brief Integration test for Phase 7 - Worker functions with double arrays
 * 
 * Tests the complete forward pass using:
 * - Geometric matrices for parameters
 * - Double arrays for activations
 * - Worker functions integrated with transformer layer
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "ai/cllm.h"
#include "hierarchical_threading.h"
#include "thread_parameters_geometric.h"
#include "worker_functions_geometric.h"

#define TEST_EMBEDDING_DIM 48  // Multiple of 12 (RULE 6)
#define TEST_VOCAB_SIZE 100
#define TEST_NUM_LAYERS 2

/**
 * Test 1: Create model with geometric matrices
 */
static int test_model_creation() {
    printf("\n=== Test 1: Model Creation with Geometric Matrices ===\n");
    
    // Create model configuration
    CLLMConfig config = {
        .vocab_size = TEST_VOCAB_SIZE,
        .embedding_dim = TEST_EMBEDDING_DIM,
        .num_layers = TEST_NUM_LAYERS,
        .num_heads = 4,
        .max_seq_len = 128,
        .solid_type = PLATONIC_DODECAHEDRON
    };
    
    // Create model
    CLLMModel* model = cllm_create_model(&config);
    if (!model) {
        printf("❌ Failed to create model\n");
        return -1;
    }
    
    printf("✅ Model created successfully\n");
    printf("   - Vocab size: %u\n", model->vocab_size);
    printf("   - Embedding dim: %u\n", model->embedding_dim);
    printf("   - Num layers: %u\n", model->num_layers);
    printf("   - Thread pool: %p\n", (void*)model->threads);
    
    // Verify thread pool exists
    if (!model->threads) {
        printf("❌ Thread pool not created\n");
        cllm_free_model(model);
        return -1;
    }
    
    printf("✅ Thread pool created\n");
    
    // Cleanup
    cllm_free_model(model);
    return 0;
}

/**
 * Test 2: Allocate geometric parameters for a thread
 */
static int test_parameter_allocation() {
    printf("\n=== Test 2: Geometric Parameter Allocation ===\n");
    
    // Create a test thread
    HierarchicalThread* thread = hierarchical_thread_create(
        1, 1, NULL, PLATONIC_DODECAHEDRON, 60
    );
    
    if (!thread) {
        printf("❌ Failed to create thread\n");
        return -1;
    }
    
    printf("✅ Thread created [layer=%d, dim=%d]\n", thread->layer, thread->dimension);
    
    // Allocate attention weight matrices
    int result = 0;
    result |= thread_allocate_geometric_parameter(thread, "W_q", 
                                                  TEST_EMBEDDING_DIM, TEST_EMBEDDING_DIM);
    result |= thread_allocate_geometric_parameter(thread, "W_k",
                                                  TEST_EMBEDDING_DIM, TEST_EMBEDDING_DIM);
    result |= thread_allocate_geometric_parameter(thread, "W_v",
                                                  TEST_EMBEDDING_DIM, TEST_EMBEDDING_DIM);
    
    if (result != 0) {
        printf("❌ Failed to allocate attention parameters\n");
        hierarchical_thread_free(thread);
        return -1;
    }
    
    printf("✅ Attention parameters allocated\n");
    
    // Allocate FFN weight matrices
    uint32_t hidden_dim = TEST_EMBEDDING_DIM * 4;
    result |= thread_allocate_geometric_parameter(thread, "W_ffn1",
                                                  TEST_EMBEDDING_DIM, hidden_dim);
    result |= thread_allocate_geometric_parameter(thread, "W_ffn2",
                                                  hidden_dim, TEST_EMBEDDING_DIM);
    
    if (result != 0) {
        printf("❌ Failed to allocate FFN parameters\n");
        hierarchical_thread_free(thread);
        return -1;
    }
    
    printf("✅ FFN parameters allocated\n");
    printf("   - W_q: %u × %u\n", TEST_EMBEDDING_DIM, TEST_EMBEDDING_DIM);
    printf("   - W_k: %u × %u\n", TEST_EMBEDDING_DIM, TEST_EMBEDDING_DIM);
    printf("   - W_v: %u × %u\n", TEST_EMBEDDING_DIM, TEST_EMBEDDING_DIM);
    printf("   - W_ffn1: %u × %u\n", TEST_EMBEDDING_DIM, hidden_dim);
    printf("   - W_ffn2: %u × %u\n", hidden_dim, TEST_EMBEDDING_DIM);
    
    // Cleanup
    hierarchical_thread_free(thread);
    return 0;
}

/**
 * Test 3: Worker function - Attention computation
 */
static int test_attention_computation() {
    printf("\n=== Test 3: Attention Computation ===\n");
    
    // Create thread
    HierarchicalThread* thread = hierarchical_thread_create(
        1, 1, NULL, PLATONIC_DODECAHEDRON, 60
    );
    
    if (!thread) {
        printf("❌ Failed to create thread\n");
        return -1;
    }
    
    // Allocate parameters
    thread_allocate_geometric_parameter(thread, "W_q", TEST_EMBEDDING_DIM, TEST_EMBEDDING_DIM);
    thread_allocate_geometric_parameter(thread, "W_k", TEST_EMBEDDING_DIM, TEST_EMBEDDING_DIM);
    thread_allocate_geometric_parameter(thread, "W_v", TEST_EMBEDDING_DIM, TEST_EMBEDDING_DIM);
    
    // Initialize parameters (find indices first)
    int idx_q = thread_get_parameter_index(thread, "W_q", 0);
    int idx_k = thread_get_parameter_index(thread, "W_k", 0);
    int idx_v = thread_get_parameter_index(thread, "W_v", 0);
    
    if (idx_q >= 0) {
        thread_initialize_geometric_parameter(thread, idx_q, GEOMETRIC_INIT_XAVIER, 12345);
    }
    if (idx_k >= 0) {
        thread_initialize_geometric_parameter(thread, idx_k, GEOMETRIC_INIT_XAVIER, 12346);
    }
    if (idx_v >= 0) {
        thread_initialize_geometric_parameter(thread, idx_v, GEOMETRIC_INIT_XAVIER, 12347);
    }
    
    // Create input and output arrays
    double* input = (double*)malloc(TEST_EMBEDDING_DIM * sizeof(double));
    double* output = (double*)calloc(TEST_EMBEDDING_DIM, sizeof(double));
    
    if (!input || !output) {
        printf("❌ Failed to allocate arrays\n");
        free(input);
        free(output);
        hierarchical_thread_free(thread);
        return -1;
    }
    
    // Initialize input with test values
    for (uint32_t i = 0; i < TEST_EMBEDDING_DIM; i++) {
        input[i] = ((double)i / TEST_EMBEDDING_DIM) * 2.0 - 1.0;
    }
    
    // Call worker function
    int result = worker_compute_attention_double(thread, input, TEST_EMBEDDING_DIM, output);
    
    if (result != 0) {
        printf("❌ Attention computation failed\n");
        free(input);
        free(output);
        hierarchical_thread_free(thread);
        return -1;
    }
    
    // Verify output is not all zeros
    int non_zero = 0;
    for (uint32_t i = 0; i < TEST_EMBEDDING_DIM; i++) {
        if (fabs(output[i]) > 1e-10) {
            non_zero++;
        }
    }
    
    if (non_zero == 0) {
        printf("❌ Attention output is all zeros\n");
        free(input);
        free(output);
        hierarchical_thread_free(thread);
        return -1;
    }
    
    printf("✅ Attention computation successful\n");
    printf("   - Non-zero outputs: %d/%u\n", non_zero, TEST_EMBEDDING_DIM);
    printf("   - Sample outputs: [%.4f, %.4f, %.4f, ...]\n", 
           output[0], output[1], output[2]);
    
    // Cleanup
    free(input);
    free(output);
    hierarchical_thread_free(thread);
    return 0;
}

/**
 * Test 4: Worker function - FFN computation
 */
static int test_ffn_computation() {
    printf("\n=== Test 4: FFN Computation ===\n");
    
    // Create thread
    HierarchicalThread* thread = hierarchical_thread_create(
        1, 1, NULL, PLATONIC_DODECAHEDRON, 60
    );
    
    if (!thread) {
        printf("❌ Failed to create thread\n");
        return -1;
    }
    
    // Allocate parameters
    uint32_t hidden_dim = TEST_EMBEDDING_DIM * 4;
    thread_allocate_geometric_parameter(thread, "W_ffn1", TEST_EMBEDDING_DIM, hidden_dim);
    thread_allocate_geometric_parameter(thread, "W_ffn2", hidden_dim, TEST_EMBEDDING_DIM);
    
    // Initialize parameters
    int idx_ffn1 = thread_get_parameter_index(thread, "W_ffn1", 0);
    int idx_ffn2 = thread_get_parameter_index(thread, "W_ffn2", 0);
    
    if (idx_ffn1 >= 0) {
        thread_initialize_geometric_parameter(thread, idx_ffn1, GEOMETRIC_INIT_HE, 54321);
    }
    if (idx_ffn2 >= 0) {
        thread_initialize_geometric_parameter(thread, idx_ffn2, GEOMETRIC_INIT_HE, 54322);
    }
    
    // Create input and output arrays
    double* input = (double*)malloc(TEST_EMBEDDING_DIM * sizeof(double));
    double* output = (double*)calloc(TEST_EMBEDDING_DIM, sizeof(double));
    
    if (!input || !output) {
        printf("❌ Failed to allocate arrays\n");
        free(input);
        free(output);
        hierarchical_thread_free(thread);
        return -1;
    }
    
    // Initialize input
    for (uint32_t i = 0; i < TEST_EMBEDDING_DIM; i++) {
        input[i] = ((double)i / TEST_EMBEDDING_DIM) * 2.0 - 1.0;
    }
    
    // Call worker function
    int result = worker_compute_ffn_double(thread, input, TEST_EMBEDDING_DIM, 
                                          hidden_dim, output);
    
    if (result != 0) {
        printf("❌ FFN computation failed\n");
        free(input);
        free(output);
        hierarchical_thread_free(thread);
        return -1;
    }
    
    // Verify output
    int non_zero = 0;
    for (uint32_t i = 0; i < TEST_EMBEDDING_DIM; i++) {
        if (fabs(output[i]) > 1e-10) {
            non_zero++;
        }
    }
    
    if (non_zero == 0) {
        printf("❌ FFN output is all zeros\n");
        free(input);
        free(output);
        hierarchical_thread_free(thread);
        return -1;
    }
    
    printf("✅ FFN computation successful\n");
    printf("   - Hidden dim: %u\n", hidden_dim);
    printf("   - Non-zero outputs: %d/%u\n", non_zero, TEST_EMBEDDING_DIM);
    printf("   - Sample outputs: [%.4f, %.4f, %.4f, ...]\n",
           output[0], output[1], output[2]);
    
    // Cleanup
    free(input);
    free(output);
    hierarchical_thread_free(thread);
    return 0;
}

/**
 * Main test runner
 */
int main() {
    printf("╔════════════════════════════════════════════════════════════╗\n");
    printf("║  Phase 7 Integration Test Suite                           ║\n");
    printf("║  Testing: Geometric Matrices + Double Arrays              ║\n");
    printf("╚════════════════════════════════════════════════════════════╝\n");
    
    int passed = 0;
    int total = 4;
    
    if (test_model_creation() == 0) passed++;
    if (test_parameter_allocation() == 0) passed++;
    if (test_attention_computation() == 0) passed++;
    if (test_ffn_computation() == 0) passed++;
    
    printf("\n╔════════════════════════════════════════════════════════════╗\n");
    printf("║  Test Results: %d/%d tests passed                          ║\n", passed, total);
    if (passed == total) {
        printf("║  Status: ✅ ALL TESTS PASSED                              ║\n");
        printf("║  Phase 7 Integration: SUCCESSFUL                          ║\n");
    } else {
        printf("║  Status: ❌ SOME TESTS FAILED                             ║\n");
    }
    printf("╚════════════════════════════════════════════════════════════╝\n");
    
    return (passed == total) ? 0 : 1;
}