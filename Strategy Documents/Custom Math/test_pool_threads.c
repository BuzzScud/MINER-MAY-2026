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
    
    CLLMModel* model = cllm_create_model(&config);
    if (!model || !model->threads) {
        printf("Failed\n");
        return 1;
    }
    
    printf("Pool info:\n");
    printf("  num_threads: %u\n", model->threads->num_threads);
    printf("  max_threads: %u\n", model->threads->max_threads);
    printf("  num_logical_threads: %u\n", model->threads->num_logical_threads);
    printf("  num_physical_workers: %u\n", model->threads->num_physical_workers);
    
    cllm_free_model(model);
    return 0;
}
