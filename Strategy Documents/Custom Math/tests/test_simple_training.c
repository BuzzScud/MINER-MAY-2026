#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/resource.h>
#include "ai/cllm.h"
#include "ai/cllm_training.h"

// Simple test to verify training works
int main() {
    printf("=== CLLM Training Test ===\n\n");
    
    // Create minimal model configuration
    CLLMConfig config = {
        .vocab_size = 100,
        .embedding_dim = 64,
        .num_layers = 2,
        .num_heads = 4,
        .hidden_dim = 128,
        .max_seq_len = 32,
        .num_threads = 8
    };
    
    printf("Creating model...\n");
    CLLMModel* model = cllm_create_model(&config);
    
    if (!model) {
        printf("ERROR: Failed to create model\n");
        return 1;
    }
    
    printf("Model created successfully!\n");
    printf("  Vocab size: %d\n", config.vocab_size);
    printf("  Embedding dim: %d\n", config.embedding_dim);
    printf("  Num layers: %d\n", config.num_layers);
    printf("  Num threads: %d\n", config.num_threads);
    
    // Create training configuration
    CLLMTrainingConfig train_config = {
        .learning_rate = 0.001,
        .batch_size = 1,
        .num_epochs = 1,
        .max_steps = 10,
        .weight_decay = 0.0,
        .gradient_clip = 1.0,
        .warmup_steps = 0,
        .save_interval = 100,
        .save_every = 100,
        .eval_interval = 100,
        .sequence_length = 5,
        .optimizer = "adam",
        .lr_scheduler = "none",
        .gradient_accumulation_steps = 1,
        .use_mixed_precision = 0
    };
    
    printf("\nInitializing training...\n");
    CLLMTraining* training = cllm_training_init(model, &train_config);
    
    if (!training) {
        printf("ERROR: Failed to initialize training\n");
        cllm_free_model(model);
        return 1;
    }
    
    printf("Training initialized successfully!\n");
    
    // Create simple training data
    uint32_t input_ids[] = {1, 2, 3, 4, 5};
    uint32_t target_ids[] = {2, 3, 4, 5, 6};
    
    printf("\nTraining for 3 steps...\n");
    
    for (int step = 0; step < 3; step++) {
        printf("\nStep %d:\n", step + 1);
        
        // Forward pass
        double loss = cllm_forward_training(training, input_ids);
        printf("  Loss: %.6f\n", loss);
        
        // Backward pass
        double gradient_buffer[1000];  // Simple buffer for gradients
        cllm_backward_training(training, target_ids, gradient_buffer);
        printf("  Backward pass complete\n");
        
        // Update parameters using Adam
        cllm_adam_step(training, train_config.learning_rate);
        printf("  Parameters updated\n");
    }
    
    printf("\n=== Training Complete ===\n");
    
    // Cleanup
    cllm_training_free(training);
    cllm_free_model(model);
    
    return 0;
}