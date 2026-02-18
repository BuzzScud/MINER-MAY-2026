/**
 * @file candidate_list_sphere.c
 * @brief Build thesis sphere-hopping candidate list (parity with bitcoin-miner.c).
 *
 * Uses create_sphere_hierarchy(2) from math/compact_vector (memory-hopping).
 * Same formula: 12 spheres, prime positions 1,5,7,11 get 40 steps else 35,
 * PHI offset, platonic_radius 500, base/recovery +/- 200, cap 1024.
 */

#include "candidate_list_sphere.h"
#include "math/compact_vector.h"
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#define SPHERE_PHI 1.618033988749895
#define PLATONIC_RADIUS 500
#define MAX_CANDIDATES 1024

/* Prime positions mod 12 for duality (1, 5, 7, 11). */
static bool is_prime_position(uint8_t pos) {
    uint8_t p = pos % 12;
    return (p == 1 || p == 5 || p == 7 || p == 11);
}

/* Add nonce to buffer if in range and not already present (simple linear scan for small n). */
static bool add_candidate(uint32_t n, uint32_t start_nonce, uint32_t end_nonce,
                         uint32_t* out, size_t* n_out, size_t max_count) {
    if (n < start_nonce || n >= end_nonce || *n_out >= max_count)
        return false;
    for (size_t i = 0; i < *n_out; i++) {
        if (out[i] == n) return false;
    }
    out[(*n_out)++] = n;
    return true;
}

int build_candidate_list_sphere(
    uint32_t base_nonce,
    uint32_t recovery_nonce,
    uint32_t start_nonce,
    uint32_t end_nonce,
    uint32_t* out,
    size_t max_count,
    size_t* count
) {
    if (!out || !count || max_count == 0)
        return -1;
    *count = 0;

    uint32_t nonce_range = end_nonce - start_nonce;
    uint32_t sphere_size = (nonce_range / 12) > 0 ? (nonce_range / 12) : 1;

    add_candidate(base_nonce, start_nonce, end_nonce, out, count, max_count);
    add_candidate(recovery_nonce, start_nonce, end_nonce, out, count, max_count);

    CompactSphere* root = create_sphere_hierarchy(2);
    if (root) {
        for (int s = 0; s < 12 && *count < max_count; s++) {
            uint32_t sphere_base = start_nonce + (uint32_t)((s * sphere_size) % nonce_range);
            if (sphere_base >= end_nonce) sphere_base = start_nonce;
            bool prime_pos = is_prime_position((uint8_t)s);
            int steps = prime_pos ? 40 : 35;
            for (int i = 0; i < steps && *count < max_count; i++) {
                uint32_t offset = (uint32_t)((double)i * SPHERE_PHI) % PLATONIC_RADIUS;
                if (sphere_base + offset < end_nonce)
                    add_candidate(sphere_base + offset, start_nonce, end_nonce, out, count, max_count);
                if (offset > 0 && sphere_base >= offset)
                    add_candidate(sphere_base - offset, start_nonce, end_nonce, out, count, max_count);
            }
        }
        free_sphere_hierarchy(root);
    }
    for (int off = -200; off <= 200 && *count < max_count; off++) {
        add_candidate(base_nonce + off, start_nonce, end_nonce, out, count, max_count);
        add_candidate(recovery_nonce + off, start_nonce, end_nonce, out, count, max_count);
    }
    return 0;
}
