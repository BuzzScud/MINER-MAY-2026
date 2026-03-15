/**
 * @file worker_functions_geometric_double.c
 * @brief Worker functions using geometric matrix storage with double arrays
 * 
 * This file contains refactored implementations that use:
 * - Geometric matrices for parameter storage (memory efficient)
 * - Double arrays for activations and gradients (computationally efficient)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "hierarchical_threading.h"
#include "thread_parameters_geometric.h"
#include "geometric_matrix.h"
#include "math/transcendental.h"  // Custom math functions - NO math.h!

// ============================================================================
// EMBEDDING OPERATIONS
// ============================================================================

/**
 * Get embedding for a token using geometric matrix storage
 * 
 * @param thread Thread that owns the embedding
 * @param token_id Token ID
 * @param output Output array (pre-allocated, size: embedding_dim)
 * @param embedding_dim Embedding dimension
 * @return 0 on success, -1 on error
 */
int worker_get_embedding_double(
    HierarchicalThreadPool* pool,
    HierarchicalThread* thread,
    uint32_t token_id,
    double* output,
    uint32_t embedding_dim
) {
    if (!pool || !thread || !output) {
        fprintf(stderr, "ERROR: Invalid pool, thread or output buffer\n");
        return -1;
    }
    
    // Parameters are consolidated in layer 0 threads (dimensions 0-11)
    // Search through layer 0 threads to find the embeddings
    GeometricMatrix* embedding = NULL;
    for (uint8_t dim = 0; dim < 12 && !embedding; dim++) {
        HierarchicalThread* layer0_thread = hierarchical_thread_get(pool, 0, dim);
        if (layer0_thread) {
            embedding = thread_get_parameter_matrix(layer0_thread, "embeddings", 0);
        }
    }
    
    if (!embedding) {
        fprintf(stderr, "ERROR: Embedding matrix not found in any layer 0 thread\n");
        return -1;
    }
    
    // Verify dimensions
    if (embedding->cols != embedding_dim) {
        fprintf(stderr, "ERROR: Embedding dimension mismatch (expected %u, got %u)\n",
                embedding_dim, embedding->cols);
        return -1;
    }
    
    // Find local index for this token
    // The token_id is global, but we need the local index in this thread's embedding matrix
    uint32_t local_idx = 0;
    bool found = false;
    
    // For now, use token_id modulo num_rows as a simple mapping
    // TODO: Implement proper token-to-local-index mapping
    if (token_id < embedding->rows) {
        local_idx = token_id;
        found = true;
    } else {
        local_idx = token_id % embedding->rows;
        found = true;
    }
    
    if (!found) {
        fprintf(stderr, "ERROR: Token %u not found in thread's embedding matrix\n", token_id);
        return -1;
    }
    
    // Extract embedding for this token using geometric interpolation
    CrystallineAbacus* temp = abacus_new(60);
    if (!temp) {
        fprintf(stderr, "ERROR: Failed to allocate temporary abacus\n");
        return -1;
    }
    
    for (uint32_t i = 0; i < embedding_dim; i++) {
        if (geometric_matrix_get(embedding, local_idx, i, temp) == 0) {
            abacus_to_double(temp, &output[i]);
        } else {
            output[i] = 0.0;
        }
    }
    
    abacus_free(temp);
    return 0;
}

// ============================================================================
// ATTENTION OPERATIONS
// ============================================================================

/**
 * Compute attention using geometric matrix storage
 * 
 * Computes:
 *   Q = input × W_q
 *   K = input × W_k
 *   V = input × W_v
 *   scores = Q · K^T / sqrt(embed_dim)
 *   attention = softmax(scores)
 *   output = attention × V
 * 
 * @param thread Thread that owns the computation
 * @param input Input array (size: embedding_dim)
 * @param embedding_dim Embedding dimension
 * @param output Output array (pre-allocated, size: embedding_dim)
 * @return 0 on success, -1 on error
 */
