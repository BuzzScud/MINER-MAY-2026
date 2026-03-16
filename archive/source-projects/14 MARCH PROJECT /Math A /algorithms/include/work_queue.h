/**
 * @file work_queue.h
 * @brief Thread-safe work queue for adaptive threading
 * 
 * This implements a work queue system that allows N physical threads
 * to process work items from 96 logical threads.
 */

#ifndef WORK_QUEUE_H
#define WORK_QUEUE_H

#include <stdint.h>
#include <stdbool.h>
#include <pthread.h>

// Forward declarations
typedef struct HierarchicalThread HierarchicalThread;

// ============================================================================
// WORK ITEM TYPES
// ============================================================================

typedef enum {
    ADAPTIVE_WORK_TYPE_FORWARD,
    ADAPTIVE_WORK_TYPE_BACKWARD,
    ADAPTIVE_WORK_TYPE_INFERENCE,
    ADAPTIVE_WORK_TYPE_SHUTDOWN
} AdaptiveWorkType;

typedef struct AdaptiveWorkItem {
    AdaptiveWorkType type;
    HierarchicalThread* logical_thread;  // The logical thread to process
    uint32_t token_id;
    uint32_t target_id;  // For backward pass
    void* data;          // Additional data
    struct AdaptiveWorkItem* next;
} AdaptiveWorkItem;

// ============================================================================
// WORK QUEUE STRUCTURE
// ============================================================================

typedef struct AdaptiveWorkQueue {
    AdaptiveWorkItem* head;
    AdaptiveWorkItem* tail;
    uint32_t size;
    uint32_t capacity;
    
    pthread_mutex_t mutex;
    pthread_cond_t not_empty;
    pthread_cond_t not_full;
    
    bool shutdown;
    
    // Statistics
    uint64_t total_enqueued;
    uint64_t total_dequeued;
    uint64_t total_stolen;
} AdaptiveWorkQueue;

// ============================================================================
// WORK QUEUE OPERATIONS
// ============================================================================

/**
 * Create work queue
 * 
 * @param capacity Maximum queue capacity (0 = unlimited)
 * @return Allocated work queue, or NULL on error
 */
AdaptiveWorkQueue* adaptive_work_queue_create(uint32_t capacity);

/**
 * Free work queue
 * 
 * @param queue Queue to free
 */
void adaptive_work_queue_free(AdaptiveWorkQueue* queue);

/**
 * Push work item to queue
 * 
 * @param queue Queue to push to
 * @param item Work item to push
 * @return 0 on success, -1 on error
 */
int adaptive_work_queue_push(AdaptiveWorkQueue* queue, AdaptiveWorkItem* item);

/**
 * Pop work item from queue (blocking)
 * 
 * @param queue Queue to pop from
 * @return Work item, or NULL if queue is shutdown
 */
AdaptiveWorkItem* adaptive_work_queue_pop(AdaptiveWorkQueue* queue);

/**
 * Try to pop work item from queue (non-blocking)
 * 
 * @param queue Queue to pop from
 * @return Work item, or NULL if queue is empty
 */
AdaptiveWorkItem* adaptive_work_queue_try_pop(AdaptiveWorkQueue* queue);

/**
 * Get queue size
 * 
 * @param queue Queue to query
 * @return Current queue size
 */
uint32_t adaptive_work_queue_size(AdaptiveWorkQueue* queue);

/**
 * Check if queue is empty
 * 
 * @param queue Queue to check
 * @return true if empty, false otherwise
 */
bool adaptive_work_queue_is_empty(AdaptiveWorkQueue* queue);

/**
 * Shutdown queue
 * 
 * Signals all waiting threads to wake up and exit.
 * 
 * @param queue Queue to shutdown
 */
void adaptive_work_queue_shutdown(AdaptiveWorkQueue* queue);

/**
 * Create work item
 * 
 * @param type Work type
 * @param logical_thread Logical thread to process
 * @param token_id Token ID
 * @param target_id Target ID (for backward pass)
 * @return Allocated work item, or NULL on error
 */
AdaptiveWorkItem* adaptive_work_item_create(
    AdaptiveWorkType type,
    HierarchicalThread* logical_thread,
    uint32_t token_id,
    uint32_t target_id
);

/**
 * Free work item
 * 
 * @param item Work item to free
 */
void adaptive_work_item_free(AdaptiveWorkItem* item);

#endif // WORK_QUEUE_H