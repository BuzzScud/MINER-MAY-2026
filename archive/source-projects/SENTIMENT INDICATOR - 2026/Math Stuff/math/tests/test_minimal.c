/**
 * @file test_minimal.c
 * @brief Minimal CLLM test with tiny model to verify basic functionality
 * 
 * Configuration:
 * - vocab_size: 10 (minimal vocabulary)
 * - embedding_dim: 12 (1x 12-fold)
 * - hidden_dim: 24 (2x 12-fold)
 * - num_layers: 1 (single layer)
 * - num_heads: 4 (reduced from 12)
 * - max_seq_len: 8 (short sequences)
 * 
 * Expected memory: ~100 KB (vs 2GB+ for full model)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ai/cllm.h"
#include "ai/cllm_training.h"

int main(void) {
    printf("=== CLLM Minimal Test ===\n\n");
    
    // Step 1: Create minimal model configuration
    printf("Step 1: Creating minimal model configuration...\n");
    CLLMConfig config = {
        .solid_type = PLATONIC_TETRAHEDRON,
        .vocab_size = 10,           // Tiny vocabulary
        .max_seq_len = 8,           // Short sequences
        .embedding_dim = 12,        // 1x 12-fold (override auto)
        .hidden_dim = 24,           // 2x 12-fold (override auto)
        .num_layers = 1,            // Single layer only
        .num_heads = 4,             // Reduced heads (override auto)
        .enable_blind_recovery = false,
        .enable_harmonic_integration = false,
        .enable_ntt_attention = false,
        .enable_kissing_spheres = false,
        .num_threads = 0,           // Auto
        .optimizer_type = OPTIMIZER_ADAM,
        .learning_rate = 0.001,
        .beta1 = 0.9,
        .beta2 = 0.999,
        .epsilon = 1e-8,
        .weight_decay = 0.0
    };
    
    printf("  vocab_size: %u\n", config.vocab_size);
    printf("  embedding_dim: %u\n", config.embedding_dim);
    printf("  hidden_dim: %u\n", config.hidden_dim);
    printf("  num_layers: %u\n", config.num_layers);
    printf("  num_heads: %u\n", config.num_heads);
    printf("  max_seq_len: %u\n", config.max_seq_len);
    printf("  ✓ Configuration created\n\n");
    
    // Step 2: Create model
    printf("Step 2: Creating model...\n");
    CLLMModel* model = cllm_create_model(&config);
    if (!model) {
        fprintf(stderr, "ERROR: Failed to create model\n");
        return 1;
    }
    printf("  ✓ Model created successfully\n\n");
    
    // Step 3: Initialize training
    printf("Step 3: Initializing training...\n");
    CLLMTrainingConfig train_config = {
        .learning_rate = 0.001,
        .batch_size = 2,            // Tiny batch
        .num_epochs = 1,
        .max_steps = 10,
        .weight_decay = 0.0,
        .gradient_clip = 1.0,
        .warmup_steps = 0,
        .save_interval = 0,
        .eval_interval = 0,
        .sequence_length = 4,
        .optimizer = "adam",
        .lr_scheduler = "none",
        .gradient_accumulation_steps = 1
    };
    
    CLLMTraining* training = cllm_training_init(model, &train_config);
    if (!training) {
        fprintf(stderr, "ERROR: Failed to initialize training\n");
        cllm_free_model(model);
        return 1;
    }
    printf("  ✓ Training initialized\n\n");
    
    // Step 4: Create minimal training data
    printf("Step 4: Creating minimal training data...\n");
    uint32_t batch_size = 2;
    uint32_t seq_len = 4;  // Even shorter for testing
    
    // Input tokens: [batch_size * seq_len]
    uint32_t* input_tokens = (uint32_t*)calloc(batch_size * seq_len, sizeof(uint32_t));
    // Target tokens: [batch_size * seq_len]
    uint32_t* target_tokens = (uint32_t*)calloc(batch_size * seq_len, sizeof(uint32_t));
    
    if (!input_tokens || !target_tokens) {
        fprintf(stderr, "ERROR: Failed to allocate training data\n");
        cllm_training_free(training);
        cllm_free_model(model);
        return 1;
    }
    
    // Simple pattern: input = [0,1,2,3], target = [1,2,3,4]
    for (uint32_t b = 0; b < batch_size; b++) {
        for (uint32_t t = 0; t < seq_len; t++) {
            input_tokens[b * seq_len + t] = t;
            target_tokens[b * seq_len + t] = (t + 1) % config.vocab_size;
        }
    }
    printf("  ✓ Training data created\n\n");
    
    // Step 5: Run multiple training steps
    printf("Step 5: Running 10 training steps...\n");
    
    int num_steps = 10;
    double prev_loss = 0.0;
    
    for (int step = 0; step < num_steps; step++) {
        printf("  Step %d/%d: ", step + 1, num_steps);
        fflush(stdout);
        
        // Run training step
        double loss = cllm_train_step_threaded(
            training,
            input_tokens,
            target_tokens,
            batch_size * seq_len
        );
        
        if (loss < 0) {
            fprintf(stderr, "\nERROR: Training step %d failed (loss=%.6f)\n", step + 1, loss);
            free(input_tokens);
            free(target_tokens);
            cllm_training_free(training);
            cllm_free_model(model);
            return 1;
        }
        
        // Check if loss changed
        if (step > 0) {
            double loss_change = loss - prev_loss;
            printf("Loss=%.6f (change: %+.6f)\n", loss, loss_change);
        } else {
            printf("Loss=%.6f\n", loss);
        }
        
        prev_loss = loss;
    }
    
    printf("     ✓ All training steps completed\n\n");
    
    // Step 6: Cleanup
    printf("Step 6: Cleaning up...\n");
    free(input_tokens);
    free(target_tokens);
    cllm_training_free(training);
    cllm_free_model(model);
    printf("  ✓ Cleanup completed\n\n");
    
    printf("=== TEST PASSED ===\n");
    printf("All steps completed successfully!\n");
    
    return 0;
}