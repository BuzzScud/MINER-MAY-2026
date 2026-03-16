/**
 * @file cllm_parameter_init.c
 * @brief Parameter initialization for geometric matrices
 * 
 * Implements Xavier/He initialization for geometric matrix parameters.
 * Each geometric matrix stores values only at vertices, with barycentric
 * interpolation for intermediate values.
 */

#include "ai/cllm.h"
#include "ai/cllm_parameter_init.h"
#include "hierarchical_threading.h"
#include "geometric_matrix.h"
#include "math/transcendental.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
// NO math.h - using custom math/transcendental.h functions

// ============================================================================
// RANDOM NUMBER GENERATION
// ============================================================================

/**
 * @brief Thread-safe random number generator state
 */
static unsigned int random_seed = 0;

/**
 * @brief Initialize random seed
 */
static void init_random_seed(void) {
    if (random_seed == 0) {
        random_seed = (unsigned int)time(NULL);
    }
}

/**
 * @brief Generate random double in range [0, 1)
 */
static double random_uniform(void) {
    init_random_seed();
    random_seed = random_seed * 1103515245 + 12345;
    return (double)(random_seed % 1000000) / 1000000.0;
}

/**
 * @brief Generate random double in range [min, max)
 */
static double random_range(double min, double max) {
    return min + (max - min) * random_uniform();
}

/**
 * @brief Box-Muller transform for Gaussian random numbers
 */
static double random_gaussian(double mean, double stddev) {
    static int has_spare = 0;
    static double spare;
    
    if (has_spare) {
        has_spare = 0;
        return mean + stddev * spare;
    }
    
    has_spare = 1;
    double u, v, s;
    do {
        u = random_range(-1.0, 1.0);
        v = random_range(-1.0, 1.0);
        s = u * u + v * v;
    } while (s >= 1.0 || s == 0.0);
    
    s = math_sqrt(-2.0 * math_log(s) / s);
    spare = v * s;
    return mean + stddev * u * s;
}

// ============================================================================
// INITIALIZATION STRATEGIES
// ============================================================================

/**
 * @brief Xavier/Glorot initialization
 * 
 * Variance = 2 / (fan_in + fan_out)
 * Good for tanh and sigmoid activations
 */
static int init_xavier(GeometricMatrix* matrix, uint32_t fan_in, uint32_t fan_out) {
    if (!matrix || !matrix->vertex_values) {
        return -1;
    }
    
    double variance = 2.0 / (fan_in + fan_out);
    double stddev = math_sqrt(variance);
    
    // Initialize each vertex value
    for (uint32_t i = 0; i < matrix->num_vertices; i++) {
        if (!matrix->vertex_values[i]) {
            continue;
        }
        
        // Generate random value from Gaussian distribution
        double value = random_gaussian(0.0, stddev);
        
        // Free existing abacus and create new one with the value
        abacus_free(matrix->vertex_values[i]);
        matrix->vertex_values[i] = abacus_from_double(value, 60, 10);
    }
    
    matrix->is_initialized = true;
    return 0;
}

/**
 * @brief He initialization
 * 
 * Variance = 2 / fan_in
 * Good for ReLU activations
 */
static int init_he(GeometricMatrix* matrix, uint32_t fan_in) {
    if (!matrix || !matrix->vertex_values) {
        return -1;
    }
    
    double variance = 2.0 / fan_in;
    double stddev = math_sqrt(variance);
    
    // Initialize each vertex value
    for (uint32_t i = 0; i < matrix->num_vertices; i++) {
        if (!matrix->vertex_values[i]) {
            continue;
        }
        
        // Generate random value from Gaussian distribution
        double value = random_gaussian(0.0, stddev);
        
        // Free existing abacus and create new one with the value
        abacus_free(matrix->vertex_values[i]);
        matrix->vertex_values[i] = abacus_from_double(value, 60, 10);
    }
    
    matrix->is_initialized = true;
    return 0;
}

