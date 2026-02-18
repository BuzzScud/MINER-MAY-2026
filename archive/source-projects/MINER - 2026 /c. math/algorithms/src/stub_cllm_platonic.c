/**
 * Stub for cllm_generate_platonic_solid when libcllm is not linked.
 * Allows libalgorithms to load for nonce/mining use without building CLLM.
 * Returns NULL; geometric_matrix code that uses it will get NULL and must handle it.
 */
#include "geometric_matrix.h"
#include "math/polytope.h"

PlatonicSolid* cllm_generate_platonic_solid(PlatonicSolidType solid) {
    (void)solid;
    return (PlatonicSolid*)0;
}
