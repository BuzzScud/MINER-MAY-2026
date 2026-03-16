/**
 * @file worker_functions_geometric.h
 * @brief Worker functions using geometric matrix storage with double arrays
 * 
 * This header defines worker functions that use:
 * - Geometric matrices for parameter storage (memory efficient)
 * - Double arrays for activations and gradients (computationally efficient)
 */

#ifndef WORKER_FUNCTIONS_GEOMETRIC_H
#define WORKER_FUNCTIONS_GEOMETRIC_H

#include "hierarchical_threading.h"

#ifdef __cplusplus
extern "C" {
#endif

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
);

// ============================================================================
// ATTENTION OPERATIONS
// ============================================================================

/**
 * Compute attention using geometric matrix storage
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
);

// ============================================================================
// FFN OPERATIONS
// ============================================================================

/**
 * Compute FFN using geometric matrix storage
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
);

// ============================================================================
// GRADIENT OPERATIONS
// ============================================================================

/**
 * Compute and accumulate gradients for attention weights
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
);

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
);

#ifdef __cplusplus
}
#endif

#endif // WORKER_FUNCTIONS_GEOMETRIC_H