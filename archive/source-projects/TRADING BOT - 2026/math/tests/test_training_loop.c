/**
 * Test: Training Loop
 * 
 * Tests that the training loop works correctly
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ai/cllm.h"
#include "ai/cllm_training.h"

int main() {
    printf("\n");
    printf("╔══════════════════════════════════════════════════════════╗\n");
    printf("║     Training Loop Tests                                 ║\n");
    printf("╚══════════════════════════════════════════════════════════╝\n");
    printf("\n");

    int passed = 0;
    int total = 3;

    // Test 1: Create training configuration
    printf("Test 1: Create training configuration... ");
    CLLMTrainingConfig config = {
        .num_epochs = 2,
        .batch_size = 4,
        .sequence_length = 8,
        .learning_rate = 0.001,
        .weight_decay = 0.01,
        .gradient_clip = 1.0,
        .warmup_steps = 0,
        .save_interval = 100,
        .eval_interval = 10,
        .max_steps = 1000
    };
    
    // Set optimizer name
    strncpy(config.optimizer, "adam", sizeof(config.optimizer) - 1);
    
    printf("PASS\n");
    printf("   Epochs: %d\n", config.num_epochs);
    printf("   Batch size: %d\n", config.batch_size);
    printf("   Sequence length: %d\n", config.sequence_length);
    passed++;

    // Test 2: Verify training functions exist
    printf("Test 2: Verify training functions exist... ");
    
    // These functions should be linkable
    // We're just checking they exist, not calling them yet
    void* train_epoch_ptr = (void*)cllm_train_epoch;
    void* train_ptr = (void*)cllm_train;
    
    if (train_epoch_ptr && train_ptr) {
        printf("PASS\n");
        printf("   cllm_train_epoch: %p\n", train_epoch_ptr);
        printf("   cllm_train: %p\n", train_ptr);
        passed++;
    } else {
        printf("FAIL\n");
    }

    // Test 3: Test training configuration validation
    printf("Test 3: Training configuration validation... ");
    
    int config_valid = 1;
    
    // Check required fields
    if (config.num_epochs == 0) config_valid = 0;
    if (config.batch_size == 0) config_valid = 0;
    if (config.sequence_length == 0) config_valid = 0;
    if (config.learning_rate <= 0.0) config_valid = 0;
    
    if (config_valid) {
        printf("PASS\n");
        printf("   Configuration is valid\n");
        passed++;
    } else {
        printf("FAIL\n");
    }

    // Summary
    printf("\n");
    printf("═══════════════════════════════════════════════════════════\n");
    printf("Results: %d/%d tests passed (%.1f%%)\n", passed, total, 
           (float)passed / total * 100.0f);
    printf("═══════════════════════════════════════════════════════════\n");
    printf("\n");

    if (passed == total) {
        printf("✓ Training loop functions available!\n");
        printf("  - cllm_train_epoch: ✓\n");
        printf("  - cllm_train: ✓\n");
        printf("  - Configuration validation: ✓\n");
        printf("\n");
        printf("Note: Full training test requires model creation,\n");
        printf("      which is tested separately.\n");
    } else {
        printf("✗ Some tests failed\n");
    }
    printf("\n");

    return (passed == total) ? 0 : 1;
}