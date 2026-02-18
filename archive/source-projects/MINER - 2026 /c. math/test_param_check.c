#include <stdio.h>
#include "cllm.h"
#include "hierarchical_threading.h"

int main() {
    CLLMConfig config = {
        .vocab_size = 100,
        .embedding_dim = 24,
        .hidden_dim = 96,
        .num_layers = 2,
        .num_heads = 12,
        .max_seq_len = 16
    };
    
    printf("Creating model...\n");
    CLLMModel* model = cllm_create_model(&config);
    if (!model) {
        printf("Failed to create model\n");
        return 1;
    }
    
    printf("Model created successfully\n");
    printf("Checking thread parameters...\n");
    
    if (!model->threads) {
        printf("No thread pool!\n");
        return 1;
    }
    
    printf("Thread pool exists with %u threads\n", model->threads->max_threads);
    
    // Check first few threads
    for (uint32_t i = 0; i < 5 && i < model->threads->max_threads; i++) {
        HierarchicalThread* thread = model->threads->threads[i];
        if (thread) {
            printf("Thread %u: geometric_params=%p, num_geometric_params=%u\n",
                   i, (void*)thread->geometric_params, thread->num_geometric_params);
        } else {
            printf("Thread %u: NULL\n", i);
        }
    }
    
    cllm_free_model(model);
    printf("Test complete\n");
    return 0;
}
