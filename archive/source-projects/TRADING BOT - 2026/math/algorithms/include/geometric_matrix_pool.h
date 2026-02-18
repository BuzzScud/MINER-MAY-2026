#ifndef GEOMETRIC_MATRIX_POOL_H
#define GEOMETRIC_MATRIX_POOL_H

/**
 * @file geometric_matrix_pool.h
 * @brief Shared Geometric Matrix Pool for Memory Efficiency
 * 
 * ARCHITECTURAL FIX: Instead of each thread creating its own geometric matrices,
 * all threads share matrices from a global pool. This reduces memory usage from
 * O(threads × matrices) to O(unique_matrices).
 * 
 * Example:
 * - Before: 96 threads × 8 matrices = 768 matrix instances
 * - After: 8 unique matrices shared by all threads
 * - Memory savings: 96× reduction
 */

#include <stdint.h>
#include <stdbool.h>
#include <pthread.h>
#include "geometric_matrix.h"

// Forward declarations
typedef struct GeometricMatrix GeometricMatrix;

/**
 * Matrix pool entry - tracks shared matrices
 */
typedef struct {
    char name[64];                  // Matrix name (e.g., "W_q_12x12")
    uint32_t rows;                  // Matrix dimensions
    uint32_t cols;
    PlatonicSolidType solid_type;   // Platonic solid type
    GeometricMatrix* matrix;        // The actual matrix
    uint32_t ref_count;             // Number of threads using this matrix
    pthread_mutex_t lock;           // Lock for ref counting
} MatrixPoolEntry;

/**
 * Global matrix pool
 */
typedef struct {
    MatrixPoolEntry* entries;       // Array of pool entries
    uint32_t num_entries;           // Current number of entries
    uint32_t max_entries;           // Maximum capacity
    pthread_mutex_t pool_lock;      // Lock for pool operations
} GeometricMatrixPool;

// ============================================================================
// POOL MANAGEMENT
// ============================================================================

/**
 * Create a new matrix pool
 * 
 * @param initial_capacity Initial capacity (default: 32)
 * @return Pointer to new pool, or NULL on error
 */
GeometricMatrixPool* geometric_matrix_pool_create(uint32_t initial_capacity);

/**
 * Free a matrix pool and all its matrices
 * 
 * @param pool Pool to free
 */
void geometric_matrix_pool_free(GeometricMatrixPool* pool);

// ============================================================================
// MATRIX ACQUISITION
// ============================================================================

/**
 * Get or create a matrix from the pool
 * 
 * If a matrix with the same name and dimensions exists, returns it.
 * Otherwise, creates a new matrix and adds it to the pool.
 * 
 * Thread-safe: Multiple threads can call this simultaneously.
 * 
 * @param pool Matrix pool
 * @param name Matrix name (e.g., "W_q")
 * @param rows Number of rows
 * @param cols Number of columns
 * @param solid_type Platonic solid type
 * @return Pointer to matrix (shared), or NULL on error
 */
GeometricMatrix* geometric_matrix_pool_get_or_create(
    GeometricMatrixPool* pool,
    const char* name,
    uint32_t rows,
    uint32_t cols,
    PlatonicSolidType solid_type
);

/**
 * Release a matrix back to the pool
 * 
 * Decrements reference count. When ref count reaches 0, the matrix
 * is freed from the pool.
 * 
 * @param pool Matrix pool
 * @param matrix Matrix to release
 */
void geometric_matrix_pool_release(
    GeometricMatrixPool* pool,
    GeometricMatrix* matrix
);

// ============================================================================
// POOL STATISTICS
// ============================================================================

/**
 * Get pool statistics
 * 
 * @param pool Matrix pool
 * @param num_matrices Output: number of unique matrices
 * @param total_refs Output: total reference count
 * @param memory_used Output: total memory used (bytes)
 */
void geometric_matrix_pool_get_stats(
    GeometricMatrixPool* pool,
    uint32_t* num_matrices,
    uint32_t* total_refs,
    size_t* memory_used
);

/**
 * Print pool statistics
 * 
 * @param pool Matrix pool
 */
void geometric_matrix_pool_print_stats(GeometricMatrixPool* pool);

#endif // GEOMETRIC_MATRIX_POOL_H