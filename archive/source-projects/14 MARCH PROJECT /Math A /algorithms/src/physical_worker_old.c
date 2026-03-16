/**
 * @file physical_worker.c
 * @brief Physical worker thread implementation for adaptive threading
 * 
 * This implements the physical worker threads that process work items
 * from logical threads. This allows N physical threads to handle 96
 * logical threads, enabling the system to run on 2-16 core systems.
 */

#include "hierarchical_threading.h"
#include "work_queue.h"
#include "worker_functions_geometric.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// Forward declarations
int worker_process_forward(HierarchicalThread* thread, AdaptiveWorkItem* work);
int worker_process_backward(HierarchicalThread* thread, AdaptiveWorkItem* work);

// ============================================================================
// PHYSICAL WORKER THREAD FUNCTION
// ============================================================================

/**
 * Physical worker thread main loop
 * 
 * This is the main loop for physical worker threads. Each physical thread:
 * 1. Pulls work items from the shared work queue
 * 2. Processes the work item using the logical thread's data
 * 3. Repeats until shutdown signal
 * 
 * @param arg PhysicalWorker pointer
 * @return NULL
 */
void* physical_worker_thread(void* arg) {
    PhysicalWorker* worker = (PhysicalWorker*)arg;
    
    if (!worker) {
        fprintf(stderr, "ERROR: Physical worker is NULL\n");
        return NULL;
    }
    
    printf("Physical worker %u started\n", worker->worker_id);
    
    uint64_t start_time = 0; // TODO: get_time_ns();
    worker->running = true;
    
    // Main worker loop
    while (!worker->should_stop) {
        // Pull work item from queue (blocking)
        AdaptiveWorkItem* work = adaptive_work_queue_pop(worker->work_queue);
        
        // If NULL, queue is shutdown
        if (!work) {
            break;
        }
        
        // Check for shutdown signal
        if (work->type == ADAPTIVE_WORK_TYPE_SHUTDOWN) {
            adaptive_work_item_free(work);
            break;
        }
        
        // Process work item
        HierarchicalThread* logical_thread = work->logical_thread;
        if (!logical_thread) {
            fprintf(stderr, "ERROR: Work item has NULL logical thread\n");
            adaptive_work_item_free(work);
            continue;
        }
        
        int result = 0;
        
        switch (work->type) {
            case ADAPTIVE_WORK_TYPE_FORWARD:
                result = worker_process_forward(logical_thread, work);
                break;
                
            case ADAPTIVE_WORK_TYPE_BACKWARD:
                result = worker_process_backward(logical_thread, work);
                break;
                
            case ADAPTIVE_WORK_TYPE_INFERENCE:
                result = worker_process_forward(logical_thread, work);
                break;
                
            default:
                fprintf(stderr, "WARNING: Unknown work type %d\n", work->type);
                result = -1;
                break;
        }
        
        // Update statistics
        if (result == 0) {
            __atomic_add_fetch(&worker->work_items_processed, 1, __ATOMIC_SEQ_CST);
        }
        
        // Free work item
        adaptive_work_item_free(work);
    }
    
    worker->running = false;
    worker->total_runtime = 0; // TODO: get_time_ns() - start_time;
    
    printf("Physical worker %u stopped (processed %lu items)\n", 
           worker->worker_id, worker->work_items_processed);
    
    return NULL;
}

// ============================================================================
// PHYSICAL WORKER MANAGEMENT
// ============================================================================

/**
 * Create physical worker
 * 
 * @param worker_id Worker ID
 * @param pool Parent thread pool
 * @param work_queue Shared work queue
 * @return Allocated physical worker, or NULL on error
 */
PhysicalWorker* physical_worker_create(
    uint32_t worker_id,
    HierarchicalThreadPool* pool,
    AdaptiveWorkQueue* work_queue
) {
    PhysicalWorker* worker = (PhysicalWorker*)calloc(1, sizeof(PhysicalWorker));
    if (!worker) {
        return NULL;
    }
    
    worker->worker_id = worker_id;
    worker->pool = pool;
    worker->work_queue = work_queue;
    worker->running = false;
    worker->should_stop = false;
    worker->work_items_processed = 0;
    worker->total_runtime = 0;
    
    return worker;
}

