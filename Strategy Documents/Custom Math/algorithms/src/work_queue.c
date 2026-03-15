/**
 * @file work_queue.c
 * @brief Thread-safe work queue implementation for adaptive threading
 */

#include "work_queue.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// ============================================================================
// WORK QUEUE OPERATIONS
// ============================================================================

AdaptiveWorkQueue* adaptive_work_queue_create(uint32_t capacity) {
    AdaptiveWorkQueue* queue = (AdaptiveWorkQueue*)calloc(1, sizeof(AdaptiveWorkQueue));
    if (!queue) {
        return NULL;
    }
    
    queue->head = NULL;
    queue->tail = NULL;
    queue->size = 0;
    queue->capacity = capacity;
    queue->shutdown = false;
    
    pthread_mutex_init(&queue->mutex, NULL);
    pthread_cond_init(&queue->not_empty, NULL);
    pthread_cond_init(&queue->not_full, NULL);
    
    queue->total_enqueued = 0;
    queue->total_dequeued = 0;
    queue->total_stolen = 0;
    
    return queue;
}

void adaptive_work_queue_free(AdaptiveWorkQueue* queue) {
    if (!queue) {
        return;
    }
    
    // Free all remaining work items
    pthread_mutex_lock(&queue->mutex);
    AdaptiveWorkItem* item = queue->head;
    while (item) {
        AdaptiveWorkItem* next = item->next;
        adaptive_work_item_free(item);
        item = next;
    }
    pthread_mutex_unlock(&queue->mutex);
    
    pthread_mutex_destroy(&queue->mutex);
    pthread_cond_destroy(&queue->not_empty);
    pthread_cond_destroy(&queue->not_full);
    
    free(queue);
}

int adaptive_work_queue_push(AdaptiveWorkQueue* queue, AdaptiveWorkItem* item) {
    if (!queue || !item) {
        return -1;
    }
    
    pthread_mutex_lock(&queue->mutex);
    
    // Wait if queue is full
    while (queue->capacity > 0 && queue->size >= queue->capacity && !queue->shutdown) {
        pthread_cond_wait(&queue->not_full, &queue->mutex);
    }
    
    if (queue->shutdown) {
        pthread_mutex_unlock(&queue->mutex);
        return -1;
    }
    
    // Add to tail
    item->next = NULL;
    if (queue->tail) {
        queue->tail->next = item;
    } else {
        queue->head = item;
    }
    queue->tail = item;
    queue->size++;
    queue->total_enqueued++;
    
    // Signal waiting threads
    pthread_cond_signal(&queue->not_empty);
    pthread_mutex_unlock(&queue->mutex);
    
    return 0;
}

AdaptiveWorkItem* adaptive_work_queue_pop(AdaptiveWorkQueue* queue) {
    if (!queue) {
        return NULL;
    }
    
    pthread_mutex_lock(&queue->mutex);
    
    // Wait while queue is empty and not shutdown
    while (queue->size == 0 && !queue->shutdown) {
        pthread_cond_wait(&queue->not_empty, &queue->mutex);
    }
    
    // If shutdown and empty, return NULL
    if (queue->shutdown && queue->size == 0) {
        pthread_mutex_unlock(&queue->mutex);
        return NULL;
    }
    
    // Remove from head
    AdaptiveWorkItem* item = queue->head;
    if (item) {
        queue->head = item->next;
        if (!queue->head) {
            queue->tail = NULL;
        }
        queue->size--;
        queue->total_dequeued++;
        
        // Signal waiting pushers
        pthread_cond_signal(&queue->not_full);
    }
    
    pthread_mutex_unlock(&queue->mutex);
    
    return item;
}

AdaptiveWorkItem* adaptive_work_queue_try_pop(AdaptiveWorkQueue* queue) {
    if (!queue) {
        return NULL;
    }
    
    pthread_mutex_lock(&queue->mutex);
    
    // If empty or shutdown, return NULL immediately
    if (queue->size == 0 || queue->shutdown) {
        pthread_mutex_unlock(&queue->mutex);
        return NULL;
    }
    
    // Remove from head
    AdaptiveWorkItem* item = queue->head;
    if (item) {
        queue->head = item->next;
        if (!queue->head) {
            queue->tail = NULL;
        }
        queue->size--;
        queue->total_dequeued++;
        
        // Signal waiting pushers
        pthread_cond_signal(&queue->not_full);
    }
    
    pthread_mutex_unlock(&queue->mutex);
    
    return item;
}

uint32_t adaptive_work_queue_size(AdaptiveWorkQueue* queue) {
    if (!queue) {
        return 0;
    }
    
    pthread_mutex_lock(&queue->mutex);
    uint32_t size = queue->size;
    pthread_mutex_unlock(&queue->mutex);
    
    return size;
}

bool adaptive_work_queue_is_empty(AdaptiveWorkQueue* queue) {
    return adaptive_work_queue_size(queue) == 0;
}

void adaptive_work_queue_shutdown(AdaptiveWorkQueue* queue) {
    if (!queue) {
        return;
    }
    
    pthread_mutex_lock(&queue->mutex);
    queue->shutdown = true;
    
    // Wake up all waiting threads
    pthread_cond_broadcast(&queue->not_empty);
    pthread_cond_broadcast(&queue->not_full);
    
    pthread_mutex_unlock(&queue->mutex);
}

// ============================================================================
// WORK ITEM OPERATIONS
// ============================================================================

AdaptiveWorkItem* adaptive_work_item_create(
    AdaptiveWorkType type,
    HierarchicalThread* logical_thread,
    uint32_t token_id,
    uint32_t target_id
) {
    AdaptiveWorkItem* item = (AdaptiveWorkItem*)calloc(1, sizeof(AdaptiveWorkItem));
    if (!item) {
        return NULL;
    }
    
    item->type = type;
    item->logical_thread = logical_thread;
    item->token_id = token_id;
    item->target_id = target_id;
    item->data = NULL;
    item->next = NULL;
    
    return item;
}

void adaptive_work_item_free(AdaptiveWorkItem* item) {
    if (item) {
        free(item);
    }
}