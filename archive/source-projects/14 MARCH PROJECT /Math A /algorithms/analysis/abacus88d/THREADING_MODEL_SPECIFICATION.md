# Abacus88D Threading Model Specification

## Overview

This document specifies how threading should be integrated into Abacus88D to make it THE complete solution, not just an abstraction layer.

## Core Principle

**Threads are positioned geometrically at icosahedron vertices, and work is distributed based on geometric proximity in 88D space.**

## Thread Architecture

### Thread Positions

```
Control Thread (Thread 0):
- Position: Center of icosahedron (0, 0, 0)
- Role: Coordinates work, manages shared state
- Does NOT perform computation
- Broadcasts shared values (x coordinates)

Worker Threads (Threads 1-12):
- Positions: 12 vertices of icosahedron
- Coordinates: (from ICOSAHEDRON_VERTICES)
  Thread 1:  (0, 1, φ)
  Thread 2:  (0, 1, -φ)
  Thread 3:  (0, -1, φ)
  Thread 4:  (0, -1, -φ)
  Thread 5:  (1, φ, 0)
  Thread 6:  (1, -φ, 0)
  Thread 7:  (-1, φ, 0)
  Thread 8:  (-1, -φ, 0)
  Thread 9:  (φ, 0, 1)
  Thread 10: (φ, 0, -1)
  Thread 11: (-φ, 0, 1)
  Thread 12: (-φ, 0, -1)
- Role: Perform computation on assigned dimensions
- Each has 5 neighbors (kissing number)
```

### Dimension Assignment Strategy

**Strategy: Geometric Proximity Mapping**

Each worker thread is assigned dimensions based on geometric proximity:

```c
// Map dimension to nearest thread
uint8_t dimension_to_thread(uint8_t dimension) {
    // Dimension 0-10 maps to clock positions 1-11
    uint8_t position = dimension + 1;
    
    // Map clock position to icosahedron vertex
    // Using 12-fold symmetry
    return (position % 12) + 1;  // Threads 1-12
}

// Example:
// Dimension 0 (position 1) → Thread 1
// Dimension 1 (position 2) → Thread 2
// ...
// Dimension 10 (position 11) → Thread 11
// Dimension 11 (position 0) → Thread 12 (wraps)
```

**Result**: Each thread owns ~7-8 dimensions across all layers:
```
Thread 1:  Dims 0, 11, 22, 33, 44, 55, 66, 77
Thread 2:  Dims 1, 12, 23, 34, 45, 56, 67, 78
Thread 3:  Dims 2, 13, 24, 35, 46, 57, 68, 79
Thread 4:  Dims 3, 14, 25, 36, 47, 58, 69, 80
Thread 5:  Dims 4, 15, 26, 37, 48, 59, 70, 81
Thread 6:  Dims 5, 16, 27, 38, 49, 60, 71, 82
Thread 7:  Dims 6, 17, 28, 39, 50, 61, 72, 83
Thread 8:  Dims 7, 18, 29, 40, 51, 62, 73, 84
Thread 9:  Dims 8, 19, 30, 41, 52, 63, 74, 85
Thread 10: Dims 9, 20, 31, 42, 53, 64, 75, 86
Thread 11: Dims 10, 21, 32, 43, 54, 65, 76, 87
Thread 12: Wraps around (handles overflow)
```

## Work Distribution

### Work Queue Structure

```c
typedef struct {
    // Work items for this thread
    WorkItem* items;
    size_t num_items;
    size_t capacity;
    
    // Lock for queue access
    pthread_mutex_t lock;
    
    // Condition variable for work availability
    pthread_cond_t work_available;
    
    // Thread state
    bool active;
    bool has_work;
    
} ThreadWorkQueue;
```

### Work Item Structure

```c
typedef struct {
    // What to compute
    WorkType type;  // ADD, MULTIPLY, GRADIENT, etc.
    
    // Where to compute (88D coordinates)
    uint8_t layer;
    uint8_t dimension;
    
    // Input data
    void* input_data;
    size_t input_size;
    
    // Output location
    void* output_data;
    
    // Priority (for scheduling)
    uint32_t priority;
    
    // Dependencies (for ordering)
    WorkItem** dependencies;
    size_t num_dependencies;
    
} WorkItem;
```

### Work Distribution Algorithm

