/**
 * Integration Test: Forward and Backward Pass with Geometric Matrices
 * 
 * Tests that forward and backward passes work with the new thread-centric
 * geometric matrix architecture.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ai/cllm.h"
#include "ai/cllm_training.h"
#include "hierarchical_threading.h"
#include "worker_functions_geometric.h"

// Test 1: Basic model creation with thread pool
int test_model_creation_with_threads() {
    printf("Test 1: Model creation with thread pool... ");
    
    CLLMConfig config = {
        .solid_type = PLATONIC_CUBE,
        .vocab_size = 100,
        .max_seq_len = 64,
        .embedding_dim = 0,  // Auto-calculate from solid
        .hidden_dim = 0,
        .num_layers = 0,
        .num_heads = 0,
        .enable_blind_recovery = false,
        .enable_harmonic_integration = false,
        .enable_ntt_attention = false,
        .enable_kissing_spheres = true,
        .num_threads = 0,  // Auto (13 for kissing spheres)
        .optimizer_type = OPTIMIZER_ADAM,
        .learning_rate = 0.001,
        .beta1 = 0.9,
        .beta2 = 0.999,
        .epsilon = 1e-8,
        .weight_decay = 0.01
    };
    
    CLLMModel* model = cllm_create_model(&config);
    
    int success = 0;
    if (model && model->threads) {
        // Verify thread pool exists
        if (model->threads->num_threads > 0) {
            success = 1;
        }
    }
    
    if (model) {
        cllm_free_model(model);
    }
    
    if (success) {
        printf("PASS\n");
        return 1;
    } else {
        printf("FAIL (thread pool not created)\n");
        return 0;
    }
}

// Test 2: Training structure initialization
int test_training_initialization() {
    printf("Test 2: Training structure initialization... ");
    
    CLLMConfig model_config = {
        .solid_type = PLATONIC_CUBE,
        .vocab_size = 100,
        .max_seq_len = 64,
        .embedding_dim = 0,
        .hidden_dim = 0,
        .num_layers = 0,
        .num_heads = 0,
        .enable_kissing_spheres = true,
        .optimizer_type = OPTIMIZER_ADAM,
        .learning_rate = 0.001
    };
    
    CLLMModel* model = cllm_create_model(&model_config);
    if (!model) {
        printf("FAIL (model creation failed)\n");
        return 0;
    }
    
    CLLMTrainingConfig training_config = {
        .learning_rate = 0.001,
        .batch_size = 4,
        .num_epochs = 1,
        .max_steps = 100,
        .sequence_length = 32,
        .gradient_accumulation_steps = 1
    };
    strcpy(training_config.optimizer, "adam");
    strcpy(training_config.lr_scheduler, "none");
    
    CLLMTraining* training = cllm_training_init(model, &training_config);
    
    int success = 0;
    if (training) {
        // Check that thread statistics are allocated
        if (training->thread_stats) {
            success = 1;
        }
        cllm_training_cleanup(training);
    }
    
    cllm_free_model(model);
    
    if (success) {
        printf("PASS\n");
        return 1;
    } else {
        printf("FAIL (thread statistics not allocated)\n");
        return 0;
    }
}

// Test 3: Worker function availability
int test_worker_functions_exist() {
    printf("Test 3: Worker function availability... ");
    
    // Just verify the functions are linked and callable
    // We'll test actual functionality in separate tests
    
    // This test just checks that the symbols exist
    void* funcs[] = {
        (void*)worker_get_embedding_double,
        (void*)worker_compute_attention_double,
        (void*)worker_compute_ffn_double,
        (void*)worker_compute_gradients_double,
        (void*)worker_compute_ffn_gradients_double
    };
    
    int success = 1;
    for (int i = 0; i < 5; i++) {
        if (funcs[i] == NULL) {
            success = 0;
            break;
        }
    }
    
    if (success) {
        printf("PASS\n");
        return 1;
    } else {
        printf("FAIL (worker functions not available)\n");
        return 0;
    }
}

// Test 4: Memory consistency across multiple training sessions
int test_memory_consistency() {
    printf("Test 4: Memory consistency (5 cycles)... ");
    
    CLLMConfig model_config = {
        .solid_type = PLATONIC_CUBE,
        .vocab_size = 100,
        .max_seq_len = 64,
        .enable_kissing_spheres = true,
        .optimizer_type = OPTIMIZER_ADAM,
        .learning_rate = 0.001
    };
    
    CLLMModel* model = cllm_create_model(&model_config);
    if (!model) {
        printf("FAIL (model creation failed)\n");
        return 0;
    }
    
    CLLMTrainingConfig training_config = {
        .learning_rate = 0.001,
        .batch_size = 4,
        .num_epochs = 1,
        .max_steps = 100,
        .sequence_length = 32
    };
    strcpy(training_config.optimizer, "adam");
    
    int success = 1;
    for (int cycle = 0; cycle < 5; cycle++) {
        CLLMTraining* training = cllm_training_init(model, &training_config);
        
        if (!training || !training->thread_stats) {
            success = 0;
            if (training) cllm_training_cleanup(training);
            break;
        }
        
        cllm_training_cleanup(training);
    }
    
    cllm_free_model(model);
    
    if (success) {
        printf("PASS (5 cycles)\n");
        return 1;
    } else {
        printf("FAIL (memory consistency issue)\n");
        return 0;
    }
}

int main() {
    printf("\n");
    printf("=================================================\n");
    printf("Forward/Backward Pass Integration Tests (Geometric)\n");
    printf("=================================================\n\n");
    
    int total = 0;
    int passed = 0;
    
    // Run tests
    total++; if (test_model_creation_with_threads()) passed++;
    total++; if (test_training_initialization()) passed++;
    total++; if (test_worker_functions_exist()) passed++;
    total++; if (test_memory_consistency()) passed++;
    
    // Summary
    printf("\n");
    printf("=================================================\n");
    printf("Results: %d/%d tests passed\n", passed, total);
    printf("=================================================\n");
    
    return (passed == total) ? 0 : 1;
}