int worker_compute_attention_double(
    HierarchicalThreadPool* pool,
    HierarchicalThread* thread,
    const double* input,
    uint32_t embedding_dim,
    double* output
) {
    if (!pool || !thread || !input || !output) {
        fprintf(stderr, "ERROR: Invalid parameters for attention\n");
        return -1;
    }
    
    // Parameters are consolidated in layer 0 threads (dimensions 0-11)
    // Search through layer 0 threads to find attention weights
    GeometricMatrix* W_q = NULL;
    GeometricMatrix* W_k = NULL;
    GeometricMatrix* W_v = NULL;
    
    for (uint8_t dim = 0; dim < 12; dim++) {
        HierarchicalThread* layer0_thread = hierarchical_thread_get(pool, 0, dim);
        if (layer0_thread) {
            if (!W_q) W_q = thread_get_parameter_matrix(layer0_thread, "W_q", 0);
            if (!W_k) W_k = thread_get_parameter_matrix(layer0_thread, "W_k", 0);
            if (!W_v) W_v = thread_get_parameter_matrix(layer0_thread, "W_v", 0);
            
            // Stop if we found all three
            if (W_q && W_k && W_v) break;
        }
    }
    
    if (!W_q || !W_k || !W_v) {
        fprintf(stderr, "ERROR: Attention weight matrices not found in layer 0 (found: W_q=%p, W_k=%p, W_v=%p)\n",
                (void*)W_q, (void*)W_k, (void*)W_v);
        return -1;
    }
    
    // Allocate temporary arrays for Q, K, V
    double* Q = (double*)calloc(embedding_dim, sizeof(double));
    double* K = (double*)calloc(embedding_dim, sizeof(double));
    double* V = (double*)calloc(embedding_dim, sizeof(double));
    
    if (!Q || !K || !V) {
        fprintf(stderr, "ERROR: Failed to allocate Q, K, V arrays\n");
        free(Q);
        free(K);
        free(V);
        return -1;
    }
    
    // Temporary abacus for getting matrix values
    CrystallineAbacus* temp_weight = abacus_new(60);
    if (!temp_weight) {
        fprintf(stderr, "ERROR: Failed to allocate temporary abacus\n");
        free(Q);
        free(K);
        free(V);
        return -1;
    }
    
    // Compute Q = input × W_q
    for (uint32_t i = 0; i < embedding_dim; i++) {
        double sum = 0.0;
        for (uint32_t j = 0; j < embedding_dim; j++) {
            if (geometric_matrix_get(W_q, j, i, temp_weight) == 0) {
                double weight_val;
                abacus_to_double(temp_weight, &weight_val);
                sum += input[j] * weight_val;
            }
        }
        Q[i] = sum;
    }
    
    // Compute K = input × W_k
    for (uint32_t i = 0; i < embedding_dim; i++) {
        double sum = 0.0;
        for (uint32_t j = 0; j < embedding_dim; j++) {
            if (geometric_matrix_get(W_k, j, i, temp_weight) == 0) {
                double weight_val;
                abacus_to_double(temp_weight, &weight_val);
                sum += input[j] * weight_val;
            }
        }
        K[i] = sum;
    }
    
    // Compute V = input × W_v
    for (uint32_t i = 0; i < embedding_dim; i++) {
        double sum = 0.0;
        for (uint32_t j = 0; j < embedding_dim; j++) {
            if (geometric_matrix_get(W_v, j, i, temp_weight) == 0) {
                double weight_val;
                abacus_to_double(temp_weight, &weight_val);
                sum += input[j] * weight_val;
            }
        }
        V[i] = sum;
    }
    
    abacus_free(temp_weight);
    
    // Compute attention score: Q · K^T
    double score = 0.0;
    for (uint32_t i = 0; i < embedding_dim; i++) {
        score += Q[i] * K[i];
    }
    
    // Scale by sqrt(embedding_dim) using custom math
    double scale = 1.0 / math_sqrt((double)embedding_dim);
    score *= scale;
    
    // Apply softmax (simplified for single token)
    // In full implementation, this would be over all tokens
    double attention_weight = math_exp(score);
    
    // Compute output = attention_weight × V
    for (uint32_t i = 0; i < embedding_dim; i++) {
        output[i] = attention_weight * V[i];
    }
    
    // Cleanup
    free(Q);
    free(K);
    free(V);
    
    return 0;
}

// ============================================================================
// FFN OPERATIONS
// ============================================================================

/**
 * Compute FFN using geometric matrix storage
 * 
 * Computes:
 *   hidden = ReLU(input × W_ffn1)
 *   output = hidden × W_ffn2
 * 
 * @param thread Thread that owns the computation
 * @param input Input array (size: embedding_dim)
 * @param embedding_dim Embedding dimension
 * @param hidden_dim Hidden dimension
 * @param output Output array (pre-allocated, size: embedding_dim)
 * @return 0 on success, -1 on error
 */
