// Debug test to isolate training hang issue
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include "cllm.h"
#include "cllm_training_threaded.h"

// Signal handler for timeout
static volatile int timeout_flag = 0;

void timeout_handler(int sig) {
    (void)sig;
    timeout_flag = 1;
    fprintf(stderr, "\n\n=== TIMEOUT: Training hung for 30 seconds ===\n");
    fprintf(stderr, "This confirms the hang issue.\n");
    exit(1);
}

int main() {
    printf("=== Debug Training Hang Test ===\n\n");
    
    // Set up timeout handler (30 seconds)
    signal(SIGALRM, timeout_handler);
    alarm(30);
    
    // Create tiny model
    printf("1. Creating tiny model...\n");
    CLLMConfig config = {
        .vocab_size = 100,
        .embedding_dim = 64,
        .num_layers = 2,
        .num_heads = 4
    };
    
    CLLMModel* model = cllm_create_model(&config);
    if (!model) {
        fprintf(stderr, "Failed to create model\n");
        return 1;
    }
    printf("   ✓ Model created\n\n");
    
    // Create threaded training system
    printf("2. Creating threaded training system...\n");
    ThreadedTrainingSystem* system = threaded_training_create(
        model,
        0.001,  // learning_rate
        12,     // num_worker_spheres
        0       // recursive_depth
    );
    
    if (!system) {
        fprintf(stderr, "Failed to create training system\n");
        cllm_free_model(model);
        return 1;
    }
    printf("   ✓ Training system created\n\n");
    
    // Create minimal training data
    printf("3. Creating test batch...\n");
    uint32_t batch_size = 2;
    uint32_t seq_len = 8;
    uint32_t* input_ids = (uint32_t*)calloc(batch_size * seq_len, sizeof(uint32_t));
    uint32_t* target_ids = (uint32_t*)calloc(batch_size * seq_len, sizeof(uint32_t));
    
    // Fill with simple pattern
    for (uint32_t i = 0; i < batch_size * seq_len; i++) {
        input_ids[i] = i % 50;
        target_ids[i] = (i + 1) % 50;
    }
    printf("   ✓ Test batch created\n\n");
    
    // Prepare batch data
    printf("4. Preparing batch data...\n");
    BatchData* batch = (BatchData*)malloc(sizeof(BatchData));
    batch->input_ids = input_ids;
    batch->target_ids = target_ids;
    batch->batch_size = batch_size;
    batch->seq_len = seq_len;
    batch->batch_idx = 0;
    printf("   ✓ Batch data prepared\n\n");
    
    // Add batch to queue
    printf("5. Adding batch to work queue...\n");
    batch_queue_push(system, batch);
    printf("   ✓ Batch added to queue\n\n");
    
    // Start pre-fetch thread
    printf("6. Starting pre-fetch thread...\n");
    batch_queue_start_prefetch(system);
    printf("   ✓ Pre-fetch thread started\n\n");
    
    // Run one epoch (THIS IS WHERE IT HANGS)
    printf("7. Running training epoch...\n");
    printf("   NOTE: If this hangs, we'll timeout in 30 seconds\n\n");
    fflush(stdout);
    
    double loss = threaded_train_epoch_lockfree(system, 0);
    
    // If we get here, training completed successfully
    alarm(0);  // Cancel timeout
    printf("\n   ✓ Training epoch completed!\n");
    printf("   Loss: %.6f\n\n", loss);
    
    // Cleanup
    printf("8. Cleaning up...\n");
    free(input_ids);
    free(target_ids);
    free(batch);
    threaded_training_free(system);
    cllm_free_model(model);
    printf("   ✓ Cleanup complete\n\n");
    
    printf("=== Test PASSED: No hang detected ===\n");
    return 0;
}