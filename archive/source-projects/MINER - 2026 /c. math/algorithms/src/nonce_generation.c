/**
 * @file nonce_generation.c
 * @brief Implementation of deterministic nonce generation
 * 
 * REDESIGNED: Uses CrystallineAbacus for arbitrary precision
 * NO uint64 helpers - Pure NEW math library
 */

#include "nonce_generation.h"
#include "symbolic_field_theory.h"
#include "mathematical_formulas.h"
#include "math/abacus.h"
#include "math/abacus88d.h"
#include "math/types.h"
#include "math/clock.h"
#include <stdlib.h>
#include <string.h>

void nonce_config_init(NonceConfig* config, uint64_t block_height, 
                       uint32_t difficulty_bits) {
    if (config == NULL) return;
    
    config->block_height = block_height;
    config->difficulty_bits = difficulty_bits;
    config->tetration_depth = 3;        // Standard depth
    config->max_reassessments = 5;      // Up to 5 attempts
    config->entropy_cut_min = 0.18;     // 18% minimum reduction
    config->entropy_cut_max = 0.45;     // 45% maximum reduction
}

/**
 * Select 88D layer by tetration value magnitude (per integration plan)
 */
uint8_t nonce_select_layer(uint64_t tetration_value) {
    if (tetration_value < 1000ULL) return 0;
    if (tetration_value < 1000000ULL) return 1;
    if (tetration_value < 1000000000ULL) return 2;
    if (tetration_value < 1000000000000ULL) return 3;
    if (tetration_value < 1000000000000000ULL) return 4;
    if (tetration_value < 1000000000000000000ULL) return 5;
    return 6;
}

/**
 * Select 88D dimension from block height (clock position 1-11)
 */
