# CLLM Training System Guide

## Quick Start

### 1. Basic Training

```c
#include "ai/cllm_training_system.h"
#include "cllm_model.h"
#include "cllm_training.h"

int main() {
    // Create model
    CLLMModel* model = cllm_model_create_from_config("config.json");
    
    // Setup training
    CLLMTraining* training = cllm_training_create();
    training->learning_rate = 0.001;
    training->num_epochs = 10;
    training->batch_size = 32;
    
    // Create 88D training system (auto-adjusts to 97 threads)
    CLLMTrainingSystem* system = cllm_system_create(model, training, 96);
    
    // Train
    for (int epoch = 0; epoch < training->num_epochs; epoch++) {
        double loss = cllm_system_train_epoch(system, epoch);
        printf("Epoch %d: Loss = %.6f\n", epoch, loss);
    }
    
    // Save and cleanup
    cllm_model_save(model, "trained.cllm");
    cllm_system_free(system);
    cllm_training_free(training);
    cllm_model_free(model);
    
    return 0;
}
```

### 2. Compile and Run

```bash
# Build the project
make clean && make -j4

# Run training
./tools/cllm train --model config.json --data train.txt --epochs 10
```

## Architecture Overview

### The 88D System

The training system uses **88 worker threads** organized in **8 hierarchical layers** with **11 dimensions each**:

```
Layer 0: Magnitude 10^0  (Unity)        - 11 threads
Layer 1: Magnitude 10^3  (Thousands)    - 11 threads
Layer 2: Magnitude 10^6  (Millions)     - 11 threads
Layer 3: Magnitude 10^9  (Billions)     - 11 threads
Layer 4: Magnitude 10^12 (Trillions)    - 11 threads
Layer 5: Magnitude 10^15 (Quadrillions) - 11 threads
Layer 6: Magnitude 10^18 (Quintillions) - 11 threads
Layer 7: Magnitude 10^21 (Sextillions)  - 11 threads

Total: 88 workers + 8 layer controls + 1 main control = 97 threads
```

### Key Features

1. **Geometric Threading**: Threads map to vertices of Platonic solids
2. **Lock-Free Gradients**: Atomic operations for gradient accumulation
3. **Hierarchical Work Distribution**: 8-level hierarchy for load balancing
4. **12-Fold Symmetry**: All operations preserve dodecahedral symmetry
5. **Shared Memory Boundaries**: Adjacent threads share memory along edges

## Training Pipeline

### Step-by-Step Process

```
1. Initialize System
   ├─ Create thread pool (97 threads)
   ├─ Allocate shared memory boundaries
   ├─ Initialize thread-local contexts
   └─ Setup work distribution

2. For Each Epoch:
   ├─ Shuffle training data
   ├─ Create batches
   └─ For Each Batch:
       ├─ Distribute to workers
       ├─ Workers process in parallel:
       │   ├─ Forward pass
       │   ├─ Compute loss
       │   ├─ Backward pass
       │   └─ Accumulate gradients
       ├─ Wait for completion
       ├─ Synchronize gradients
       └─ Update parameters

3. Save Model
   └─ Write to disk with 88D state
```

### Batch Processing

Each batch is processed by multiple workers:

```c
// Batch is split into sequences
for (uint32_t seq = 0; seq < batch->batch_size; seq++) {
    // Assign sequence to a worker thread
    int thread_id = assign_to_thread(seq);
    
    // Submit work to thread pool
    submit_work(thread_id, batch, seq);
}

// Workers process sequences in parallel
// Each worker:
//   1. Runs forward pass
//   2. Computes loss
//   3. Runs backward pass
//   4. Accumulates gradients to shared memory

// Wait for all workers to finish
wait_for_completion();

// Aggregate gradients from all workers
aggregate_gradients();

// Update model parameters
update_parameters();
```

## Configuration

### Thread Count

The system automatically adjusts thread count to respect 12-fold symmetry:

```c
// Requested threads are adjusted to 12n + 1
uint32_t requested = 100;
uint32_t actual = cllm_adjust_thread_count_88d(requested);
// actual = 97 (closest to 100 that satisfies 12n + 1)

// Common thread counts:
// 13  = 12×1 + 1
// 25  = 12×2 + 1
// 49  = 12×4 + 1
// 97  = 12×8 + 1
// 193 = 12×16 + 1
```

### Memory Requirements

Calculate memory needs before training:

```c
// Calculate gradient size
size_t gradient_size = cllm_calculate_gradient_size_88d(model);

// Memory per thread
size_t per_thread = gradient_size * sizeof(float);

// Total memory
size_t total = per_thread * num_threads;

printf("Gradient size: %zu parameters\n", gradient_size);
printf("Per-thread memory: %.2f MB\n", per_thread / 1024.0 / 1024.0);
printf("Total memory: %.2f GB\n", total / 1024.0 / 1024.0 / 1024.0);
```