```c
// Control thread distributes work
void distribute_work(Abacus88DThreaded* system, WorkBatch* batch) {
    for (size_t i = 0; i < batch->num_items; i++) {
        WorkItem* item = &batch->items[i];
        
        // Determine which thread should handle this
        uint8_t thread_id = dimension_to_thread(item->dimension);
        
        // Add to that thread's queue
        pthread_mutex_lock(&system->threads[thread_id].queue.lock);
        add_work_item(&system->threads[thread_id].queue, item);
        pthread_cond_signal(&system->threads[thread_id].queue.work_available);
        pthread_mutex_unlock(&system->threads[thread_id].queue.lock);
    }
}
```

### Work Stealing (Geometric)

When a thread runs out of work, it steals from geometric neighbors:

```c
WorkItem* steal_work(Abacus88DThreaded* system, uint8_t thread_id) {
    // Get this thread's neighbors (5 neighbors on icosahedron)
    uint8_t neighbors[5];
    get_icosahedron_neighbors(thread_id, neighbors);
    
    // Try to steal from each neighbor
    for (int i = 0; i < 5; i++) {
        uint8_t neighbor_id = neighbors[i];
        
        pthread_mutex_lock(&system->threads[neighbor_id].queue.lock);
        
        if (system->threads[neighbor_id].queue.num_items > 1) {
            // Steal half the work
            WorkItem* stolen = steal_half(&system->threads[neighbor_id].queue);
            pthread_mutex_unlock(&system->threads[neighbor_id].queue.lock);
            return stolen;
        }
        
        pthread_mutex_unlock(&system->threads[neighbor_id].queue.lock);
    }
    
    return NULL;  // No work available
}
```

## Memory Model

### Private Memory (Per Thread)

Each thread has private memory for:
- Local work queue
- Temporary computation buffers
- Thread-local cache

```c
typedef struct {
    // Thread ID and position
    uint8_t thread_id;
    GeometricVertex position;  // Icosahedron vertex
    
    // Private work queue
    ThreadWorkQueue queue;
    
    // Private computation space
    CrystallineAbacus* temp_values[16];  // Temporary storage
    
    // Thread-local cache
    Cache local_cache;
    
    // Thread handle
    pthread_t pthread;
    
} GeometricThread;
```

### Shared Memory (Geometric Boundaries)

Threads share memory at geometric boundaries (shared vertices of Platonic solids):

```c
typedef struct {
    // Which threads share this boundary
    uint8_t thread1;
    uint8_t thread2;
    
    // Which dimensions are connected
    uint8_t dimensions[ABACUS88D_DIMS_PER_LAYER];
    size_t num_dimensions;
    
    // Shared values
    CrystallineAbacus* shared_values[ABACUS88D_DIMS_PER_LAYER];
    
    // Synchronization
    pthread_mutex_t lock;
    pthread_cond_t updated;
    
    // State
    bool dirty;  // Needs synchronization
    
} SharedBoundary;
```

### Synchronization Strategy

**Lazy Synchronization**: Only synchronize when needed

```c
// Thread writes to its dimensions
void thread_write(GeometricThread* thread, uint8_t dim, CrystallineAbacus* value) {
    // Write to private memory
    abacus_copy_to(thread->space->layers[layer].dimensions[dim], value);
    
    // Mark boundaries as dirty
    for (size_t i = 0; i < thread->num_boundaries; i++) {
        if (boundary_contains_dimension(thread->boundaries[i], dim)) {
            thread->boundaries[i]->dirty = true;
        }
    }
}

// Thread reads from dimension (may need sync)
void thread_read(GeometricThread* thread, uint8_t dim, CrystallineAbacus* result) {
    // Check if dimension is on a boundary
    SharedBoundary* boundary = find_boundary_for_dimension(thread, dim);
    
    if (boundary && boundary->dirty) {
        // Synchronize with neighbor
        pthread_mutex_lock(&boundary->lock);
        synchronize_boundary(boundary);
        boundary->dirty = false;
        pthread_mutex_unlock(&boundary->lock);
    }
    
    // Read from private memory
    abacus_copy_to(result, thread->space->layers[layer].dimensions[dim]);
}
```

## Thread Lifecycle

### Initialization

