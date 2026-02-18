/**
 * @file cllm_parameter_init.h
 * @brief Parameter initialization for geometric matrices
 */

#ifndef CLLM_PARAMETER_INIT_H
#define CLLM_PARAMETER_INIT_H

#include <stdint.h>

// Forward declarations
struct GeometricMatrix;
struct HierarchicalThread;

// CLLMModel is defined in ai/cllm.h - include that header to use these functions
struct CLLMModel;
struct CLLMConfig;

/**
 * @brief Initialization strategies
 */
typedef enum {
    INIT_XAVIER,    // Xavier/Glorot initialization (good for tanh/sigmoid)
    INIT_HE,        // He initialization (good for ReLU)
    INIT_UNIFORM,   // Uniform initialization
    INIT_ZEROS,     // Zero initialization
    INIT_ONES       // Ones initialization
} InitStrategy;

/**
 * @brief Initialize a geometric matrix with specified strategy
 * 
 * @param matrix Geometric matrix to initialize
 * @param strategy Initialization strategy
 * @param fan_in Number of input units
 * @param fan_out Number of output units
 * @return 0 on success, -1 on error
 */
int cllm_init_geometric_matrix(
    struct GeometricMatrix* matrix,
    InitStrategy strategy,
    uint32_t fan_in,
    uint32_t fan_out
);

/**
 * @brief Initialize all parameters for a thread
 * 
 * @param thread Thread to initialize
 * @param embedding_dim Embedding dimension
 * @param hidden_dim Hidden dimension
 * @return 0 on success, -1 on error
 */
int cllm_init_thread_parameters(
    struct HierarchicalThread* thread,
    uint32_t embedding_dim,
    uint32_t hidden_dim
);

/**
 * @brief Initialize all parameters in the model
 * 
 * Note: Include ai/cllm.h before this header to get CLLMModel definition
 * 
 * @param model Model to initialize
 * @param embedding_dim Embedding dimension
 * @param hidden_dim Hidden dimension
 * @return 0 on success, -1 on error
 */
int cllm_init_all_parameters(void* model, uint32_t embedding_dim, uint32_t hidden_dim);

/**
 * @brief Verify that all parameters are initialized
 * 
 * Note: Include ai/cllm.h before this header to get CLLMModel definition
 * 
 * @param model Model to verify
 * @return 0 if all initialized, -1 otherwise
 */
int cllm_verify_initialization(const void* model);

#endif // CLLM_PARAMETER_INIT_H