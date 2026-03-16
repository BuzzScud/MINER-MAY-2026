/**
 * @file geometric_matrix_pool.c
 * @brief Shared Geometric Matrix Pool Implementation
 */

#include "geometric_matrix_pool.h"
#include "geometric_matrix.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// ============================================================================
// POOL MANAGEMENT
// ============================================================================

GeometricMatrixPool* geometric_matrix_pool_create(uint32_t initial_capacity) {
    if (initial_capacity == 0) {
        initial_capacity = 32;  // Default capacity
    }
    
    GeometricMatrixPool* pool = (GeometricMatrixPool*)calloc(1, sizeof(GeometricMatrixPool));
    if (!pool) {
        fprintf(stderr, "ERROR: Failed to allocate matrix pool\n");
        return NULL;
    }
    
    pool->entries = (MatrixPoolEntry*)calloc(initial_capacity, sizeof(MatrixPoolEntry));
    if (!pool->entries) {
        fprintf(stderr, "ERROR: Failed to allocate pool entries\n");
        free(pool);
        return NULL;
    }
    
    pool->num_entries = 0;
    pool->max_entries = initial_capacity;
    
    if (pthread_mutex_init(&pool->pool_lock, NULL) != 0) {
        fprintf(stderr, "ERROR: Failed to initialize pool lock\n");
        free(pool->entries);
        free(pool);
        return NULL;
    }
    
    printf("Created geometric matrix pool (capacity: %u)\n", initial_capacity);
    
    return pool;
}