int worker_compute_ffn_double(
    HierarchicalThreadPool* pool,
    HierarchicalThread* thread,
    const double* input,
    uint32_t embedding_dim,
    uint32_t hidden_dim,
    double* output
) {
    if (!pool || !thread || !input || !output) {
        fprintf(stderr, "ERROR: Invalid parameters for FFN\n");
        return -1;
    }
    
    // Parameters are consolidated in layer 0 threads (dimensions 0-11)
    // Search through layer 0 threads to find FFN weights
    GeometricMatrix* W_ffn1 = NULL;
    GeometricMatrix* W_ffn2 = NULL;
    
    for (uint8_t dim = 0; dim < 12; dim++) {
        HierarchicalThread* layer0_thread = hierarchical_thread_get(pool, 0, dim);
        if (layer0_thread) {
            if (!W_ffn1) W_ffn1 = thread_get_parameter_matrix(layer0_thread, "W_ffn1", 0);
            if (!W_ffn2) W_ffn2 = thread_get_parameter_matrix(layer0_thread, "W_ffn2", 0);
            
            // Stop if we found both
            if (W_ffn1 && W_ffn2) break;
        }
    }
    
    if (!W_ffn1 || !W_ffn2) {
        fprintf(stderr, "ERROR: FFN weight matrices not found in layer 0 (found: W_ffn1=%p, W_ffn2=%p)\n",
                (void*)W_ffn1, (void*)W_ffn2);
        return -1;
    }
    
    // Allocate temporary hidden layer and weight buffer
    double* hidden = (double*)calloc(hidden_dim, sizeof(double));
    CrystallineAbacus* temp_weight = abacus_new(60);
    
    if (!hidden || !temp_weight) {
        fprintf(stderr, "ERROR: Failed to allocate temporary buffers\n");
        free(hidden);
        if (temp_weight) abacus_free(temp_weight);
        return -1;
    }
    
    // Compute hidden = input × W_ffn1
    for (uint32_t i = 0; i < hidden_dim; i++) {
        double sum = 0.0;
        for (uint32_t j = 0; j < embedding_dim; j++) {
            if (geometric_matrix_get(W_ffn1, j, i, temp_weight) == 0) {
                double weight_val;
                abacus_to_double(temp_weight, &weight_val);
                sum += input[j] * weight_val;
            }
        }
        // Apply ReLU activation
        hidden[i] = (sum > 0.0) ? sum : 0.0;
    }
    
    // Compute output = hidden × W_ffn2
    for (uint32_t i = 0; i < embedding_dim; i++) {
        double sum = 0.0;
        for (uint32_t j = 0; j < hidden_dim; j++) {
            if (geometric_matrix_get(W_ffn2, j, i, temp_weight) == 0) {
                double weight_val;
                abacus_to_double(temp_weight, &weight_val);
                sum += hidden[j] * weight_val;
            }
        }
        output[i] = sum;
    }
    
    // Cleanup
    abacus_free(temp_weight);
    free(hidden);
    
    return 0;
}

// ============================================================================
// GRADIENT OPERATIONS
// ============================================================================

/**
 * Compute and accumulate gradients using geometric matrix storage
 * 
 * This computes gradients for attention weights:
 *   ∂L/∂W_q = grad_output × input^T
 * 
 * Gradients are accumulated to geometric matrix vertices using
 * barycentric interpolation.
 * 
 * @param thread Thread that owns the parameters
 * @param grad_output Gradient from next layer (size: embedding_dim)
 * @param input Input that was used in forward pass (size: embedding_dim)
 * @param embedding_dim Embedding dimension
 * @return 0 on success, -1 on error
 */
int worker_compute_gradients_double(
    HierarchicalThreadPool* pool,
    HierarchicalThread* thread,
    const double* grad_output,
    const double* input,
    uint32_t embedding_dim
) {
    if (!thread) {
        fprintf(stderr, "ERROR: thread is NULL in gradient computation\n");
        return -1;
    }
    if (!grad_output) {
        fprintf(stderr, "ERROR: grad_output is NULL in gradient computation\n");
        return -1;
    }
    if (!input) {
        fprintf(stderr, "ERROR: input is NULL in gradient computation\n");
        return -1;
    }
    
    fprintf(stderr, "DEBUG: worker_compute_gradients_double called\n");
    fflush(stderr);
    
    // Get gradient matrices
    fprintf(stderr, "DEBUG: Getting gradient matrix W_q (pool=%p, thread=%p, layer=%d)\n", 
            (void*)pool, (void*)thread, thread ? thread->layer : -1);
    fflush(stderr);
    GeometricMatrix* grad_W_q = thread_get_gradient_matrix_with_pool(pool, thread, "W_q", 0);
    fprintf(stderr, "DEBUG: grad_W_q=%p\n", (void*)grad_W_q);
    fflush(stderr);
    
    fprintf(stderr, "DEBUG: Getting gradient matrix W_k\n");
    fflush(stderr);
    GeometricMatrix* grad_W_k = thread_get_gradient_matrix_with_pool(pool, thread, "W_k", 0);
    fprintf(stderr, "DEBUG: grad_W_k=%p\n", (void*)grad_W_k);
    fflush(stderr);
    
    fprintf(stderr, "DEBUG: Getting gradient matrix W_v\n");
    fflush(stderr);
    GeometricMatrix* grad_W_v = thread_get_gradient_matrix_with_pool(pool, thread, "W_v", 0);
    fprintf(stderr, "DEBUG: grad_W_v=%p\n", (void*)grad_W_v);
    fflush(stderr);
    
    if (!grad_W_q || !grad_W_k || !grad_W_v) {
        fprintf(stderr, "ERROR: Gradient matrices not found\n");
        return -1;
    }
    
    fprintf(stderr, "DEBUG: All gradient matrices found\n");
    fflush(stderr);
    
    fprintf(stderr, "DEBUG: Computing gradients (embedding_dim=%u)\n", embedding_dim);
    
    // Compute gradient: ∂L/∂W = grad_output × input^T
    // Accumulate gradient at each position (will be distributed to vertices)
    for (uint32_t i = 0; i < embedding_dim; i++) {
        for (uint32_t j = 0; j < embedding_dim; j++) {
            double gradient = grad_output[i] * input[j];
            
            // Accumulate gradient (this will distribute to nearest vertices)
            geometric_matrix_accumulate_gradient_value(grad_W_q, i, j, gradient);
            geometric_matrix_accumulate_gradient_value(grad_W_k, i, j, gradient);
            geometric_matrix_accumulate_gradient_value(grad_W_v, i, j, gradient);
        }
    }
    
    fprintf(stderr, "DEBUG: worker_compute_gradients_double complete, returning 0\n");
    
    return 0;
}

