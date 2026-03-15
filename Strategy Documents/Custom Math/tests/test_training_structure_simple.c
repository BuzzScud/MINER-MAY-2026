/**
 * Simple test to verify training structure exists
 */

#include <stdio.h>
#include <stdlib.h>
#include "ai/cllm_training.h"

int main() {
    printf("Testing CLLMTraining structure...\n");
    
    // Just verify we can allocate the structure
    CLLMTraining* training = (CLLMTraining*)calloc(1, sizeof(CLLMTraining));
    
    if (training) {
        printf("✓ CLLMTraining structure allocated successfully\n");
        printf("  Size: %zu bytes\n", sizeof(CLLMTraining));
        free(training);
        return 0;
    } else {
        printf("✗ Failed to allocate CLLMTraining structure\n");
        return 1;
    }
}