```c
Abacus88DThreaded* abacus88d_create_threaded(uint32_t base, uint8_t num_threads) {
    Abacus88DThreaded* system = calloc(1, sizeof(Abacus88DThreaded));
    
    // Create 88D computational space
    system->space = abacus88d_create(base);
    
    // Create control thread
    system->control = create_control_thread(system);
    
    // Create worker threads at icosahedron vertices
    for (int i = 1; i <= 12; i++) {
        system->workers[i-1] = create_worker_thread(system, i);
    }
    
    // Identify geometric boundaries
    system->boundaries = find_all_boundaries(system);
    
    // Start all threads
    start_all_threads(system);
    
    return system;
}
```

### Worker Thread Main Loop

```c
void* worker_thread_main(void* arg) {
    GeometricThread* thread = (GeometricThread*)arg;
    
    while (thread->active) {
        // Get work from queue
        WorkItem* work = get_work_item(&thread->queue);
        
        if (!work) {
            // Try to steal work from neighbors
            work = steal_work(thread->system, thread->thread_id);
        }
        
        if (work) {
            // Execute work
            execute_work_item(thread, work);
            
            // Mark complete
            complete_work_item(work);
        } else {
            // No work available, wait
            pthread_mutex_lock(&thread->queue.lock);
            pthread_cond_wait(&thread->queue.work_available, &thread->queue.lock);
            pthread_mutex_unlock(&thread->queue.lock);
        }
    }
    
    return NULL;
}
```

### Control Thread Main Loop

```c
void* control_thread_main(void* arg) {
    Abacus88DThreaded* system = (Abacus88DThreaded*)arg;
    
    while (system->active) {
        // Wait for work batch from user
        WorkBatch* batch = wait_for_work_batch(system);
        
        if (batch) {
            // Distribute work to worker threads
            distribute_work(system, batch);
            
            // Wait for completion
            wait_for_completion(system, batch);
            
            // Notify user
            signal_batch_complete(system, batch);
        }
    }
    
    return NULL;
}
```

## CLLM Integration

### Forward Pass

```c
void cllm_forward_pass_88d(Abacus88DThreaded* system, 
                           CrystallineAbacus* input,
                           CrystallineAbacus* output) {
    // Create work batch for forward pass
    WorkBatch* batch = create_work_batch(WORK_FORWARD_PASS);
    
    // Add work items for each layer
    for (int layer = 0; layer < ABACUS88D_NUM_LAYERS; layer++) {
        for (int dim = 0; dim < ABACUS88D_DIMS_PER_LAYER; dim++) {
            WorkItem* item = create_work_item(WORK_FORWARD_PASS);
            item->layer = layer;
            item->dimension = dim;
            item->input_data = input;
            item->output_data = output;
            add_to_batch(batch, item);
        }
    }
    
    // Submit batch to control thread
    submit_work_batch(system, batch);
    
    // Wait for completion
    wait_for_batch_completion(system, batch);
    
    // Cleanup
    free_work_batch(batch);
}
```

### Backward Pass (Gradient Computation)

```c
void cllm_backward_pass_88d(Abacus88DThreaded* system,
                            CrystallineAbacus* grad_output,
                            CrystallineAbacus* grad_input) {
    // Create work batch for backward pass
    WorkBatch* batch = create_work_batch(WORK_BACKWARD_PASS);
    
    // Add work items for each layer (reverse order)
    for (int layer = ABACUS88D_NUM_LAYERS - 1; layer >= 0; layer--) {
        for (int dim = 0; dim < ABACUS88D_DIMS_PER_LAYER; dim++) {
            WorkItem* item = create_work_item(WORK_BACKWARD_PASS);
            item->layer = layer;
            item->dimension = dim;
            item->input_data = grad_output;
            item->output_data = grad_input;
            add_to_batch(batch, item);
        }
    }
    
    // Submit and wait
    submit_work_batch(system, batch);
    wait_for_batch_completion(system, batch);
    free_work_batch(batch);
}
```

### Gradient Accumulation

```c
void cllm_accumulate_gradients_88d(Abacus88DThreaded* system) {
    // Each thread accumulates gradients for its dimensions
    for (int i = 0; i < 12; i++) {
        GeometricThread* thread = &system->workers[i];
        
        // Get dimensions owned by this thread
        uint8_t* dims = get_thread_dimensions(thread->thread_id);
        
        for (size_t j = 0; j < num_dims; j++) {
            uint8_t dim = dims[j];
            
            // Accumulate gradient across all layers
            CrystallineAbacus* accumulated = abacus_new(system->space->base);
            
            for (int layer = 0; layer < ABACUS88D_NUM_LAYERS; layer++) {
                CrystallineAbacus* grad = get_gradient(system, layer, dim);
                abacus_add(accumulated, accumulated, grad);
            }
            
            // Store accumulated gradient
            set_accumulated_gradient(system, dim, accumulated);
            abacus_free(accumulated);
        }
    }
    
    // Synchronize at boundaries
    synchronize_all_boundaries(system);
}
```

