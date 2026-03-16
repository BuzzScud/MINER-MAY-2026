/**
 * @file test_simple.c
 * @brief Simple end-to-end test
 */

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include "ai/cllm.h"
#include "ai/cllm_training.h"

int main() {
    printf("=== Simple CLLM Test ===\n");
    fflush(stdout);
    
    // Create config
    CLLMConfig config = {0};
    config.solid_type = PLATONIC_CUBE;
    config.vocab_size = 100;
    config.max_seq_len = 32;
    config.embedding_dim = 64;
    config.hidden_dim = 128;
    config.num_layers = 2;
    config.num_heads = 4;
    config.enable_kissing_spheres = true;
    config.enable_blind_recovery = false;  // Disable for speed
    config.enable_harmonic_integration = false;  // Disable for speed
    config.enable_ntt_attention = false;  // Disable for speed
    
    printf("Creating model...\n");
    fflush(stdout);
    
    CLLMModel* model = cllm_create_model(&config);
    
    if (!model) {
        printf("FAILED: Could not create model\n");
        return 1;
    }
    
    printf("SUCCESS: Model created\n");
    printf("  Threads: %u\n", model->threads ? model->threads->num_threads : 0);
    printf("  Physical workers: %u\n", model->threads ? model->threads->num_physical_workers : 0);
    fflush(stdout);
    
    // Test optimizer
    if (model->threads) {
        printf("\nTesting optimizer...\n");
        fflush(stdout);
        
        model->optimizer.learning_rate = 0.001;
        model->optimizer.beta1 = 0.9;
        model->optimizer.beta2 = 0.999;
        model->optimizer.epsilon = 1e-8;
        model->optimizer.t = 0;
        
        // Create training context
        CLLMTraining training = {0};
        training.model = model;
        
        printf("Running optimizer step...\n");
        fflush(stdout);
        
        cllm_optimizer_step_adam(&training);
        
        printf("SUCCESS: Optimizer step completed\n");
        fflush(stdout);
    }
    
    printf("\nFreeing model...\n");
    fflush(stdout);
    
    cllm_free_model(model);
    
    printf("All tests passed!\n");
    fflush(stdout);
    
    return 0;
}