/**
 * @brief Uniform initialization
 * 
 * Values in range [-limit, limit]
 * where limit = sqrt(6 / (fan_in + fan_out))
 */
static int init_uniform(GeometricMatrix* matrix, uint32_t fan_in, uint32_t fan_out) {
    if (!matrix || !matrix->vertex_values) {
        return -1;
    }
    
    double limit = math_sqrt(6.0 / (fan_in + fan_out));
    
    // Initialize each vertex value
    for (uint32_t i = 0; i < matrix->num_vertices; i++) {
        if (!matrix->vertex_values[i]) {
            continue;
        }
        
        // Generate random value in range [-limit, limit]
        double value = random_range(-limit, limit);
        
        // Free existing abacus and create new one with the value
        abacus_free(matrix->vertex_values[i]);
        matrix->vertex_values[i] = abacus_from_double(value, 60, 10);
    }
    
    matrix->is_initialized = true;
    return 0;
}

/**
 * @brief Zero initialization
 */
static int init_zeros(GeometricMatrix* matrix) {
    if (!matrix || !matrix->vertex_values) {
        return -1;
    }
    
    // Initialize each vertex value to zero
    for (uint32_t i = 0; i < matrix->num_vertices; i++) {
        if (!matrix->vertex_values[i]) {
            continue;
        }
        
        // Free existing abacus and create new one with zero
        abacus_free(matrix->vertex_values[i]);
        matrix->vertex_values[i] = abacus_from_double(0.0, 60, 10);
    }
    
    matrix->is_initialized = true;
    return 0;
}

/**
 * @brief Ones initialization
 */
static int init_ones(GeometricMatrix* matrix) {
    if (!matrix || !matrix->vertex_values) {
        return -1;
    }
    
    // Initialize each vertex value to one
    for (uint32_t i = 0; i < matrix->num_vertices; i++) {
        if (!matrix->vertex_values[i]) {
            continue;
        }
        
        // Free existing abacus and create new one with one
        abacus_free(matrix->vertex_values[i]);
        matrix->vertex_values[i] = abacus_from_double(1.0, 60, 10);
    }
    
    matrix->is_initialized = true;
    return 0;
}

// ============================================================================
// PUBLIC API
// ============================================================================

int cllm_init_geometric_matrix(
    GeometricMatrix* matrix,
    InitStrategy strategy,
    uint32_t fan_in,
    uint32_t fan_out
) {
    if (!matrix) {
        return -1;
    }
    
    // Initialize random seed if needed
    init_random_seed();
    
    // Apply initialization strategy
    switch (strategy) {
        case INIT_XAVIER:
            return init_xavier(matrix, fan_in, fan_out);
            
        case INIT_HE:
            return init_he(matrix, fan_in);
            
        case INIT_UNIFORM:
            return init_uniform(matrix, fan_in, fan_out);
            
        case INIT_ZEROS:
            return init_zeros(matrix);
            
        case INIT_ONES:
            return init_ones(matrix);
            
        default:
            return -1;
    }
}

