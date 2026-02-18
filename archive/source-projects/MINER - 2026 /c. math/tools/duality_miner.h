/**
 * Minimal duality declarations for bitcoin-miner (avoids PlatonicSolid conflict)
 */
#ifndef DUALITY_MINER_H
#define DUALITY_MINER_H

#include <stdint.h>
#include <stdbool.h>

typedef struct {
    uint8_t position;
    uint8_t quadrant;
    double angle;
    bool is_folded;
    uint8_t source_quad;
} DualityClockPosition;

DualityClockPosition clock_position_create(uint8_t position);
DualityClockPosition fold_to_q1(DualityClockPosition pos);
bool is_prime_position(uint8_t pos);

#endif
