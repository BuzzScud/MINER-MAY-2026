#include <stdio.h>
#include <stdlib.h>
#include "ai/cllm.h"
#include "ai/cllm_training.h"

/**
 * Minimal model test - designed to fit in memory
 * 
 * Configuration:
 * - vocab: 10 (minimal)
 * - embedding: 12 (12-fold symmetry)
 * - layers: 1 (minimal)
 * - heads: 4 (minimal)
 * - hidden: 24 (2x embedding)
 * - threads: 12 (1 layer × 12)
 * 
 * Expected memory: ~10-20 MB
 */
int main() {
    printf("=== Minimal CLLM Model Test ===\n\n");
    
    // Create minimal model configuration
    CLLMConfig config = {
        .vocab_size = 10,
        .embedding_dim = 12,
        .num_layers = 1,
        .num_heads = 4,
        .hidden_dim = 24,
        .max_seq_len = 8,
        .num_threads = 12  // 1 layer × 12 threads
    };
    
    printf("Configuration:\n");
    printf("  Vocab: %d\n", config.vocab_size);
    printf("  Embedding: %d\n", config.embedding_dim);
    printf("  Layers: %d\n", config.num_layers);
    printf("  Heads: %d\n", config.num_heads);
    printf("  Hidden: %d\n", config.hidden_dim);
    printf("  Threads: %d\n", config.num_threads);
    printf("\n");
    
    printf("Creating model...\n");
    CLLMModel* model = cllm_create_model(&config);
    
    if (!model) {
        printf("ERROR: Failed to create model\n");
        return 1;
    }
    
    printf("✓ Model created successfully!\n\n");
    
    // Create training configuration
    CLLMTrainingConfig train_config = {
        .learning_rate = 0.001,
        .batch_size = 1,
        .num_epochs = 1,
        .max_steps = 3,
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
    
    printf("Initializing training...\n");
    CLLMTraining* training = cllm_training_init(model, &train_config);
    
    if (!training) {
        printf("ERROR: Failed to initialize training\n");
        cllm_free_model(model);
        return 1;
    }
    
    printf("✓ Training initialized!\n\n");
    
    // Create simple training data (within vocab range)
    uint32_t input_ids[] = {1, 2, 3, 4, 5};
    uint32_t target_ids[] = {2, 3, 4, 5, 6};
    
    printf("Running 3 training steps...\n");
    
    for (int step = 0; step < 3; step++) {
        printf("\n--- Step %d ---\n", step + 1);
        
        // Forward pass
        printf("  Forward pass...\n");
        double loss = cllm_forward_training(training, input_ids);
        printf("  Loss: %.6f\n", loss);
        
        // Backward pass
        printf("  Backward pass...\n");
        double gradient_buffer[1000];
        cllm_backward_training(training, target_ids, gradient_buffer);
        printf("  ✓ Gradients computed\n");
        
        // Update parameters
        printf("  Updating parameters...\n");
        cllm_adam_step(training, train_config.learning_rate);
        printf("  ✓ Parameters updated\n");
    }
    
    printf("\n=== Training Complete ===\n");
    printf("✓ All 3 steps completed successfully!\n");
    
    // Cleanup
    cllm_training_free(training);
    cllm_free_model(model);
    
    printf("\n✓ Cleanup complete\n");
    
    return 0;
}