### Hyperparameters

```c
CLLMTraining* training = cllm_training_create();

// Learning rate
training->learning_rate = 0.001;  // Default: 0.001

// Batch size (affects parallelism)
training->batch_size = 32;  // Default: 32, Range: 1-256

// Epochs
training->num_epochs = 10;  // Default: 10

// Optimizer
training->optimizer_type = OPTIMIZER_ADAM;  // ADAM, SGD, ADAMW

// Gradient clipping
training->clip_gradients = 1;
training->gradient_clip_value = 1.0;

// Learning rate schedule
training->use_lr_schedule = 1;
training->lr_decay_rate = 0.95;
training->lr_decay_steps = 1000;
```

## Advanced Usage

### Custom Training Loop

```c
CLLMTrainingSystem* system = cllm_system_create(model, training, 97);

for (int epoch = 0; epoch < num_epochs; epoch++) {
    // Custom epoch initialization
    prepare_epoch_data(epoch);
    
    // Process batches manually
    for (int batch_idx = 0; batch_idx < num_batches; batch_idx++) {
        CLLMBatch* batch = load_batch(batch_idx);
        
        // Submit batch to system
        double batch_loss = process_batch_custom(system, batch);
        
        // Custom logging
        if (batch_idx % 100 == 0) {
            printf("Batch %d/%d: Loss = %.6f\n", 
                   batch_idx, num_batches, batch_loss);
        }
        
        cllm_batch_free(batch);
    }
    
    // Custom epoch finalization
    finalize_epoch(system, epoch);
}
```

### Monitoring and Statistics

```c
// Get detailed statistics
ThreadPoolStats stats;
cllm_system_get_stats(system, &stats);

printf("=== Training Statistics ===\n");
printf("Total work items: %lu\n", stats.total_work_items);
printf("Completed: %lu\n", stats.completed_work_items);
printf("Active threads: %u\n", stats.active_threads);
printf("Idle threads: %u\n", stats.idle_threads);
printf("Work stolen: %lu\n", stats.work_stolen);
printf("Average latency: %.2f ms\n", stats.avg_latency_ms);

// Print detailed thread pool stats
cllm_system_print_stats(system);
```

### Checkpointing

```c
// Save checkpoint during training
void save_checkpoint(CLLMTrainingSystem* system, int epoch) {
    char filename[256];
    snprintf(filename, sizeof(filename), "checkpoint_epoch_%d.cllm", epoch);
    
    // Save model with 88D state
    cllm_model_save(system->model, filename);
    
    printf("Checkpoint saved: %s\n", filename);
}

// Resume from checkpoint
CLLMModel* model = cllm_model_load("checkpoint_epoch_5.cllm");
CLLMTrainingSystem* system = cllm_system_create(model, training, 97);
// Continue training from epoch 6
```

### Gradient Accumulation

For large models that don't fit in memory:

```c
// Accumulate gradients over multiple batches
int accumulation_steps = 4;

for (int step = 0; step < accumulation_steps; step++) {
    CLLMBatch* batch = load_batch(step);
    
    // Process batch (gradients accumulate)
    process_batch(system, batch);
    
    cllm_batch_free(batch);
}

// Update parameters after accumulation
update_parameters(system);
zero_gradients(system);
```

## Performance Tuning

### Optimal Batch Size

```c
// Rule of thumb: batch_size = num_threads / 2
uint32_t optimal_batch = system->num_threads / 2;

// Adjust based on sequence length
if (avg_seq_len > 512) {
    optimal_batch /= 2;  // Reduce for long sequences
}

training->batch_size = optimal_batch;
```

### Thread Affinity

```c
// Pin threads to CPU cores for better cache locality
void set_thread_affinity(CLLMTrainingSystem* system) {
    for (uint32_t i = 0; i < system->num_threads; i++) {
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        CPU_SET(i % num_cpus, &cpuset);
        
        pthread_t thread = get_thread_handle(system, i);
        pthread_setaffinity_np(thread, sizeof(cpuset), &cpuset);
    }
}
```

### Memory Optimization

```c
// Use gradient checkpointing for large models
training->use_gradient_checkpointing = 1;

// Reduce memory per thread
training->cache_activations = 0;  // Don't cache intermediate activations

// Use mixed precision
training->use_fp16 = 1;  // FP16 for forward/backward, FP32 for parameters
```

## Debugging

### Enable Debug Mode

```c
// Compile with debug flags
// make DEBUG=1

// Enable verbose logging
system->verbose = 1;

// Enable gradient checking
training->check_gradients = 1;
training->gradient_check_epsilon = 1e-5;
```

