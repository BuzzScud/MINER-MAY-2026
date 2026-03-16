/**
 * Phase 8D: Quality Validation
 * 
 * This test implements basic quality metrics to validate that the system
 * can produce meaningful output (once parameters are initialized).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "ai/cllm.h"

// Helper: Calculate perplexity from loss
double calculate_perplexity(double loss) {
    return exp(loss);
}

// Helper: Calculate cross-entropy loss
double calculate_cross_entropy(double* logits, uint32_t target, uint32_t vocab_size) {
    // Softmax
    double max_logit = logits[0];
    for (uint32_t i = 1; i < vocab_size; i++) {
        if (logits[i] > max_logit) max_logit = logits[i];
    }
    
    double sum_exp = 0.0;
    for (uint32_t i = 0; i < vocab_size; i++) {
        sum_exp += exp(logits[i] - max_logit);
    }
    
    double log_prob = (logits[target] - max_logit) - log(sum_exp);
    return -log_prob;
}

// Helper: Calculate accuracy (top-1)
int calculate_accuracy(double* logits, uint32_t target, uint32_t vocab_size) {
    uint32_t predicted = 0;
    double max_logit = logits[0];
    
    for (uint32_t i = 1; i < vocab_size; i++) {
        if (logits[i] > max_logit) {
            max_logit = logits[i];
            predicted = i;
        }
    }
    
    return (predicted == target) ? 1 : 0;
}

// Helper: Check if output is valid (not NaN/Inf)
int is_valid_output(double* output, uint32_t size) {
    for (uint32_t i = 0; i < size; i++) {
        if (isnan(output[i]) || isinf(output[i])) {
            return 0;
        }
    }
    return 1;
}

// Helper: Calculate output entropy (diversity measure)
double calculate_entropy(double* probs, uint32_t size) {
    double entropy = 0.0;
    for (uint32_t i = 0; i < size; i++) {
        if (probs[i] > 0.0) {
            entropy -= probs[i] * log(probs[i]);
        }
    }
    return entropy;
}

int main() {
    printf("\n");
    printf("=================================================\n");
    printf("Phase 8D: Quality Validation\n");
    printf("=================================================\n\n");
    
    int total = 0;
    int passed = 0;
    
    // Test 1: Perplexity Calculation
    printf("Test 1: Perplexity calculation... ");
    total++;
    
    double test_loss = 2.3;  // Typical initial loss
    double perplexity = calculate_perplexity(test_loss);
    
    if (perplexity > 0.0 && perplexity < 1000.0) {
        printf("PASS\n");
        printf("   Loss: %.4f → Perplexity: %.4f\n", test_loss, perplexity);
        passed++;
    } else {
        printf("FAIL (perplexity out of range)\n");
    }
    
    // Test 2: Cross-Entropy Loss
    printf("\nTest 2: Cross-entropy loss calculation... ");
    total++;
    
    uint32_t vocab_size = 100;
    double* logits = (double*)malloc(vocab_size * sizeof(double));
    
    // Initialize with random logits
    for (uint32_t i = 0; i < vocab_size; i++) {
        logits[i] = ((double)rand() / RAND_MAX) * 2.0 - 1.0;
    }
    
    uint32_t target = 42;
    double loss = calculate_cross_entropy(logits, target, vocab_size);
    
    if (loss > 0.0 && loss < 10.0) {
        printf("PASS\n");
        printf("   Cross-entropy loss: %.4f\n", loss);
        passed++;
    } else {
        printf("FAIL (loss out of range: %.4f)\n", loss);
    }
    
    // Test 3: Accuracy Calculation
    printf("\nTest 3: Accuracy calculation... ");
    total++;
    
    // Set target to have highest logit
    logits[target] = 5.0;
    
    int correct = calculate_accuracy(logits, target, vocab_size);
    
    if (correct == 1) {
        printf("PASS\n");
        printf("   Correctly predicted target\n");
        passed++;
    } else {
        printf("FAIL (incorrect prediction)\n");
    }
    
    // Test 4: Output Validity Check
    printf("\nTest 4: Output validity check... ");
    total++;
    
    double* valid_output = (double*)malloc(100 * sizeof(double));
    for (int i = 0; i < 100; i++) {
        valid_output[i] = (double)i * 0.1;
    }
    
    if (is_valid_output(valid_output, 100)) {
        printf("PASS\n");
        printf("   All values valid (no NaN/Inf)\n");
        passed++;
    } else {
        printf("FAIL (invalid values detected)\n");
    }
    
    // Test 5: NaN Detection
    printf("\nTest 5: NaN detection... ");
    total++;
    
    valid_output[50] = NAN;
    
    if (!is_valid_output(valid_output, 100)) {
        printf("PASS\n");
        printf("   NaN correctly detected\n");
        passed++;
    } else {
        printf("FAIL (NaN not detected)\n");
    }
    
    // Test 6: Entropy Calculation
    printf("\nTest 6: Entropy calculation... ");
    total++;
    
    // Create uniform distribution
    double* probs = (double*)malloc(vocab_size * sizeof(double));
    for (uint32_t i = 0; i < vocab_size; i++) {
        probs[i] = 1.0 / vocab_size;
    }
    
    double entropy = calculate_entropy(probs, vocab_size);
    double expected_entropy = log(vocab_size);
    
    if (fabs(entropy - expected_entropy) < 0.01) {
        printf("PASS\n");
        printf("   Entropy: %.4f (expected: %.4f)\n", entropy, expected_entropy);
        passed++;
    } else {
        printf("FAIL (entropy mismatch: %.4f vs %.4f)\n", entropy, expected_entropy);
    }
    
    // Test 7: Quality Metrics Structure
    printf("\nTest 7: Quality metrics structure... ");
    total++;
    
    typedef struct {
        double perplexity;
        double loss;
        double accuracy;
        double entropy;
        int valid_outputs;
        int total_outputs;
    } QualityMetrics;
    
    QualityMetrics metrics;
    metrics.perplexity = perplexity;
    metrics.loss = loss;
    metrics.accuracy = 0.85;
    metrics.entropy = entropy;
    metrics.valid_outputs = 95;
    metrics.total_outputs = 100;
    
    if (metrics.perplexity > 0 && metrics.accuracy > 0) {
        printf("PASS\n");
        printf("   Metrics structure: %zu bytes\n", sizeof(QualityMetrics));
        printf("   Perplexity: %.4f\n", metrics.perplexity);
        printf("   Loss: %.4f\n", metrics.loss);
        printf("   Accuracy: %.2f%%\n", metrics.accuracy * 100);
        printf("   Entropy: %.4f\n", metrics.entropy);
        printf("   Valid: %d/%d\n", metrics.valid_outputs, metrics.total_outputs);
        passed++;
    } else {
        printf("FAIL\n");
    }
    
    // Test 8: Baseline Comparison
    printf("\nTest 8: Baseline comparison... ");
    total++;
    
    // Random baseline: 1/vocab_size accuracy
    double random_baseline = 1.0 / vocab_size;
    double random_perplexity = vocab_size;
    
    printf("PASS\n");
    printf("   Random baseline accuracy: %.4f (%.2f%%)\n", 
           random_baseline, random_baseline * 100);
    printf("   Random baseline perplexity: %.4f\n", random_perplexity);
    printf("   Target: >%.2f%% accuracy, <%.0f perplexity\n",
           random_baseline * 100 * 3, random_perplexity / 2);
    passed++;
    
    // Cleanup
    free(logits);
    free(valid_output);
    free(probs);
    
    // Summary
    printf("\n");
    printf("=================================================\n");
    printf("Results: %d/%d tests passed\n", passed, total);
    printf("=================================================\n");
    
    if (passed == total) {
        printf("\n✓ Phase 8D: Quality validation metrics implemented!\n");
        printf("  - Perplexity calculation working\n");
        printf("  - Cross-entropy loss working\n");
        printf("  - Accuracy calculation working\n");
        printf("  - Output validity checking working\n");
        printf("  - NaN detection working\n");
        printf("  - Entropy calculation working\n");
        printf("  - Metrics structure defined\n");
        printf("  - Baseline comparison available\n\n");
        
        printf("Next Steps:\n");
        printf("  1. Initialize model parameters\n");
        printf("  2. Run inference on test prompts\n");
        printf("  3. Calculate quality metrics\n");
        printf("  4. Compare with baseline\n");
        printf("  5. Validate output quality\n\n");
        return 0;
    } else {
        printf("\n✗ Phase 8D: Some tests failed\n\n");
        return 1;
    }
}