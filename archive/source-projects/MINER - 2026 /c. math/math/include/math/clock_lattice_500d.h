/**
 * @file clock_lattice_500d.h
 * @brief 500-Dimensional Clock Lattice Operations
 *
 * Used to interpret the nonce search graph as a 500D embedding; partition and
 * order nonce search by quadrant. Full 32-bit nonce space is still covered
 * (thesis ch.15 unbiased search).
 */

#ifndef MATH_CLOCK_LATTICE_500D_H
#define MATH_CLOCK_LATTICE_500D_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CLOCK_LATTICE_500D_DIMS 500

/**
 * Dimensional frequencies for 500D clock lattice (first 500 primes).
 * Filled on first use; read-only thereafter.
 */
extern uint64_t CLOCK_LATTICE_FREQUENCIES_500D[CLOCK_LATTICE_500D_DIMS];

/**
 * Map single value (e.g. nonce) to 500D clock lattice position.
 * Uses base_angle = value * PI * PHI; position[d] = cos(base_angle * freq[d]) * phi^(d mod 5).
 *
 * @param value Input value (nonce, index, etc.)
 * @param position Output 500D position (must have room for 500 doubles)
 */
void clock_map_value_to_lattice_500d(uint64_t value, double position[CLOCK_LATTICE_500D_DIMS]);

/**
 * Quadrant from nonce for 4-worker partition.
 * base_angle = (nonce * PI * PHI) mod 2*PI; quadrant = floor(4 * base_angle / (2*PI)) mod 4.
 *
 * @param nonce 32-bit nonce
 * @return Quadrant 0..3 (Worker 0 = Q1, 1 = Q2, 2 = Q3, 3 = Q4)
 */
uint8_t clock_quadrant_from_nonce(uint32_t nonce);

/**
 * Euclidean distance in 500D (for future ordering by 500D distance).
 */
double math_distance_500d(const double pos1[CLOCK_LATTICE_500D_DIMS],
                          const double pos2[CLOCK_LATTICE_500D_DIMS]);

#ifdef __cplusplus
}
#endif

#endif /* MATH_CLOCK_LATTICE_500D_H */