void geometric_matrix_pool_free(GeometricMatrixPool* pool) {
    if (!pool) return;
    
    pthread_mutex_lock(&pool->pool_lock);
    
    // Free all matrices
    for (uint32_t i = 0; i < pool->num_entries; i++) {
        MatrixPoolEntry* entry = &pool->entries[i];
        
        if (entry->ref_count > 0) {
            fprintf(stderr, "WARNING: Freeing matrix '%s' with ref_count=%u\n",
                    entry->name, entry->ref_count);
        }
        
        if (entry->matrix) {
            geometric_matrix_free(entry->matrix);
        }
        
        pthread_mutex_destroy(&entry->lock);
    }
    
    free(pool->entries);
    pthread_mutex_unlock(&pool->pool_lock);
    pthread_mutex_destroy(&pool->pool_lock);
    
    free(pool);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find an existing matrix in the pool
 * 
 * @param pool Matrix pool
 * @param name Matrix name
 * @param rows Number of rows
 * @param cols Number of columns
 * @return Index of entry, or -1 if not found
 */
static int find_matrix_entry(
    GeometricMatrixPool* pool,
    const char* name,
    uint32_t rows,
    uint32_t cols
) {
    for (uint32_t i = 0; i < pool->num_entries; i++) {
        MatrixPoolEntry* entry = &pool->entries[i];
        
        if (strcmp(entry->name, name) == 0 &&
            entry->rows == rows &&
            entry->cols == cols) {
            return (int)i;
        }
    }
    
    return -1;
}

/**
 * Expand pool capacity
 * 
 * @param pool Matrix pool
 * @return 0 on success, -1 on error
 */
static int expand_pool(GeometricMatrixPool* pool) {
    uint32_t new_capacity = pool->max_entries * 2;
    
    MatrixPoolEntry* new_entries = (MatrixPoolEntry*)realloc(
        pool->entries,
        new_capacity * sizeof(MatrixPoolEntry)
    );
    
    if (!new_entries) {
        fprintf(stderr, "ERROR: Failed to expand pool capacity\n");
        return -1;
    }
    
    // Zero-initialize new entries
    memset(&new_entries[pool->max_entries], 0,
           (new_capacity - pool->max_entries) * sizeof(MatrixPoolEntry));
    
    pool->entries = new_entries;
    pool->max_entries = new_capacity;
    
    return 0;
}

// ============================================================================
// MATRIX ACQUISITION
// ============================================================================

GeometricMatrix* geometric_matrix_pool_get_or_create(
    GeometricMatrixPool* pool,
    const char* name,
    uint32_t rows,
    uint32_t cols,
    PlatonicSolidType solid_type
) {
    if (!pool || !name) {
        fprintf(stderr, "ERROR: Invalid parameters to pool_get_or_create\n");
        return NULL;
    }
    
    pthread_mutex_lock(&pool->pool_lock);
    
    // Check if matrix already exists
    int entry_idx = find_matrix_entry(pool, name, rows, cols);
    
    if (entry_idx >= 0) {
        // Matrix exists - increment ref count and return
        MatrixPoolEntry* entry = &pool->entries[entry_idx];
        
        pthread_mutex_lock(&entry->lock);
        entry->ref_count++;
        pthread_mutex_unlock(&entry->lock);
        
        pthread_mutex_unlock(&pool->pool_lock);
        
        printf("Reusing shared matrix '%s' [%u×%u] (ref_count=%u)\n",
               name, rows, cols, entry->ref_count);
        
        return entry->matrix;
    }
    
    // Matrix doesn't exist - create new one
    
    // Check if we need to expand pool
    if (pool->num_entries >= pool->max_entries) {
        if (expand_pool(pool) != 0) {
            pthread_mutex_unlock(&pool->pool_lock);
            return NULL;
        }
    }
    
    // Create new matrix
    GeometricMatrix* matrix = geometric_matrix_create_with_solid(
        rows, cols, solid_type, name
    );
    
    if (!matrix) {
        fprintf(stderr, "ERROR: Failed to create matrix '%s'\n", name);
        pthread_mutex_unlock(&pool->pool_lock);
        return NULL;
    }
    
    // Add to pool
    MatrixPoolEntry* entry = &pool->entries[pool->num_entries];
    strncpy(entry->name, name, sizeof(entry->name) - 1);
    entry->name[sizeof(entry->name) - 1] = '\0';
    entry->rows = rows;
    entry->cols = cols;
    entry->solid_type = solid_type;
    entry->matrix = matrix;
    entry->ref_count = 1;
    
    if (pthread_mutex_init(&entry->lock, NULL) != 0) {
        fprintf(stderr, "ERROR: Failed to initialize entry lock\n");
        geometric_matrix_free(matrix);
        pthread_mutex_unlock(&pool->pool_lock);
        return NULL;
    }
    
    pool->num_entries++;
    
    pthread_mutex_unlock(&pool->pool_lock);
    
    printf("Created new shared matrix '%s' [%u×%u] (pool size: %u)\n",
           name, rows, cols, pool->num_entries);
    
    return matrix;
}

void geometric_matrix_pool_release(
    GeometricMatrixPool* pool,
    GeometricMatrix* matrix
) {
    if (!pool || !matrix) return;
    
    pthread_mutex_lock(&pool->pool_lock);
    
    // Find the matrix in the pool
    for (uint32_t i = 0; i < pool->num_entries; i++) {
        MatrixPoolEntry* entry = &pool->entries[i];
        
        if (entry->matrix == matrix) {
            pthread_mutex_lock(&entry->lock);
            
            if (entry->ref_count > 0) {
                entry->ref_count--;
            }
            
            pthread_mutex_unlock(&entry->lock);
            pthread_mutex_unlock(&pool->pool_lock);
            return;
        }
    }
    
    pthread_mutex_unlock(&pool->pool_lock);
    
    fprintf(stderr, "WARNING: Attempted to release matrix not in pool\n");
}

// ============================================================================
// POOL STATISTICS
// ============================================================================

void geometric_matrix_pool_get_stats(
    GeometricMatrixPool* pool,
    uint32_t* num_matrices,
    uint32_t* total_refs,
    size_t* memory_used
) {
    if (!pool) return;
    
    pthread_mutex_lock(&pool->pool_lock);
    
    if (num_matrices) {
        *num_matrices = pool->num_entries;
    }
    
    if (total_refs) {
        uint32_t refs = 0;
        for (uint32_t i = 0; i < pool->num_entries; i++) {
            refs += pool->entries[i].ref_count;
        }
        *total_refs = refs;
    }
    
    if (memory_used) {
        // Approximate memory usage
        size_t mem = sizeof(GeometricMatrixPool);
        mem += pool->max_entries * sizeof(MatrixPoolEntry);
        mem += pool->num_entries * 1144;  // ~1144 bytes per matrix
        *memory_used = mem;
    }
    
    pthread_mutex_unlock(&pool->pool_lock);
}

void geometric_matrix_pool_print_stats(GeometricMatrixPool* pool) {
    if (!pool) return;
    
    uint32_t num_matrices = 0;
    uint32_t total_refs = 0;
    size_t memory_used = 0;
    
    geometric_matrix_pool_get_stats(pool, &num_matrices, &total_refs, &memory_used);
    
    printf("\n=== Geometric Matrix Pool Statistics ===\n");
    printf("  Unique matrices: %u\n", num_matrices);
    printf("  Total references: %u\n", total_refs);
    printf("  Memory used: %zu bytes (%.2f KB)\n", memory_used, memory_used / 1024.0);
    
    if (num_matrices > 0) {
        printf("  Memory savings: %.1f× (vs %u separate matrices)\n",
               (float)total_refs / num_matrices, total_refs);
    }
    
    printf("========================================\n\n");
}