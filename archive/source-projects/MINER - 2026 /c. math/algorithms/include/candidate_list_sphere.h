/**
 * @file candidate_list_sphere.h
 * @brief Build thesis sphere-hopping candidate list (C miner parity).
 *
 * Same formula as bitcoin-miner.c: create_sphere_hierarchy(2), 12 spheres,
 * duality prime positions, golden-ratio offset, cap 1024.
 */

#ifndef CANDIDATE_LIST_SPHERE_H
#define CANDIDATE_LIST_SPHERE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Build candidate nonces using sphere hopping (memory-hopping hierarchy).
 * Writes up to max_count candidates into out; sets *count to number written.
 * Returns 0 on success, -1 if hierarchy or buffer fails.
 */
int build_candidate_list_sphere(
    uint32_t base_nonce,
    uint32_t recovery_nonce,
    uint32_t start_nonce,
    uint32_t end_nonce,
    uint32_t* out,
    size_t max_count,
    size_t* count
);

#ifdef __cplusplus
}
#endif

#endif /* CANDIDATE_LIST_SPHERE_H */
