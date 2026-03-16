/**
 * @file activation_pool.h
 * @brief Memory-efficient activation pooling for training
 * 
 * This module implements activation pooling to reduce memory usage during training.
 * Instead of allocating separate buffers for each operation, we reuse a pool of buffers.
 * 
 * Memory Reduction:
 * - Without pooling: ~7.2 GB (separate buffers per token/layer)
 * - With pooling: ~100 MB (reused buffers)
 * 
 * Strategy:
 * - Maintain a pool of reusable activation buffers
 * - Allocate buffers on-demand from the pool
 * - Return buffers to pool when done
 * - Use reference counting to prevent premature reuse
 */

#ifndef ACTIVATION_POOL_H
#define ACTIVATION_POOL_H

#include <stdint.h>
#include <stdbool.h>
#include <pthread.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// ACTIVATION BUFFER
// ============================================================================

/**
 * @brief A single activation buffer in the pool
 */
typedef struct ActivationBuffer {
    double* data;                   // Buffer data
    uint32_t size;                  // Buffer size (number of doubles)
    uint32_t ref_count;             // Reference count
    bool in_use;                    // Whether buffer is currently in use
    struct ActivationBuffer* next;  // Next buffer in free list
} ActivationBuffer;

// ============================================================================
// ACTIVATION POOL
// ============================================================================

/**
 * @brief Pool of reusable activation buffers
 */
typedef struct ActivationPool {
    ActivationBuffer** buffers;     // Array of all buffers
    uint32_t num_buffers;           // Total number of buffers
    uint32_t max_buffers;           // Maximum buffers allowed
    
    ActivationBuffer* free_list;    // Linked list of free buffers
    uint32_t num_free;              // Number of free buffers
    
    uint32_t buffer_size;           // Size of each buffer (doubles)
    
    pthread_mutex_t mutex;          // Thread safety
    
    // Statistics
    uint64_t total_allocations;     // Total allocations
    uint64_t total_reuses;          // Total buffer reuses
    uint64_t peak_usage;            // Peak simultaneous buffers in use
} ActivationPool;

// ============================================================================
// POOL MANAGEMENT
// ============================================================================

/**
 * @brief Create activation pool
 * 
 * @param buffer_size Size of each buffer (number of doubles)
 * @param initial_buffers Initial number of buffers to allocate
 * @param max_buffers Maximum number of buffers allowed
 * @return Pointer to pool, or NULL on error
 */
ActivationPool* activation_pool_create(
    uint32_t buffer_size,
    uint32_t initial_buffers,
    uint32_t max_buffers
);

/**
 * @brief Free activation pool
 * 
 * @param pool Pool to free
 */
void activation_pool_free(ActivationPool* pool);

// ============================================================================
// BUFFER ALLOCATION
// ============================================================================

/**
 * @brief Acquire buffer from pool
 * 
 * Gets a buffer from the pool. If no free buffers are available and
 * we haven't reached max_buffers, allocates a new buffer.
 * 
 * @param pool Pool to acquire from
 * @return Pointer to buffer, or NULL if pool is exhausted
 */
ActivationBuffer* activation_pool_acquire(ActivationPool* pool);

/**
 * @brief Release buffer back to pool
 * 
 * Returns a buffer to the pool for reuse. The buffer is not freed,
 * just marked as available.
 * 
 * @param pool Pool to release to
 * @param buffer Buffer to release
 */
void activation_pool_release(ActivationPool* pool, ActivationBuffer* buffer);

/**
 * @brief Increment buffer reference count
 * 
 * Use this when multiple operations need to keep a buffer alive.
 * 
 * @param buffer Buffer to reference
 */
void activation_buffer_ref(ActivationBuffer* buffer);

/**
 * @brief Decrement buffer reference count
 * 
 * When ref_count reaches 0, buffer is automatically released.
 * 
 * @param pool Pool that owns the buffer
 * @param buffer Buffer to unreference
 */
void activation_buffer_unref(ActivationPool* pool, ActivationBuffer* buffer);

// ============================================================================
// POOL STATISTICS
// ============================================================================

/**
 * @brief Get pool statistics
 * 
 * @param pool Pool to query
 * @param num_in_use Output: number of buffers currently in use
 * @param num_free Output: number of free buffers
 * @param total_allocations Output: total allocations
 * @param total_reuses Output: total reuses
 * @param peak_usage Output: peak simultaneous usage
 */
void activation_pool_get_stats(
    const ActivationPool* pool,
    uint32_t* num_in_use,
    uint32_t* num_free,
    uint64_t* total_allocations,
    uint64_t* total_reuses,
    uint64_t* peak_usage
);

/**
 * @brief Print pool statistics
 * 
 * @param pool Pool to print stats for
 */
void activation_pool_print_stats(const ActivationPool* pool);

/**
 * @brief Reset pool statistics
 * 
 * @param pool Pool to reset
 */
void activation_pool_reset_stats(ActivationPool* pool);

#ifdef __cplusplus
}
#endif

#endif // ACTIVATION_POOL_H