/**
 * Compute gradients for FFN weights
 * 
 * @param thread Thread that owns the parameters
 * @param grad_output Gradient from next layer (size: embedding_dim)
 * @param input Input that was used in forward pass (size: embedding_dim)
 * @param hidden Hidden layer activations (size: hidden_dim)
 * @param embedding_dim Embedding dimension
 * @param hidden_dim Hidden dimension
 * @return 0 on success, -1 on error
 */
int worker_compute_ffn_gradients_double(
    HierarchicalThreadPool* pool,
    HierarchicalThread* thread,
    const double* grad_output,
    const double* input,
    const double* hidden,
    uint32_t embedding_dim,
    uint32_t hidden_dim
) {
    if (!thread || !grad_output || !input || !hidden) {
        fprintf(stderr, "ERROR: Invalid parameters for FFN gradient computation\n");
        return -1;
    }
    
    // Get gradient matrices
    GeometricMatrix* grad_W_ffn1 = thread_get_gradient_matrix_with_pool(pool, thread, "W_ffn1", 0);
    GeometricMatrix* grad_W_ffn2 = thread_get_gradient_matrix_with_pool(pool, thread, "W_ffn2", 0);
    
    if (!grad_W_ffn1 || !grad_W_ffn2) {
        fprintf(stderr, "ERROR: FFN gradient matrices not found\n");
        return -1;
    }
    
    // Compute gradient for W_ffn2: ∂L/∂W_ffn2 = grad_output × hidden^T
    for (uint32_t i = 0; i < embedding_dim; i++) {
        for (uint32_t j = 0; j < hidden_dim; j++) {
            double gradient = grad_output[i] * hidden[j];
            geometric_matrix_accumulate_gradient_value(grad_W_ffn2, j, i, gradient);
        }
    }
    
    // Compute gradient for hidden layer
    double* grad_hidden = (double*)calloc(hidden_dim, sizeof(double));
    if (!grad_hidden) {
        fprintf(stderr, "ERROR: Failed to allocate grad_hidden\n");
        return -1;
    }
    
    // Backpropagate through W_ffn2
    CrystallineAbacus* temp_weight = abacus_new(60);
    GeometricMatrix* W_ffn2 = thread_get_parameter_matrix(thread, "W_ffn2", 0);
    
    for (uint32_t j = 0; j < hidden_dim; j++) {
        double sum = 0.0;
        for (uint32_t i = 0; i < embedding_dim; i++) {
            if (geometric_matrix_get(W_ffn2, j, i, temp_weight) == 0) {
                double weight_val;
                abacus_to_double(temp_weight, &weight_val);
                sum += grad_output[i] * weight_val;
            }
        }
        // Apply ReLU derivative (gradient is 0 if hidden[j] <= 0)
        grad_hidden[j] = (hidden[j] > 0.0) ? sum : 0.0;
    }
    
    abacus_free(temp_weight);
    
    // Compute gradient for W_ffn1: ∂L/∂W_ffn1 = grad_hidden × input^T
    for (uint32_t i = 0; i < hidden_dim; i++) {
        for (uint32_t j = 0; j < embedding_dim; j++) {
            double gradient = grad_hidden[i] * input[j];
            geometric_matrix_accumulate_gradient_value(grad_W_ffn1, j, i, gradient);
        }
    }
    
    free(grad_hidden);
    return 0;
}