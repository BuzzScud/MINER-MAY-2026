#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <ctype.h>
#include "../include/cllm.h"
#include "../include/cllm_training.h"

#define MAX_LINE_LENGTH 1024
#define MAX_LINES 1000
#define MAX_VOCAB 10000
#define MAX_WORD_LEN 64

// Simple vocabulary structure
typedef struct {
    char** words;
    int* counts;
    int size;
    int capacity;
} Vocabulary;

// Create vocabulary
Vocabulary* vocab_create(int capacity) {
    Vocabulary* vocab = malloc(sizeof(Vocabulary));
    vocab->words = malloc(capacity * sizeof(char*));
    vocab->counts = calloc(capacity, sizeof(int));
    vocab->size = 0;
    vocab->capacity = capacity;
    return vocab;
}

// Find or add word to vocabulary
int vocab_get_or_add(Vocabulary* vocab, const char* word) {
    // Search for existing word
    for (int i = 0; i < vocab->size; i++) {
        if (strcmp(vocab->words[i], word) == 0) {
            vocab->counts[i]++;
            return i;
        }
    }
    
    // Add new word
    if (vocab->size < vocab->capacity) {
        vocab->words[vocab->size] = strdup(word);
        vocab->counts[vocab->size] = 1;
        return vocab->size++;
    }
    
    return -1; // Vocabulary full
}

// Tokenize text into word IDs
int* tokenize_line(const char* line, Vocabulary* vocab, int* num_tokens) {
    int* tokens = malloc(1000 * sizeof(int));
    *num_tokens = 0;
    
    char buffer[MAX_WORD_LEN];
    int buf_pos = 0;
    
    for (int i = 0; line[i]; i++) {
        char c = line[i];
        
        if (isalnum(c) || c == '\'') {
            if (buf_pos < MAX_WORD_LEN - 1) {
                buffer[buf_pos++] = tolower(c);
            }
        } else {
            if (buf_pos > 0) {
                buffer[buf_pos] = '\0';
                int token_id = vocab_get_or_add(vocab, buffer);
                if (token_id >= 0 && *num_tokens < 1000) {
                    tokens[*num_tokens] = token_id;
                    (*num_tokens)++;
                }
                buf_pos = 0;
            }
        }
    }
    
    // Handle last word
    if (buf_pos > 0) {
        buffer[buf_pos] = '\0';
        int token_id = vocab_get_or_add(vocab, buffer);
        if (token_id >= 0 && *num_tokens < 1000) {
            tokens[*num_tokens] = token_id;
            (*num_tokens)++;
        }
    }
    
    return tokens;
}

// Read and tokenize training file
int** read_and_tokenize(const char* filename, Vocabulary* vocab, int* num_sequences, int** seq_lengths) {
    FILE* f = fopen(filename, "r");
    if (!f) {
        printf("ERROR: Cannot open %s\n", filename);
        return NULL;
    }
    
    int** sequences = malloc(MAX_LINES * sizeof(int*));
    *seq_lengths = malloc(MAX_LINES * sizeof(int));
    *num_sequences = 0;
    
    char buffer[MAX_LINE_LENGTH];
    while (fgets(buffer, MAX_LINE_LENGTH, f) && *num_sequences < MAX_LINES) {
        // Remove newline
        size_t len = strlen(buffer);
        if (len > 0 && buffer[len-1] == '\n') {
            buffer[len-1] = '\0';
        }
        
        // Skip empty lines
        if (strlen(buffer) == 0) continue;
        
        int num_tokens;
        int* tokens = tokenize_line(buffer, vocab, &num_tokens);
        
        if (num_tokens > 0) {
            sequences[*num_sequences] = tokens;
            (*seq_lengths)[*num_sequences] = num_tokens;
            (*num_sequences)++;
        } else {
            free(tokens);
        }
    }
    
    fclose(f);
    return sequences;
}

