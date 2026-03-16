// Simple training test to isolate the hang issue
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cllm_training.h"
#include "cllm_pure_crystalline.h"

int main() {
    printf("=== Simple Training Test ===\n\n");
    
    // Create a tiny model
    printf("Creating model...\n");
    CLLMModel* model = cllm_create_model(
        100,  // vocab_size
        64,   // embedding_dim
        2,    // num_layers
        4     // num_heads (will be overridden to 12)
    );
    
    if (!model) {
        fprintf(stderr, "Failed to create model\n");
        return 1;
    }
    printf("✓ Model created\n\n");
    
    // Create training context
    printf("Creating training context...\n");
    CLLMTraining* training = cllm_training_create(model, 0.0001);
    if (!training) {
        fprintf(stderr, "Failed to create training context\n");
        cllm_free_model(model);
        return 1;
    }
    printf("✓ Training context created\n\n");
    
    // Create a simple batch
    printf("Creating test batch...\n");
    uint32_t batch_size = 2;
    uint32_t seq_len = 8;
    uint32_t* input_ids = (uint32_t*)calloc(batch_size * seq_len, sizeof(uint32_t));
    uint32_t* target_ids = (uint32_t*)calloc(batch_size * seq_len, sizeof(uint32_t));
    
    // Fill with simple pattern
    for (uint32_t i = 0; i < batch_size * seq_len; i++) {
        input_ids[i] = i % 50;  // Simple pattern
        target_ids[i] = (i + 1) % 50;
    }
    printf("✓ Test batch created\n\n");
    
    // Run one forward pass
    printf("Running forward pass...\n");
    double loss = cllm_training_forward(training, input_ids, target_ids, batch_size, seq_len);
    printf("✓ Forward pass complete, loss: %.6f\n\n", loss);
    
    // Run backward pass
    printf("Running backward pass...\n");
    cllm_training_backward(training);
    printf("✓ Backward pass complete\n\n");
    
    // Update weights
    printf("Updating weights...\n");
    cllm_training_step(training);
    printf("✓ Weights updated\n\n");
    
    // Cleanup
    printf("Cleaning up...\n");
    free(input_ids);
    free(target_ids);
    cllm_training_free(training);
    cllm_free_model(model);
    printf("✓ Cleanup complete\n\n");
    
    printf("=== Test Complete ===\n");
    return 0;
}