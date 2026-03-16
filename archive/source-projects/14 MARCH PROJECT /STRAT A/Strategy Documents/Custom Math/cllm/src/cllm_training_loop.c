/**
 * @file cllm_training_loop.c
 * @brief Training loop implementation for 88D architecture
 * 
 * Implements the main training loop that orchestrates:
 * - Forward passes through the model
 * - Backward passes for gradient computation
 * - Parameter updates via optimizer
 * - Loss tracking and convergence monitoring
 */

#include "ai/cllm.h"
#include "ai/cllm_training.h"
#include "ai/cllm_parameter_init.h"
#include "hierarchical_threading.h"
#include "worker_functions_geometric.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

// ============================================================================
// TRAINING EPOCH
// ============================================================================

/**
 * @brief Train for one epoch
 * 
 * An epoch consists of iterating through all training data once.
 * 
 * @param training Training context
 * @return Average loss for the epoch, or -1.0 on error
 */
double cllm_train_epoch(CLLMTraining* training) {
    if (!training || !training->model) {
        fprintf(stderr, "ERROR: Invalid training context\n");
        return -1.0;
    }
    
    CLLMModel* model = training->model;
    CLLMTrainingConfig* config = &training->config;
    
    // Verify thread pool exists
    if (!model->threads) {
        fprintf(stderr, "ERROR: Thread pool not initialized\n");
        return -1.0;
    }
    
    // Calculate number of batches
    // For now, use a fixed number since num_samples isn't in the config
    uint32_t num_batches = 10;  // Default to 10 batches per epoch
    
    double total_loss = 0.0;
    uint32_t valid_batches = 0;
    
    printf("Training epoch: %u batches\n", num_batches);
    
    // Iterate through batches
    for (uint32_t batch_idx = 0; batch_idx < num_batches; batch_idx++) {
        // Calculate batch start and size
        uint32_t batch_start = batch_idx * config->batch_size;
        uint32_t batch_size = config->batch_size;
        
        // Batch size is fixed from config
        (void)batch_start;  // Suppress unused warning
        
        // For now, we'll use dummy input tokens
        // In a real implementation, these would come from the dataset
        uint32_t* input_tokens = (uint32_t*)calloc(
            batch_size * config->sequence_length, 
            sizeof(uint32_t)
        );
        
        if (!input_tokens) {
            fprintf(stderr, "ERROR: Failed to allocate input tokens\n");
            continue;
        }
        
        // Generate dummy tokens (in real implementation, load from dataset)
        for (uint32_t i = 0; i < batch_size * config->sequence_length; i++) {
            input_tokens[i] = i % model->vocab_size;
        }
        
        // Forward pass
        double batch_loss = cllm_forward_training(training, input_tokens);
        
        if (batch_loss >= 0.0) {
            total_loss += batch_loss;
            valid_batches++;
        }
        
        // Backward pass (gradient computation)
        // Note: This is handled by worker threads in the forward pass
        
        // Parameter update (optimizer step)
        // Note: This is also handled by worker threads
        
        free(input_tokens);
        
        // Print progress every 10 batches
        if ((batch_idx + 1) % 10 == 0) {
            double avg_loss = total_loss / valid_batches;
            printf("  Batch %u/%u - Loss: %.4f\n", 
                   batch_idx + 1, num_batches, avg_loss);
        }
    }
    
    // Calculate average loss
    double avg_loss = (valid_batches > 0) ? (total_loss / valid_batches) : -1.0;
    
    printf("Epoch complete - Average loss: %.4f\n", avg_loss);
    
    return avg_loss;
}

// ============================================================================
// MAIN TRAINING LOOP
// ============================================================================

/**
 * @brief Main training loop
 * 
 * Trains the model for the specified number of epochs.
 * Tracks loss and implements early stopping if loss doesn't improve.
 * 
 * @param training Training context
 * @return 0 on success, -1 on error
 */
int cllm_train(CLLMTraining* training) {
    if (!training || !training->model) {
        fprintf(stderr, "ERROR: Invalid training context\n");
        return -1;
    }
    
    CLLMModel* model = training->model;
    CLLMTrainingConfig* config = &training->config;
    
    printf("\n");
    printf("╔══════════════════════════════════════════════════════════╗\n");
    printf("║     88D Architecture Training                           ║\n");
    printf("╚══════════════════════════════════════════════════════════╝\n");
    printf("\n");
    
    // Print configuration
    printf("Configuration:\n");
    printf("  Epochs: %u\n", config->num_epochs);
    printf("  Batch size: %u\n", config->batch_size);
    printf("  Sequence length: %u\n", config->sequence_length);
    printf("  Learning rate: %.6f\n", config->learning_rate);
    printf("  Optimizer: %s\n", config->optimizer);
    printf("\n");
    
    // Initialize parameters if not already done
    printf("Initializing parameters...\n");
    int init_result = cllm_init_all_parameters(
        model, 
        model->embedding_dim, 
        model->hidden_dim
    );
    
    if (init_result != 0) {
        fprintf(stderr, "WARNING: Parameter initialization failed\n");
        // Continue anyway - parameters might already be initialized
    } else {
        printf("✓ Parameters initialized\n");
    }
    
    // Verify initialization
    int verify_result = cllm_verify_initialization(model);
    if (verify_result != 0) {
        fprintf(stderr, "WARNING: Parameter verification failed\n");
    }
    
    printf("\n");
    
    // Training loop
    double best_loss = 1e10;
    int epochs_without_improvement = 0;
    const int patience = 5;  // Early stopping patience
    
    for (uint32_t epoch = 0; epoch < config->num_epochs; epoch++) {
        printf("═══════════════════════════════════════════════════════════\n");
        printf("Epoch %u/%u\n", epoch + 1, config->num_epochs);
        printf("═══════════════════════════════════════════════════════════\n");
        
        // Train for one epoch
        double epoch_loss = cllm_train_epoch(training);
        
        if (epoch_loss < 0.0) {
            fprintf(stderr, "ERROR: Epoch %u failed\n", epoch + 1);
            return -1;
        }
        
        // Check for improvement
        if (epoch_loss < best_loss) {
            best_loss = epoch_loss;
            epochs_without_improvement = 0;
            printf("✓ New best loss: %.4f\n", best_loss);
        } else {
            epochs_without_improvement++;
            printf("  No improvement (patience: %d/%d)\n", 
                   epochs_without_improvement, patience);
        }
        
        // Early stopping
        if (epochs_without_improvement >= patience) {
            printf("\n");
            printf("Early stopping triggered (no improvement for %d epochs)\n", 
                   patience);
            break;
        }
        
        printf("\n");
    }
    
    // Training complete
    printf("═══════════════════════════════════════════════════════════\n");
    printf("Training Complete\n");
    printf("═══════════════════════════════════════════════════════════\n");
    printf("Best loss: %.4f\n", best_loss);
    printf("\n");
    
    return 0;
}