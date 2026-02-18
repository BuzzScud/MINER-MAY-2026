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
    
    printf("Checking thread [0][0]...\n");
    HierarchicalThread* thread0 = hierarchical_thread_get(model->threads, 0, 0);
    if (thread0) {
        printf("Thread [0][0] exists\n");
        printf("  geometric_params: %p\n", (void*)thread0->geometric_params);
        printf("  num_geometric_params: %u\n", thread0->num_geometric_params);
        printf("  num_parameters: %u\n", thread0->num_parameters);
        printf("  role: %d\n", thread0->role);
        
        // Check token assignment
        uint32_t thread_idx = 0 * 12 + 0;
        printf("  tokens_assigned: %u\n", model->thread_params[thread_idx].num_tokens_assigned);
    }
    
    cllm_free_model(model);
    return 0;
}