/**
 * Start physical worker
 * 
 * @param worker Worker to start
 * @return 0 on success, -1 on error
 */
int physical_worker_start(PhysicalWorker* worker) {
    if (!worker) {
        return -1;
    }
    
    int result = pthread_create(&worker->pthread, NULL, physical_worker_thread, worker);
    if (result != 0) {
        fprintf(stderr, "ERROR: Failed to create physical worker thread %u\n", 
                worker->worker_id);
        return -1;
    }
    
    return 0;
}

/**
 * Stop physical worker
 * 
 * @param worker Worker to stop
 * @return 0 on success, -1 on error
 */
int physical_worker_stop(PhysicalWorker* worker) {
    if (!worker) {
        return -1;
    }
    
    worker->should_stop = true;
    
    return 0;
}

/**
 * Wait for physical worker to finish
 * 
 * @param worker Worker to wait for
 * @return 0 on success, -1 on error
 */
int physical_worker_join(PhysicalWorker* worker) {
    if (!worker) {
        return -1;
    }
    
    int result = pthread_join(worker->pthread, NULL);
    if (result != 0) {
        fprintf(stderr, "ERROR: Failed to join physical worker thread %u\n", 
                worker->worker_id);
        return -1;
    }
    
    return 0;
}

/**
 * Free physical worker
 * 
 * @param worker Worker to free
 */
void physical_worker_free(PhysicalWorker* worker) {
    if (worker) {
        free(worker);
    }
}

// ============================================================================
// WORK PROCESSING FUNCTIONS
// ============================================================================

/**
 * Process forward pass work item
 * 
 * @param thread Logical thread to process
 * @param work Work item
 * @return 0 on success, -1 on error
 */
int worker_process_forward(HierarchicalThread* thread, AdaptiveWorkItem* work) {
    if (!thread || !work) {
        return -1;
    }
    
    // Extract work item data
    uint32_t token_id = work->token_id;
    
    // For now, use fixed dimensions (these should come from model config)
    // TODO: Get dimensions from model configuration
    uint32_t embedding_dim = 64;  // TODO: Get from model config
    uint32_t hidden_dim = 128;    // TODO: Get from model config
    uint32_t num_layers = 2;      // TODO: Get from model config
    
    // Allocate activation buffers
    double* embedding = (double*)malloc(embedding_dim * sizeof(double));
    double* layer_input = (double*)malloc(embedding_dim * sizeof(double));
    double* layer_output = (double*)malloc(embedding_dim * sizeof(double));
    double* attention_output = (double*)malloc(embedding_dim * sizeof(double));
    double* ffn_output = (double*)malloc(embedding_dim * sizeof(double));
    
    if (!embedding || !layer_input || !layer_output || !attention_output || !ffn_output) {
        fprintf(stderr, "ERROR: Failed to allocate activation buffers\n");
        free(embedding);
        free(layer_input);
        free(layer_output);
        free(attention_output);
        free(ffn_output);
        return -1;
    }
    
    int result = 0;
    
    // 1. Get embedding for this token
    result = worker_get_embedding_double(thread, token_id, embedding, embedding_dim);
    if (result != 0) {
        fprintf(stderr, "ERROR: Failed to get embedding for token %u\n", token_id);
        goto cleanup;
    }
    
    // Copy embedding to layer input
    memcpy(layer_input, embedding, embedding_dim * sizeof(double));
    
    // 2. Process through transformer layers
    for (uint32_t layer = 0; layer < num_layers; layer++) {
        // Get thread for this layer (for now, use same thread)
        // TODO: Get proper layer thread from pool
        HierarchicalThread* layer_thread = thread;
        
        // Attention
        result = worker_compute_attention_double(
            layer_thread, layer_input, embedding_dim, attention_output
        );
        if (result != 0) {
            fprintf(stderr, "ERROR: Failed to compute attention for layer %u\n", layer);
            goto cleanup;
        }
        
        // Add residual connection
        for (uint32_t i = 0; i < embedding_dim; i++) {
            attention_output[i] += layer_input[i];
        }
        
        // Layer norm (for now, just copy - TODO: implement proper layer norm)
        memcpy(layer_output, attention_output, embedding_dim * sizeof(double));
        
        // FFN
        result = worker_compute_ffn_double(
            layer_thread, layer_output, embedding_dim, hidden_dim, ffn_output
        );
        if (result != 0) {
            fprintf(stderr, "ERROR: Failed to compute FFN for layer %u\n", layer);
            goto cleanup;
        }
        
        // Add residual connection
        for (uint32_t i = 0; i < embedding_dim; i++) {
            ffn_output[i] += layer_output[i];
        }
        
        // Layer norm (for now, just copy - TODO: implement proper layer norm)
        memcpy(layer_input, ffn_output, embedding_dim * sizeof(double));
    }
    
    // 3. Store final output for backward pass (TODO: implement activation storage)
    // For now, we'll skip this and just mark as processed
    
    // 4. Compute loss if target provided (TODO: implement loss computation)
    if (work->target_id != UINT32_MAX) {
        // TODO: Compute cross-entropy loss
        // For now, skip
    }
    
cleanup:
    free(embedding);
    free(layer_input);
    free(layer_output);
    free(attention_output);
    free(ffn_output);
    
    return result;
}