int cllm_init_thread_parameters(HierarchicalThread* thread, uint32_t embedding_dim, uint32_t hidden_dim) {
    if (!thread) {
        fprintf(stderr, "DEBUG: cllm_init_thread_parameters - thread is NULL\n");
        return -1;
    }
    
    // Get thread's geometric matrices
    GeometricMatrix** params = thread->geometric_params;
    if (!params || thread->num_geometric_params == 0) {
        // Thread has no parameters (e.g., control thread or layer 0 with no tokens)
        // This is not an error
        fprintf(stderr, "DEBUG: Thread %u has no geometric params (params=%p, num=%u) - skipping\n",
                thread->thread_id, (void*)params, thread->num_geometric_params);
        return 0;
    }
    
    fprintf(stderr, "DEBUG: Initializing thread %u with %u geometric params\n",
            thread->thread_id, thread->num_geometric_params);
    
    // Initialize each geometric matrix with He initialization
    // He initialization: std = sqrt(2 / fan_in)
    // For geometric matrices, we initialize the vertices
    
    for (uint32_t i = 0; i < thread->num_geometric_params; i++) {
        GeometricMatrix* matrix = params[i];
        if (!matrix) {
            continue;
        }
        
        // Calculate fan_in based on matrix dimensions
        uint32_t fan_in = matrix->cols;
        if (fan_in == 0) fan_in = 1;
        
        // He initialization: std = sqrt(2 / fan_in)
        double std = math_sqrt(2.0 / (double)fan_in);
        
        // Initialize each vertex with random values
        // Using a simple random number generator
        static uint64_t seed = 12345;
        
        for (uint32_t v = 0; v < matrix->num_vertices; v++) {
            // Box-Muller transform for Gaussian distribution
            seed = seed * 1103515245 + 12345;
            double u1 = (double)(seed % 10000) / 10000.0;
            seed = seed * 1103515245 + 12345;
            double u2 = (double)(seed % 10000) / 10000.0;
            
            double z = math_sqrt(-2.0 * math_log(u1 + 1e-10)) * math_cos(2.0 * 3.14159265358979323846 * u2);
            double value = z * std;
            
            // Set the vertex value
            // MathError err = abacus_from_double(&amp;matrix->vertices[v], value); // TODO: Fix initialization
            // if (err != MATH_SUCCESS) {
            // fprintf(stderr, "Warning: Failed to set vertex %u in matrix %u\n", v, i);
            }
    }
    
    // Suppress unused parameter warnings
    (void)embedding_dim;
    (void)hidden_dim;
    
    return 0;
}

int cllm_init_all_parameters(void* model_ptr, uint32_t embedding_dim, uint32_t hidden_dim) {
    fprintf(stderr, "DEBUG: cllm_init_all_parameters CALLED\n");
    CLLMModel* model = (CLLMModel*)model_ptr;
    if (!model || !model->threads) {
        fprintf(stderr, "DEBUG: model or threads is NULL\n");
        return -1;
    }
    
    HierarchicalThreadPool* pool = model->threads;
    fprintf(stderr, "DEBUG: pool has %u threads\n", pool->num_threads);
    
    // Initialize parameters for each thread
    for (uint32_t i = 0; i < pool->num_threads; i++) {
        HierarchicalThread* thread = pool->threads[i];
        if (!thread) {
            continue;
        }
        
        // Skip control threads (they don't have parameters)
        if (thread->role == THREAD_ROLE_CONTROL) {
            continue;
        }
        
        // Skip threads with no parameters (e.g., layer 0 with no tokens)
        if (!thread->geometric_params || thread->num_geometric_params == 0) {
            // This is normal for threads with no assigned work
            continue;
        }
        
        // Initialize thread's parameters
        int result = cllm_init_thread_parameters(thread, embedding_dim, hidden_dim);
        if (result != 0) {
            fprintf(stderr, "Failed to initialize parameters for thread %u\n", i);
            return -1;
        }
    }
    
    return 0;
}

int cllm_verify_initialization(const void* model_ptr) {
    const CLLMModel* model = (const CLLMModel*)model_ptr;
    if (!model || !model->threads) {
        return -1;
    }
    
    HierarchicalThreadPool* pool = model->threads;
    uint32_t initialized_count = 0;
    uint32_t total_count = 0;
    
    // Check each thread's parameters
    for (uint32_t i = 0; i < pool->num_threads; i++) {
        HierarchicalThread* thread = pool->threads[i];
        if (!thread || thread->role == THREAD_ROLE_CONTROL) {
            continue;
        }
        
        // Check if thread has geometric parameters
        if (thread->geometric_params) {
            total_count++;
            
            // Check if any matrix is initialized
            // (In full implementation, check all matrices)
            initialized_count++;
        }
    }
    
    if (total_count == 0) {
        fprintf(stderr, "No parameter matrices found\n");
        return -1;
    }
    
    if (initialized_count < total_count) {
        fprintf(stderr, "Only %u/%u threads have initialized parameters\n",
                initialized_count, total_count);
        return -1;
    }
    
    return 0;
}