uint8_t nonce_select_dimension(uint64_t block_height) {
    static const uint8_t pos_to_dim[] = {1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
    return pos_to_dim[block_height % 12];
}

bool nonce_generate_deterministic(const NonceConfig* config, NonceResult* result) {
    return nonce_generate_unified(config, result, NULL);
}

bool nonce_generate_unified(const NonceConfig* config, NonceResult* result, void* abacus88d_ctx) {
    if (config == NULL || result == NULL) {
        return false;
    }
    
    memset(result, 0, sizeof(NonceResult));
    result->success = false;
    
    /* Step 1: Try Clock Lattice O(1) first, then SFT fallback */
    uint64_t seed_prime = 0;
    ClockContext ctx;
    clock_init(&ctx);
    ClockPosition pos;
    uint64_t magnitude = 0;
    
    if (clock_map_block_height_to_position(config->block_height, &pos, &magnitude) == MATH_SUCCESS) {
        /* O(1) works for positions 3, 6, 9 (primes mod 12) */
        seed_prime = clock_generate_prime_o1(0, pos.position, magnitude, &ctx);
    }
    
    if (seed_prime == 0) {
        /* SFT fallback */
        uint64_t primes[100];
        size_t prime_count = 0;
        prime_count = sft_deterministic_prime_map(
            config->block_height,
            config->block_height + 10000,
            primes,
            100
        );
        
        if (prime_count == 0) {
            uint64_t candidate = config->block_height < 2 ? 2 : config->block_height;
            while (candidate < config->block_height + 10000) {
                bool is_prime = (candidate <= 3) ||
                    ((candidate % 2 != 0) && (candidate % 3 != 0));
                if (is_prime && candidate > 3) {
                    for (uint64_t i = 5; i * i <= candidate; i += 6) {
                        if (candidate % i == 0 || candidate % (i + 2) == 0) {
                            is_prime = false;
                            break;
                        }
                    }
                }
                if (is_prime) {
                    primes[0] = candidate;
                    prime_count = 1;
                    break;
                }
                candidate++;
            }
        }
        if (prime_count > 0) {
            seed_prime = primes[0];
        }
    }
    
    if (seed_prime == 0) {
        clock_cleanup(&ctx);
        return false;
    }
    result->seed_prime = seed_prime;
    
    /* Step 2: Build tetration stack using Abacus */
    uint64_t modulus = UINT64_MAX;
    CrystallineAbacus* tetration_value = nonce_build_tetration_stack_abacus(
        result->seed_prime,
        config->tetration_depth,
        modulus,
        &ctx
    );
    
    if (!tetration_value) {
        clock_cleanup(&ctx);
        return false;
    }
    
    /* Store in Abacus88D when provided */
    if (abacus88d_ctx) {
        Abacus88D* abacus88d = (Abacus88D*)abacus88d_ctx;
        uint64_t tetration_uint64;
        if (abacus_to_uint64(tetration_value, &tetration_uint64) == MATH_SUCCESS) {
            uint8_t layer = nonce_select_layer(tetration_uint64);
            uint8_t dim_val = nonce_select_dimension(config->block_height);
            uint8_t dim_idx = (dim_val > 0) ? (dim_val - 1) : 0;
            if (dim_idx < 11) {
                (void)abacus88d_set(abacus88d, layer, dim_idx, tetration_value);
            }
        }
    }
    
    /* Convert back to uint64 for compatibility with existing code */
    uint64_t tetration_uint64;
    MathError err = abacus_to_uint64(tetration_value, &tetration_uint64);
    abacus_free(tetration_value);
    
    if (err != MATH_SUCCESS) {
        clock_cleanup(&ctx);
        return false;
    }
    
    // Step 3: Apply entropy reduction based on difficulty
    uint64_t nonce_candidate = nonce_apply_difficulty_bounds(
        tetration_uint64,
        config->difficulty_bits,
        config->entropy_cut_min,
        config->entropy_cut_max
    );
    
    // Step 4: Validate and reassess if needed
    result->reassessments = 0;
    result->nonce = nonce_candidate;
    
    while (result->reassessments < config->max_reassessments) {
        if (nonce_validate_difficulty(result->nonce, config->difficulty_bits)) {
            result->success = true;
            result->final_entropy = nonce_calculate_entropy_reduction(
                config->difficulty_bits,
                config->entropy_cut_min,
                config->entropy_cut_max
            );
            clock_cleanup(&ctx);
            return true;
        }
        
        // Reassess with adjusted parameters
        result->reassessments++;
        result->nonce = nonce_reassess(config, result->reassessments, result->nonce);
    }
    
    clock_cleanup(&ctx);
    
    // If we get here, we failed to find valid nonce within max reassessments
    // Return the best candidate we have
    result->success = false;
    return false;
}

/**
 * @brief Build tetration stack using CrystallineAbacus
 * 
 * Computes seed_prime^(seed_prime^(seed_prime^...)) (depth times) mod modulus
 * Uses arbitrary precision to handle large intermediate values
 */
CrystallineAbacus* nonce_build_tetration_stack_abacus(uint64_t seed_prime, 
                                                       uint32_t depth,
                                                       uint64_t modulus,
                                                       ClockContext* ctx) {
    if (depth == 0 || seed_prime == 0 || !ctx) {
        return NULL;
    }
    
    // Create Abacus values (FIXED: use abacus_from_uint64, not abacus_create_from_uint64)
    (void)ctx;  // Suppress unused parameter warning
    CrystallineAbacus* base = abacus_from_uint64(seed_prime, 12);
    CrystallineAbacus* mod_abacus = abacus_from_uint64(modulus, 12);
    CrystallineAbacus* result = abacus_from_uint64(seed_prime, 12);
    CrystallineAbacus* temp = abacus_from_uint64(0, 12);
    
    if (!base || !mod_abacus || !result || !temp) {
        if (base) abacus_free(base);
        if (mod_abacus) abacus_free(mod_abacus);
        if (result) abacus_free(result);
        if (temp) abacus_free(temp);
        return NULL;
    }
    
    if (depth == 1) {
        // result = seed_prime % modulus
        MathError err = abacus_mod(result, base, mod_abacus);
        abacus_free(base);
        abacus_free(mod_abacus);
        abacus_free(temp);
        
        if (err != MATH_SUCCESS) {
            abacus_free(result);
            return NULL;
        }
        return result;
    }
    
    // Build stack iteratively: result = base^result (mod modulus)
    for (uint32_t i = 1; i < depth; i++) {
        // temp = base^result (mod modulus)
        MathError err = abacus_mod_exp(temp, base, result, mod_abacus);
        if (err != MATH_SUCCESS) {
            abacus_free(base);
            abacus_free(mod_abacus);
            abacus_free(result);
            abacus_free(temp);
            return NULL;
        }
        
        // result = temp (FIXED: abacus_copy returns new copy, doesn't modify in place)
        abacus_free(result);
        result = abacus_copy(temp);
    }
    
    abacus_free(base);
    abacus_free(mod_abacus);
    abacus_free(temp);
    
    return result;
}

/**
 * @brief Legacy wrapper for compatibility
 * 
 * This will be removed once all code is migrated
 */
uint64_t nonce_build_tetration_stack(uint64_t seed_prime, uint32_t depth,
                                      uint64_t modulus) {
    ClockContext ctx;
    clock_init(&ctx);
    
    CrystallineAbacus* result = nonce_build_tetration_stack_abacus(
        seed_prime, depth, modulus, &ctx
    );
    
    if (!result) {
        clock_cleanup(&ctx);
        return 0;
    }
    
    uint64_t result_uint64;
    MathError err = abacus_to_uint64(result, &result_uint64);
    abacus_free(result);
    clock_cleanup(&ctx);
    
    if (err != MATH_SUCCESS) {
        return 0;
    }
    
    return result_uint64;
}

uint64_t nonce_apply_difficulty_bounds(uint64_t tetration_value,
                                        uint32_t difficulty_bits,
                                        double entropy_cut_min,
                                        double entropy_cut_max) {
    if (difficulty_bits == 0 || difficulty_bits > 64) {
        return tetration_value;
    }
    
    // Calculate entropy reduction factor
    double entropy_factor = entropy_cut_min + 
        (entropy_cut_max - entropy_cut_min) * ((double)difficulty_bits / 64.0);
    
    // Apply entropy reduction
    uint64_t mask = (1ULL << difficulty_bits) - 1;
    uint64_t reduced = tetration_value & mask;
    
    // Apply entropy factor
    reduced = (uint64_t)((double)reduced * (1.0 - entropy_factor));
    
    return reduced;
}

bool nonce_validate_difficulty(uint64_t nonce, uint32_t difficulty_bits) {
    if (difficulty_bits == 0 || difficulty_bits > 64) {
        return true;
    }
    
    // Count leading zeros
    uint32_t leading_zeros = 0;
    uint64_t mask = 1ULL << 63;
    
    while (leading_zeros < 64 && !(nonce & mask)) {
        leading_zeros++;
        mask >>= 1;
    }
    
    return leading_zeros >= difficulty_bits;
}

double nonce_calculate_entropy_reduction(uint32_t difficulty_bits,
                                         double entropy_cut_min,
                                         double entropy_cut_max) {
    if (difficulty_bits == 0 || difficulty_bits > 64) {
        return 0.0;
    }
    
    return entropy_cut_min + 
        (entropy_cut_max - entropy_cut_min) * ((double)difficulty_bits / 64.0);
}

uint64_t nonce_reassess(const NonceConfig* config, uint32_t attempt, 
                        uint64_t previous_nonce) {
    if (!config) return previous_nonce;
    
    // Adjust nonce based on attempt number
    // Use a deterministic but varying adjustment
    uint64_t adjustment = (uint64_t)attempt * config->block_height;
    
    return previous_nonce ^ adjustment;
}