/**
 * Process backward pass work item
 * 
 * @param thread Logical thread to process
 * @param work Work item
 * @return 0 on success, -1 on error
 */
int worker_process_backward(HierarchicalThread* thread, AdaptiveWorkItem* work) {
    if (!thread || !work) {
        return -1;
    }
    
    // Extract work item data
    uint32_t token_id = work->token_id;
    uint32_t target_id = work->target_id;
    
    // Suppress unused variable warnings
    (void)token_id;
    (void)target_id;
    
    // For now, use fixed dimensions (these should come from model config)
    // TODO: Get dimensions from model configuration
    uint32_t embedding_dim = 64;  // TODO: Get from model config
    uint32_t num_layers = 2;      // TODO: Get from model config
    
    // Allocate gradient buffers
    double* grad_output = (double*)malloc(embedding_dim * sizeof(double));
    double* grad_input = (double*)malloc(embedding_dim * sizeof(double));
    
    if (!grad_output || !grad_input) {
        fprintf(stderr, "ERROR: Failed to allocate gradient buffers\n");
        free(grad_output);
        free(grad_input);
        return -1;
    }
    
    int result = 0;
    
    // 1. Compute initial gradient from loss (TODO: implement proper loss gradient)
    // For now, use dummy gradient
    for (uint32_t i = 0; i < embedding_dim; i++) {
        grad_output[i] = 0.01;  // Dummy gradient
    }
    
    // 2. Backpropagate through layers (reverse order)
    for (int layer = num_layers - 1; layer >= 0; layer--) {
        // Get thread for this layer (for now, use same thread)
        // TODO: Get proper layer thread from pool
        HierarchicalThread* layer_thread = thread;
        
        // Compute gradients for this layer
        result = worker_compute_gradients_double(
            layer_thread, grad_output, NULL, embedding_dim
        );
        
        if (result != 0) {
            fprintf(stderr, "ERROR: Failed to compute gradients for layer %d\n", layer);
            free(grad_output);
            free(grad_input);
            return -1;
        }
        
        // Get gradient for previous layer (TODO: implement proper gradient propagation)
        // For now, just copy the gradient
        memcpy(grad_input, grad_output, embedding_dim * sizeof(double));
        
        // Copy for next iteration
        memcpy(grad_output, grad_input, embedding_dim * sizeof(double));
    }
    
    // 3. Gradients are accumulated in worker_compute_gradients_double()
    // Optimizer will use these gradients to update parameters
    
    free(grad_output);
    free(grad_input);
    
    return 0;
}