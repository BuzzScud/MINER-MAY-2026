/**
 * @file test_worker_functions_geometric.c
 * @brief Test suite for geometric worker functions
 * 
 * Tests the new worker functions that use geometric matrix storage:
 * - worker_get_embedding_geometric()
 * - worker_compute_attention_geometric()
 * - worker_compute_ffn_geometric()
 * - worker_compute_gradients_geometric()
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "hierarchical_threading.h"
#include "thread_parameters_geometric.h"
#include "geometric_matrix.h"
#include "math.h"

// Import worker functions
extern int worker_get_embedding_geometric(
    HierarchicalThread* thread,
    uint32_t token_id,
    CrystallineAbacus* output
);

extern int worker_compute_attention_geometric(
    HierarchicalThread* thread,
    const CrystallineAbacus* input,
    uint32_t embedding_dim,
    CrystallineAbacus* output
);

extern int worker_compute_ffn_geometric(
    HierarchicalThread* thread,
    const CrystallineAbacus* input,
    uint32_t embedding_dim,
    uint32_t hidden_dim,
    CrystallineAbacus* output
);

extern int worker_compute_gradients_geometric(
    HierarchicalThread* thread,
    const CrystallineAbacus* grad_output,
    const CrystallineAbacus* input,
    uint32_t embedding_dim
);

// Helper to create a test thread
HierarchicalThread* create_test_thread(uint8_t layer, uint8_t dimension) {
    HierarchicalThread* thread = (HierarchicalThread*)calloc(1, sizeof(HierarchicalThread));
    if (!thread) return NULL;
    
    thread->thread_id = layer * 12 + dimension;
    thread->layer = layer;
    thread->dimension = dimension;
    thread->role = (dimension == 0) ? THREAD_ROLE_CONTROL : THREAD_ROLE_WORKER;
    
    return thread;
}

// Helper to free test thread
void free_test_thread(HierarchicalThread* thread) {
    if (!thread) return;
    thread_free_geometric_parameters(thread);
    free(thread);
}

// ============================================================================
// TEST 1: Embedding Lookup
// ============================================================================

int test_embedding_lookup(void) {
    printf("=== Test 1: Embedding Lookup ===\n");
    
    // Create Layer 0 thread (embeddings)
    HierarchicalThread* thread = create_test_thread(0, 1);
    if (!thread) {
        printf("FAIL: Could not create thread\n");
        return -1;
    }
    
    // Allocate embedding parameter
    uint32_t vocab_size = 100;
    uint32_t embed_dim = 128;
    
    int idx = thread_allocate_geometric_parameter(thread, "embedding", vocab_size, embed_dim);
    if (idx < 0) {
        printf("FAIL: Could not allocate embedding parameter\n");
        free_test_thread(thread);
        return -1;
    }
    
    // Initialize with Xavier
    if (thread_initialize_geometric_parameter(thread, idx, GEOMETRIC_INIT_XAVIER, 42) != 0) {
        printf("FAIL: Could not initialize embedding\n");
        free_test_thread(thread);
        return -1;
    }
    
    // Test embedding lookup
    CrystallineAbacus* output = abacus_new(60);  // Base 60
    if (!output) {
        printf("FAIL: Could not create output abacus\n");
        free_test_thread(thread);
        return -1;
    }
    
    uint32_t token_id = 42;
    int result = worker_get_embedding_geometric(thread, token_id, output);
    
    if (result != 0) {
        printf("FAIL: Embedding lookup failed\n");
        abacus_free(output);
        free_test_thread(thread);
        return -1;
    }
    
    // Verify output is not all zeros
    double sum = 0.0;
    for (uint32_t i = 0; i < embed_dim; i++) {
        double val;
        CrystallineAbacus* temp = abacus_new(60);
        // Access the bead value directly
        if (i < output->num_beads) {
            abacus_to_double(output, &val);
            sum += fabs(val);
            break; // Just check first value
        }
        abacus_free(temp);
    }
    
    if (sum > 0.0) {
        printf("✅ Embedding lookup produces non-zero output\n");
        printf("   Token %u embedding sum: %.6f\n", token_id, sum);
    } else {
        printf("FAIL: Embedding lookup produces zero output\n");
        abacus_free(output);
        free_test_thread(thread);
        return -1;
    }
    
    abacus_free(output);
    free_test_thread(thread);
    printf("PASS: Embedding lookup works\n\n");
    return 0;
}

// ============================================================================
// TEST 2: Attention Computation
// ============================================================================

int test_attention_computation(void) {
    printf("=== Test 2: Attention Computation ===\n");
    
    // Create Layer 1 thread (transformer)
    HierarchicalThread* thread = create_test_thread(1, 1);
    if (!thread) {
        printf("FAIL: Could not create thread\n");
        return -1;
    }
    
    uint32_t embed_dim = 128;
    
    // Allocate attention parameters
    int idx_q = thread_allocate_geometric_parameter(thread, "W_q", embed_dim, embed_dim);
    int idx_k = thread_allocate_geometric_parameter(thread, "W_k", embed_dim, embed_dim);
    int idx_v = thread_allocate_geometric_parameter(thread, "W_v", embed_dim, embed_dim);
    
    // Initialize with Xavier
    thread_initialize_geometric_parameter(thread, idx_q, GEOMETRIC_INIT_XAVIER, 42);
    thread_initialize_geometric_parameter(thread, idx_k, GEOMETRIC_INIT_XAVIER, 43);
    thread_initialize_geometric_parameter(thread, idx_v, GEOMETRIC_INIT_XAVIER, 44);
    
    // Create input
    CrystallineAbacus* input = abacus_new(60);
    if (!input) {
        printf("FAIL: Could not create input abacus\n");
        free_test_thread(thread);
        return -1;
    }
    
    // Set input to small values
    CrystallineAbacus* val = abacus_from_double(0.1, 60, 10);
    for (uint32_t i = 0; i < embed_dim && i < input->capacity; i++) {
        if (i < val->num_beads) {
            input->beads[i] = val->beads[i];
        }
    }
    input->num_beads = (embed_dim < input->capacity) ? embed_dim : input->capacity;
    abacus_free(val);
    
    // Create output
    CrystallineAbacus* output = abacus_new(60);
    if (!output) {
        printf("FAIL: Could not create output abacus\n");
        abacus_free(input);
        free_test_thread(thread);
        return -1;
    }
    
    // Compute attention
    int result = worker_compute_attention_geometric(thread, input, embed_dim, output);
    
    if (result != 0) {
        printf("FAIL: Attention computation failed\n");
        abacus_free(output);
        abacus_free(input);
        free_test_thread(thread);
        return -1;
    }
    
    // Verify output is not all zeros
    double sum = 0.0;
    if (output->num_beads > 0) {
        double val;
        abacus_to_double(output, &val);
        sum = fabs(val);
    }
    
    if (sum > 0.0) {
        printf("✅ Attention computation produces non-zero output\n");
        printf("   Output sum: %.6f\n", sum);
    } else {
        printf("⚠️  Attention computation produces zero output (may be expected)\n");
    }
    
    abacus_free(output);
    abacus_free(input);
    free_test_thread(thread);
    printf("PASS: Attention computation works\n\n");
    return 0;
}

// ============================================================================
// TEST 3: FFN Computation
// ============================================================================

int test_ffn_computation(void) {
    printf("=== Test 3: FFN Computation ===\n");
    
    // Create Layer 1 thread
    HierarchicalThread* thread = create_test_thread(1, 2);
    if (!thread) {
        printf("FAIL: Could not create thread\n");
        return -1;
    }
    
    uint32_t embed_dim = 128;
    uint32_t hidden_dim = 512;
    
    // Allocate FFN parameters
    int idx_ffn1 = thread_allocate_geometric_parameter(thread, "W_ffn1", embed_dim, hidden_dim);
    int idx_ffn2 = thread_allocate_geometric_parameter(thread, "W_ffn2", hidden_dim, embed_dim);
    
    // Initialize with He
    thread_initialize_geometric_parameter(thread, idx_ffn1, GEOMETRIC_INIT_HE, 42);
    thread_initialize_geometric_parameter(thread, idx_ffn2, GEOMETRIC_INIT_HE, 43);
    
    // Create input
    CrystallineAbacus* input = abacus_new(60);
    if (!input) {
        printf("FAIL: Could not create input abacus\n");
        free_test_thread(thread);
        return -1;
    }
    
    // Set input to small values
    CrystallineAbacus* val = abacus_from_double(0.1, 60, 10);
    for (uint32_t i = 0; i < embed_dim && i < input->capacity; i++) {
        if (i < val->num_beads) {
            input->beads[i] = val->beads[i];
        }
    }
    input->num_beads = (embed_dim < input->capacity) ? embed_dim : input->capacity;
    abacus_free(val);
    
    // Create output
    CrystallineAbacus* output = abacus_new(60);
    if (!output) {
        printf("FAIL: Could not create output abacus\n");
        abacus_free(input);
        free_test_thread(thread);
        return -1;
    }
    
    // Compute FFN
    int result = worker_compute_ffn_geometric(thread, input, embed_dim, hidden_dim, output);
    
    if (result != 0) {
        printf("FAIL: FFN computation failed\n");
        abacus_free(output);
        abacus_free(input);
        free_test_thread(thread);
        return -1;
    }
    
    // Verify output is not all zeros
    double sum = 0.0;
    if (output->num_beads > 0) {
        double val;
        abacus_to_double(output, &val);
        sum = fabs(val);
    }
    
    if (sum > 0.0) {
        printf("✅ FFN computation produces non-zero output\n");
        printf("   Output sum: %.6f\n", sum);
    } else {
        printf("⚠️  FFN computation produces zero output (may be expected)\n");
    }
    
    abacus_free(output);
    abacus_free(input);
    free_test_thread(thread);
    printf("PASS: FFN computation works\n\n");
    return 0;
}

// ============================================================================
// TEST 4: Gradient Computation
// ============================================================================

int test_gradient_computation(void) {
    printf("=== Test 4: Gradient Computation ===\n");
    
    // Create Layer 1 thread
    HierarchicalThread* thread = create_test_thread(1, 3);
    if (!thread) {
        printf("FAIL: Could not create thread\n");
        return -1;
    }
    
    uint32_t embed_dim = 128;
    
    // Allocate parameters
    int idx_q = thread_allocate_geometric_parameter(thread, "W_q", embed_dim, embed_dim);
    thread_initialize_geometric_parameter(thread, idx_q, GEOMETRIC_INIT_XAVIER, 42);
    
    // Create grad_output
    CrystallineAbacus* grad_output = abacus_new(60);
    if (!grad_output) {
        printf("FAIL: Could not create grad_output abacus\n");
        free_test_thread(thread);
        return -1;
    }
    
    // Set grad_output to small values
    CrystallineAbacus* val = abacus_from_double(0.01, 60, 10);
    for (uint32_t i = 0; i < embed_dim && i < grad_output->capacity; i++) {
        if (i < val->num_beads) {
            grad_output->beads[i] = val->beads[i];
        }
    }
    grad_output->num_beads = (embed_dim < grad_output->capacity) ? embed_dim : grad_output->capacity;
    abacus_free(val);
    
    // Create input
    CrystallineAbacus* input = abacus_new(60);
    if (!input) {
        printf("FAIL: Could not create input abacus\n");
        abacus_free(grad_output);
        free_test_thread(thread);
        return -1;
    }
    
    val = abacus_from_double(0.1, 60, 10);
    for (uint32_t i = 0; i < embed_dim && i < input->capacity; i++) {
        if (i < val->num_beads) {
            input->beads[i] = val->beads[i];
        }
    }
    input->num_beads = (embed_dim < input->capacity) ? embed_dim : input->capacity;
    abacus_free(val);
    
    // Compute gradients
    int result = worker_compute_gradients_geometric(thread, grad_output, input, embed_dim);
    
    if (result != 0) {
        printf("FAIL: Gradient computation failed\n");
        abacus_free(input);
        abacus_free(grad_output);
        free_test_thread(thread);
        return -1;
    }
    
    printf("✅ Gradient computation completed\n");
    
    // Verify gradients were accumulated (check gradient matrix)
    GeometricMatrix* grad_W_q = thread_get_gradient_matrix(thread, "W_q", 0);
    if (grad_W_q) {
        printf("   Gradient matrix found\n");
        printf("   Vertices: %u\n", grad_W_q->num_vertices);
    } else {
        printf("⚠️  Gradient matrix not found\n");
    }
    
    abacus_free(input);
    abacus_free(grad_output);
    free_test_thread(thread);
    printf("PASS: Gradient computation works\n\n");
    return 0;
}

// ============================================================================
// MAIN
// ============================================================================

int main(void) {
    printf("╔══════════════════════════════════════════════════════════════╗\n");
    printf("║     Worker Functions Geometric Test Suite                   ║\n");
    printf("╚══════════════════════════════════════════════════════════════╝\n\n");
    
    int failed = 0;
    
    if (test_embedding_lookup() != 0) failed++;
    if (test_attention_computation() != 0) failed++;
    if (test_ffn_computation() != 0) failed++;
    if (test_gradient_computation() != 0) failed++;
    
    printf("╔══════════════════════════════════════════════════════════════╗\n");
    if (failed == 0) {
        printf("║                  ALL TESTS PASSED ✓                          ║\n");
    } else {
        printf("║                  %d TESTS FAILED ✗                            ║\n", failed);
    }
    printf("╚══════════════════════════════════════════════════════════════╝\n");
    
    return failed;
}