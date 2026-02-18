/**
 * @file clock_lattice_500d.c
 * @brief 500-Dimensional Clock Lattice Operations
 *
 * Mirrors clock_lattice_13d: base_angle = value * PI * PHI; position[d] =
 * cos(base_angle * freq[d]) * phi^(d % 5). Frequencies are first 500 primes
 * (deterministic, no external data).
 */

#include "math/clock_lattice_500d.h"
#include "math/transcendental.h"
#include <stdbool.h>
#include <string.h>

#ifndef MATH_PI
#define MATH_PI 3.14159265358979323846
#endif
#ifndef MATH_PHI
#define MATH_PHI 1.61803398874989484820
#endif
#ifndef MATH_TWO_PI
#define MATH_TWO_PI (2.0 * MATH_PI)
#endif

uint64_t CLOCK_LATTICE_FREQUENCIES_500D[CLOCK_LATTICE_500D_DIMS];

static bool frequencies_initialized = false;

static bool is_prime_simple(uint64_t n) {
    if (n < 2) return false;
    if (n == 2) return true;
    if (n % 2 == 0) return false;
    for (uint64_t p = 3; p * p <= n; p += 2)
        if (n % p == 0) return false;
    return true;
}

static void init_frequencies_500d(void) {
    if (frequencies_initialized) return;
    size_t count = 0;
    for (uint64_t n = 2; count < CLOCK_LATTICE_500D_DIMS; n++) {
        if (is_prime_simple(n)) {
            CLOCK_LATTICE_FREQUENCIES_500D[count++] = n;
        }
    }
    frequencies_initialized = true;
}

void clock_map_value_to_lattice_500d(uint64_t value, double position[CLOCK_LATTICE_500D_DIMS]) {
    init_frequencies_500d();
    double base_angle = (double)value * MATH_PI * MATH_PHI;
    while (base_angle < 0.0) base_angle += MATH_TWO_PI;
    while (base_angle >= MATH_TWO_PI) base_angle -= MATH_TWO_PI;
    for (int d = 0; d < CLOCK_LATTICE_500D_DIMS; d++) {
        double freq = (double)CLOCK_LATTICE_FREQUENCIES_500D[d];
        position[d] = math_cos(base_angle * freq) * math_pow(MATH_PHI, d % 5);
    }
}

uint8_t clock_quadrant_from_nonce(uint32_t nonce) {
    double base_angle = (double)nonce * MATH_PI * MATH_PHI;
    while (base_angle < 0.0) base_angle += MATH_TWO_PI;
    while (base_angle >= MATH_TWO_PI) base_angle -= MATH_TWO_PI;
    int q = (int)(4.0 * base_angle / MATH_TWO_PI);
    if (q >= 4) q = 3;
    if (q < 0) q = 0;
    return (uint8_t)(q % 4);
}

double math_distance_500d(const double pos1[CLOCK_LATTICE_500D_DIMS],
                          const double pos2[CLOCK_LATTICE_500D_DIMS]) {
    double sum = 0.0;
    for (int d = 0; d < CLOCK_LATTICE_500D_DIMS; d++) {
        double diff = pos1[d] - pos2[d];
        sum += diff * diff;
    }
    return math_sqrt(sum);
}