## Performance Considerations

### Load Balancing

**Problem**: Some dimensions may have more work than others

**Solution**: Dynamic work stealing based on geometric proximity

```c
// Monitor load imbalance
void monitor_load_balance(Abacus88DThreaded* system) {
    // Calculate work per thread
    size_t work_counts[12];
    for (int i = 0; i < 12; i++) {
        work_counts[i] = system->workers[i].queue.num_items;
    }
    
    // Find max and min
    size_t max_work = work_counts[0];
    size_t min_work = work_counts[0];
    for (int i = 1; i < 12; i++) {
        if (work_counts[i] > max_work) max_work = work_counts[i];
        if (work_counts[i] < min_work) min_work = work_counts[i];
    }
    
    // If imbalance > threshold, trigger rebalancing
    if (max_work > min_work * 2) {
        rebalance_work(system);
    }
}
```

### Cache Optimization

**Strategy**: Keep frequently accessed dimensions in thread-local cache

```c
// Thread-local cache
typedef struct {
    // Recently accessed dimensions
    struct {
        uint8_t layer;
        uint8_t dimension;
        CrystallineAbacus* value;
        uint64_t last_access;
    } entries[64];
    
    size_t num_entries;
    
} ThreadCache;

// Cache lookup
CrystallineAbacus* cache_lookup(ThreadCache* cache, uint8_t layer, uint8_t dim) {
    for (size_t i = 0; i < cache->num_entries; i++) {
        if (cache->entries[i].layer == layer && 
            cache->entries[i].dimension == dim) {
            cache->entries[i].last_access = get_timestamp();
            return cache->entries[i].value;
        }
    }
    return NULL;
}
```

### Synchronization Overhead

**Problem**: Frequent synchronization at boundaries can be expensive

**Solution**: Batch synchronization

```c
// Accumulate dirty boundaries
void mark_boundary_dirty(SharedBoundary* boundary) {
    boundary->dirty = true;
    boundary->dirty_count++;
}

// Synchronize when threshold reached
void check_and_sync_boundary(SharedBoundary* boundary) {
    if (boundary->dirty_count > SYNC_THRESHOLD) {
        pthread_mutex_lock(&boundary->lock);
        synchronize_boundary(boundary);
        boundary->dirty = false;
        boundary->dirty_count = 0;
        pthread_mutex_unlock(&boundary->lock);
    }
}
```

## Comparison with CLLMLatticeHierarchy

| Feature | CLLMLatticeHierarchy | Abacus88DThreaded |
|---------|---------------------|-------------------|
| Thread positioning | Arbitrary | Geometric (icosahedron) |
| Work distribution | Queue-based | Geometric proximity |
| Memory model | Shared regions | Geometric boundaries |
| Synchronization | Explicit locks | Lazy + geometric |
| Computation | Traditional | 88D + exact arithmetic |
| Prime generation | Lookup tables | Geometric (O(1)) |
| Scalability | Limited | Fractal (infinite) |

## Migration Path

### Phase 1: Parallel Implementation
- Keep CLLMLatticeHierarchy
- Add Abacus88DThreaded alongside
- Test both systems in parallel
- Compare performance

### Phase 2: Gradual Migration
- Move one operation at a time to Abacus88DThreaded
- Verify correctness
- Benchmark performance
- Fix issues

### Phase 3: Complete Replacement
- Remove CLLMLatticeHierarchy
- Use only Abacus88DThreaded
- Clean up old code
- Optimize

## Conclusion

This threading model makes Abacus88D a **complete solution** by:

1. ✅ Positioning threads geometrically (icosahedron vertices)
2. ✅ Distributing work based on geometric proximity
3. ✅ Using geometric boundaries for synchronization
4. ✅ Integrating with CLLM operations
5. ✅ Providing clear migration path from old system

**This is THE solution, not an abstraction layer.**

Next step: Implement this specification.