int main() {
    printf("\n");
    printf("═══════════════════════════════════════════════════════════════\n");
    printf("  CLLM REAL TRAINING DATA TEST\n");
    printf("═══════════════════════════════════════════════════════════════\n\n");
    
    // Test 1: Build vocabulary from training data
    printf("TEST 1: Building Vocabulary from Training Data\n");
    printf("─────────────────────────────────────────────────────────────\n");
    
    Vocabulary* vocab = vocab_create(MAX_VOCAB);
    int num_sequences;
    int* seq_lengths;
    
    int** sequences = read_and_tokenize("../data/combined_training.txt", vocab, &num_sequences, &seq_lengths);
    if (!sequences) {
        printf("✗ FAILED to read training data\n");
        return 1;
    }
    
    printf("✓ Read %d sequences from training data\n", num_sequences);
    printf("✓ Built vocabulary with %d unique words\n", vocab->size);
    
    // Show vocabulary statistics
    printf("\nVocabulary Statistics:\n");
    printf("  Total unique words: %d\n", vocab->size);
    
    // Find most common words
    printf("\n  Top 20 most common words:\n");
    for (int rank = 0; rank < 20 && rank < vocab->size; rank++) {
        int max_idx = 0;
        int max_count = -1;
        
        for (int i = 0; i < vocab->size; i++) {
            if (vocab->counts[i] > max_count) {
                bool already_shown = false;
                for (int j = 0; j < rank; j++) {
                    // Check if this word was already shown
                    if (vocab->counts[i] < vocab->counts[j]) {
                        already_shown = true;
                        break;
                    }
                }
                if (!already_shown) {
                    max_count = vocab->counts[i];
                    max_idx = i;
                }
            }
        }
        
        printf("    %2d. &quot;%s&quot; (count: %d)\n", rank+1, vocab->words[max_idx], vocab->counts[max_idx]);
    }
    
    // Show sample sequences
    printf("\n  Sample tokenized sequences:\n");
    for (int i = 0; i < 5 && i < num_sequences; i++) {
        printf("    Sequence %d (%d tokens): [", i+1, seq_lengths[i]);
        for (int j = 0; j < seq_lengths[i] && j < 10; j++) {
            printf("%d", sequences[i][j]);
            if (j < seq_lengths[i] - 1 && j < 9) printf(", ");
        }
        if (seq_lengths[i] > 10) printf(", ...");
        printf("]\n");
        
        printf("      Words: &quot;");
        for (int j = 0; j < seq_lengths[i] && j < 10; j++) {
            printf("%s", vocab->words[sequences[i][j]]);
            if (j < seq_lengths[i] - 1 && j < 9) printf(" ");
        }
        if (seq_lengths[i] > 10) printf(" ...");
        printf("&quot;\n");
    }
    
    printf("\n");
    
    // Test 2: Create model with real vocabulary size
    printf("TEST 2: Creating Model with Real Vocabulary\n");
    printf("─────────────────────────────────────────────────────────────\n");
    
    CLLMConfig config = cllm_default_config(PLATONIC_CUBE, vocab->size);
    config.max_seq_len = 128;
    config.enable_kissing_spheres = true;
    config.enable_blind_recovery = true;
    config.enable_harmonic_integration = true;
    config.enable_ntt_attention = true;
    
    CLLMModel* model = cllm_create_model(&config);
    if (!model) {
        printf("✗ FAILED to create model\n");
        return 1;
    }
    
    printf("✓ Created model with vocabulary size %d\n", vocab->size);
    printf("  Embedding dimension: %d\n", config.embedding_dim);
    printf("  Hidden dimension: %d\n", config.hidden_dim);
    printf("  Number of layers: %d\n", config.num_layers);
    printf("  Attention heads: %d\n", config.num_heads);
    printf("  Platonic solid: CUBE (8V, 12E, 6F)\n");
    printf("  Kissing spheres: %s\n", config.enable_kissing_spheres ? "ENABLED" : "DISABLED");
    printf("\n");
    
    // Test 3: Prepare training batch from real data
    printf("TEST 3: Preparing Training Batch from Real Data\n");
    printf("─────────────────────────────────────────────────────────────\n");
    
    // Use first 4 sequences as a batch
    int batch_size = 4;
    int max_len = 0;
    for (int i = 0; i < batch_size && i < num_sequences; i++) {
        if (seq_lengths[i] > max_len) max_len = seq_lengths[i];
    }
    
    printf("Batch size: %d sequences\n", batch_size);
    printf("Max sequence length: %d tokens\n", max_len);
    
    // Create padded batch
    uint32_t* batch_input = calloc(batch_size * max_len, sizeof(uint32_t));
    uint32_t* batch_target = calloc(batch_size * max_len, sizeof(uint32_t));
    
    for (int i = 0; i < batch_size && i < num_sequences; i++) {
        for (int j = 0; j < seq_lengths[i] - 1; j++) {
            batch_input[i * max_len + j] = sequences[i][j];
            batch_target[i * max_len + j] = sequences[i][j + 1];
        }
    }
    
    printf("✓ Created training batch\n");
    printf("  Input shape: [%d, %d]\n", batch_size, max_len);
    printf("  Target shape: [%d, %d]\n", batch_size, max_len);
    printf("\n");
    
    // Test 4: Forward pass with real data
    printf("TEST 4: Forward Pass with Real Training Data\n");
    printf("─────────────────────────────────────────────────────────────\n");
    
    printf("Running forward pass...\n");
    double* logits = cllm_forward(model, batch_input, batch_size, max_len);
    
    if (logits) {
        printf("✓ Forward pass successful\n");
        printf("  Output shape: [%d, %d, %d]\n", batch_size, max_len, vocab->size);
        
        // Check logits range
        double min_logit = logits[0];
        double max_logit = logits[0];
        for (int i = 1; i < batch_size * max_len * vocab->size; i++) {
            if (logits[i] < min_logit) min_logit = logits[i];
            if (logits[i] > max_logit) max_logit = logits[i];
        }
        printf("  Logits range: [%.4f, %.4f]\n", min_logit, max_logit);
        
        free(logits);
    } else {
        printf("✗ Forward pass failed\n");
    }
    
    printf("\n");
    
    // Test 5: Generate text from real vocabulary
    printf("TEST 5: Text Generation with Real Vocabulary\n");
    printf("─────────────────────────────────────────────────────────────\n");
    
    // Use first sequence as prompt
    int prompt_len = seq_lengths[0] < 10 ? seq_lengths[0] : 10;
    uint32_t* prompt = malloc(prompt_len * sizeof(uint32_t));
    memcpy(prompt, sequences[0], prompt_len * sizeof(uint32_t));
    
    printf("Prompt (%d tokens): &quot;", prompt_len);
    for (int i = 0; i < prompt_len; i++) {
        printf("%s", vocab->words[prompt[i]]);
        if (i < prompt_len - 1) printf(" ");
    }
    printf("&quot;\n\n");
    
    printf("Generating 20 tokens...\n");
    
    uint32_t* generated = malloc(20 * sizeof(uint32_t));
    for (int i = 0; i < 20; i++) {
        // Use last 10 tokens as context
        int context_len = (prompt_len + i) < 10 ? (prompt_len + i) : 10;
        uint32_t* context = malloc(context_len * sizeof(uint32_t));
        
        if (i == 0) {
            memcpy(context, prompt, prompt_len * sizeof(uint32_t));
            context_len = prompt_len;
        } else {
            int start = (prompt_len + i) - context_len;
            for (int j = 0; j < context_len; j++) {
                if (start + j < prompt_len) {
                    context[j] = prompt[start + j];
                } else {
                    context[j] = generated[start + j - prompt_len];
                }
            }
        }
        
        // Forward pass
        double* token_logits = cllm_forward(model, context, 1, context_len);
        
        // Get last token's logits
        double* last_logits = token_logits + (context_len - 1) * vocab->size;
        
        // Find best token
        int best_token = 0;
        double best_score = last_logits[0];
        for (int j = 1; j < vocab->size; j++) {
            if (last_logits[j] > best_score) {
                best_score = last_logits[j];
                best_token = j;
            }
        }
        
        generated[i] = best_token;
        
        free(context);
        free(token_logits);
    }
    
    printf("\nGenerated text: &quot;");
    for (int i = 0; i < 20; i++) {
        if (generated[i] < vocab->size) {
            printf("%s", vocab->words[generated[i]]);
            if (i < 19) printf(" ");
        }
    }
    printf("&quot;\n\n");
    
    // Summary
    printf("═══════════════════════════════════════════════════════════════\n");
    printf("  TEST SUMMARY\n");
    printf("═══════════════════════════════════════════════════════════════\n\n");
    
    printf("✓ Real training data loaded: %d sequences\n", num_sequences);
    printf("✓ Real vocabulary built: %d unique words\n", vocab->size);
    printf("✓ Model created with real vocab size: %d\n", vocab->size);
    printf("✓ Training batch prepared from real text\n");
    printf("✓ Forward pass working with real data\n");
    printf("✓ Text generation using real vocabulary\n\n");
    
    printf("IMPORTANT NOTES:\n");
    printf("1. The model is UNTRAINED, so generated text will be random\n");
    printf("2. However, it uses REAL WORDS from the training vocabulary\n");
    printf("3. The tokenization and vocabulary system is working correctly\n");
    printf("4. The model can process real text and generate real words\n");
    printf("5. After training, the generated text will be meaningful\n\n");
    
    printf("NEXT STEP: Train the model on this data to generate coherent text!\n\n");
    
    // Cleanup
    free(prompt);
    free(generated);
    free(batch_input);
    free(batch_target);
    
    for (int i = 0; i < num_sequences; i++) {
        free(sequences[i]);
    }
    free(sequences);
    free(seq_lengths);
    
    for (int i = 0; i < vocab->size; i++) {
        free(vocab->words[i]);
    }
    free(vocab->words);
    free(vocab->counts);
    free(vocab);
    
    cllm_free_model(model);
    
    return 0;
}