/**
 * @file activation_pool.c
 * @brief Implementation of memory-efficient activation pooling
 */

#include "activation_pool.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// ============================================================================
// POOL MANAGEMENT
// ============================================================================

ActivationPool* activation_pool_create(
    uint32_t buffer_size,
    uint32_t initial_buffers,
    uint32_t max_buffers
) {
    if (buffer_size == 0 || initial_buffers == 0 || max_buffers < initial_buffers) {
        return NULL;
    }
    
    ActivationPool* pool = (ActivationPool*)calloc(1, sizeof(ActivationPool));
    if (!pool) return NULL;
    
    pool->buffer_size = buffer_size;
    pool->max_buffers = max_buffers;
    pool->num_buffers = 0;
    pool->num_free = 0;
    pool->free_list = NULL;
    
    pthread_mutex_init(&pool->mutex, NULL);
    
    // Allocate buffer array
    pool->buffers = (ActivationBuffer**)calloc(max_buffers, sizeof(ActivationBuffer*));
    if (!pool->buffers) {
        free(pool);
        return NULL;
    }
    
    // Pre-allocate initial buffers
    for (uint32_t i = 0; i < initial_buffers; i++) {
        ActivationBuffer* buffer = (ActivationBuffer*)calloc(1, sizeof(ActivationBuffer));
        if (!buffer) {
            activation_pool_free(pool);
            return NULL;
        }
        
        buffer->data = (double*)calloc(buffer_size, sizeof(double));
        if (!buffer->data) {
            free(buffer);
            activation_pool_free(pool);
            return NULL;
        }
        
        buffer->size = buffer_size;
        buffer->ref_count = 0;
        buffer->in_use = false;
        
        // Add to pool
        pool->buffers[pool->num_buffers++] = buffer;
        
        // Add to free list
        buffer->next = pool->free_list;
        pool->free_list = buffer;
        pool->num_free++;
    }
    
    return pool;
}

void activation_pool_free(ActivationPool* pool) {
    if (!pool) return;
    
    if (pool->buffers) {
        for (uint32_t i = 0; i < pool->num_buffers; i++) {
            if (pool->buffers[i]) {
                free(pool->buffers[i]->data);
                free(pool->buffers[i]);
            }
        }
        free(pool->buffers);
    }
    
    pthread_mutex_destroy(&pool->mutex);
    free(pool);
}

// ============================================================================
// BUFFER ALLOCATION
// ============================================================================

ActivationBuffer* activation_pool_acquire(ActivationPool* pool) {
    if (!pool) return NULL;
    
    pthread_mutex_lock(&pool->mutex);
    
    ActivationBuffer* buffer = NULL;
    
    // Try to get from free list
    if (pool->free_list) {
        buffer = pool->free_list;
        pool->free_list = buffer->next;
        pool->num_free--;
        pool->total_reuses++;
    }
    // Allocate new buffer if under limit
    else if (pool->num_buffers < pool->max_buffers) {
        buffer = (ActivationBuffer*)calloc(1, sizeof(ActivationBuffer));
        if (buffer) {
            buffer->data = (double*)calloc(pool->buffer_size, sizeof(double));
            if (!buffer->data) {
                free(buffer);
                buffer = NULL;
            } else {
                buffer->size = pool->buffer_size;
                pool->buffers[pool->num_buffers++] = buffer;
            }
        }
    }
    
    if (buffer) {
        buffer->in_use = true;
        buffer->ref_count = 1;
        buffer->next = NULL;
        
        pool->total_allocations++;
        
        // Update peak usage
        uint32_t current_usage = pool->num_buffers - pool->num_free;
        if (current_usage > pool->peak_usage) {
            pool->peak_usage = current_usage;
        }
    }
    
    pthread_mutex_unlock(&pool->mutex);
    
    return buffer;
}

void activation_pool_release(ActivationPool* pool, ActivationBuffer* buffer) {
    if (!pool || !buffer) return;
    
    pthread_mutex_lock(&pool->mutex);
    
    if (buffer->in_use && buffer->ref_count == 0) {
        buffer->in_use = false;
        
        // Clear buffer data (optional, for security)
        // memset(buffer->data, 0, buffer->size * sizeof(double));
        
        // Add to free list
        buffer->next = pool->free_list;
        pool->free_list = buffer;
        pool->num_free++;
    }
    
    pthread_mutex_unlock(&pool->mutex);
}

void activation_buffer_ref(ActivationBuffer* buffer) {
    if (!buffer) return;
    __sync_fetch_and_add(&buffer->ref_count, 1);
}

void activation_buffer_unref(ActivationPool* pool, ActivationBuffer* buffer) {
    if (!buffer) return;
    
    uint32_t old_count = __sync_fetch_and_sub(&buffer->ref_count, 1);
    
    if (old_count == 1) {
        // Last reference, release buffer
        activation_pool_release(pool, buffer);
    }
}

// ============================================================================
// POOL STATISTICS
// ============================================================================

void activation_pool_get_stats(
    const ActivationPool* pool,
    uint32_t* num_in_use,
    uint32_t* num_free,
    uint64_t* total_allocations,
    uint64_t* total_reuses,
    uint64_t* peak_usage
) {
    if (!pool) return;
    
    if (num_in_use) *num_in_use = pool->num_buffers - pool->num_free;
    if (num_free) *num_free = pool->num_free;
    if (total_allocations) *total_allocations = pool->total_allocations;
    if (total_reuses) *total_reuses = pool->total_reuses;
    if (peak_usage) *peak_usage = pool->peak_usage;
}

void activation_pool_print_stats(const ActivationPool* pool) {
    if (!pool) return;
    
    uint32_t num_in_use, num_free;
    uint64_t total_allocations, total_reuses, peak_usage;
    
    activation_pool_get_stats(pool, &num_in_use, &num_free, 
                             &total_allocations, &total_reuses, &peak_usage);
    
    printf("Activation Pool Statistics:\n");
    printf("  Buffer size: %u doubles (%.2f KB)\n", 
           pool->buffer_size, (pool->buffer_size * sizeof(double)) / 1024.0);
    printf("  Total buffers: %u / %u\n", pool->num_buffers, pool->max_buffers);
    printf("  In use: %u\n", num_in_use);
    printf("  Free: %u\n", num_free);
    printf("  Total allocations: %lu\n", total_allocations);
    printf("  Total reuses: %lu\n", total_reuses);
    printf("  Peak usage: %lu buffers\n", peak_usage);
    printf("  Memory usage: %.2f MB\n", 
           (pool->num_buffers * pool->buffer_size * sizeof(double)) / (1024.0 * 1024.0));
}

void activation_pool_reset_stats(ActivationPool* pool) {
    if (!pool) return;
    
    pthread_mutex_lock(&pool->mutex);
    pool->total_allocations = 0;
    pool->total_reuses = 0;
    pool->peak_usage = 0;
    pthread_mutex_unlock(&pool->mutex);
}