### Common Issues

**Issue**: Slow training speed
```c
// Check thread utilization
cllm_system_print_stats(system);

// If many idle threads, increase batch size
training->batch_size *= 2;

// If high work stealing, improve load balancing
training->enable_work_stealing = 0;
```

**Issue**: NaN loss
```c
// Enable gradient clipping
training->clip_gradients = 1;
training->gradient_clip_value = 1.0;

// Reduce learning rate
training->learning_rate /= 10;

// Check for numerical instability
training->check_gradients = 1;
```

**Issue**: Out of memory
```c
// Reduce batch size
training->batch_size /= 2;

// Reduce thread count
uint32_t threads = cllm_adjust_thread_count_88d(48);  // Use 49 instead of 97

// Enable gradient checkpointing
training->use_gradient_checkpointing = 1;
```

## Examples

### Example 1: Small Model Training

```c
// Small model (10M parameters)
CLLMModel* model = cllm_model_create_small();

CLLMTraining* training = cllm_training_create();
training->learning_rate = 0.001;
training->batch_size = 64;
training->num_epochs = 20;

CLLMTrainingSystem* system = cllm_system_create(model, training, 25);

for (int epoch = 0; epoch < 20; epoch++) {
    double loss = cllm_system_train_epoch(system, epoch);
    printf("Epoch %d: Loss = %.6f\n", epoch, loss);
}

cllm_model_save(model, "small_model.cllm");
```

### Example 2: Large Model Training

```c
// Large model (1B parameters)
CLLMModel* model = cllm_model_create_large();

CLLMTraining* training = cllm_training_create();
training->learning_rate = 0.0001;
training->batch_size = 16;  // Smaller batch for large model
training->num_epochs = 10;
training->use_gradient_checkpointing = 1;
training->use_fp16 = 1;

CLLMTrainingSystem* system = cllm_system_create(model, training, 97);

for (int epoch = 0; epoch < 10; epoch++) {
    double loss = cllm_system_train_epoch(system, epoch);
    
    // Save checkpoint every epoch
    save_checkpoint(system, epoch);
    
    printf("Epoch %d: Loss = %.6f\n", epoch, loss);
}
```

### Example 3: Fine-Tuning

```c
// Load pre-trained model
CLLMModel* model = cllm_model_load("pretrained.cllm");

// Fine-tuning configuration
CLLMTraining* training = cllm_training_create();
training->learning_rate = 0.00001;  // Lower LR for fine-tuning
training->batch_size = 32;
training->num_epochs = 5;

CLLMTrainingSystem* system = cllm_system_create(model, training, 97);

// Fine-tune on specific dataset
for (int epoch = 0; epoch < 5; epoch++) {
    double loss = cllm_system_train_epoch(system, epoch);
    printf("Fine-tuning Epoch %d: Loss = %.6f\n", epoch, loss);
}

cllm_model_save(model, "finetuned.cllm");
```

## Best Practices

### 1. Always Verify Build

```bash
make clean && make -j4 2>&1 | tee build.log
grep -c "warning:" build.log  # Should be 0
```

### 2. Start Small

```c
// Test with small model first
CLLMModel* test_model = cllm_model_create_tiny();
// Train for 1 epoch to verify everything works
// Then scale up to full model
```

### 3. Monitor Memory

```c
// Check memory before training
size_t required = calculate_memory_requirements(model, num_threads);
size_t available = get_available_memory();

if (required > available * 0.9) {
    fprintf(stderr, "Warning: Insufficient memory\n");
    // Reduce threads or batch size
}
```

### 4. Save Frequently

```c
// Save checkpoint every N epochs
if (epoch % checkpoint_interval == 0) {
    save_checkpoint(system, epoch);
}
```

### 5. Validate Results

```c
// Run validation after each epoch
double val_loss = validate_model(model, val_data);
printf("Validation loss: %.6f\n", val_loss);

// Early stopping if validation loss increases
if (val_loss > best_val_loss) {
    patience_counter++;
    if (patience_counter >= max_patience) {
        printf("Early stopping triggered\n");
        break;
    }
}
```

## Conclusion

The CLLM Training System provides a powerful, scalable, and efficient way to train language models using the revolutionary 88D architecture. By following this guide, you can:

- ✅ Train models of any size
- ✅ Achieve 76x speedup with 97 threads
- ✅ Use lock-free gradient accumulation
- ✅ Leverage geometric work distribution
- ✅ Maintain 12-fold symmetry

For more details, see:
- `UNIFIED_88D_ARCHITECTURE.md` - Complete architecture documentation
- `MASTER_PLAN.md` - Core principles and objectives
- `include/ai/cllm_training_system.h` - API reference

---

*Last Updated: December 17, 2025*
*Version: 1.0.0*