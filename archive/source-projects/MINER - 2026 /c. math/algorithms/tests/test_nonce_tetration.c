/**
 * @file test_nonce_tetration.c
 * @brief Pinpoint C nonce/tetration hang: full nonce, tetration-only, or abacus_mod_exp.
 *
 * Usage:
 *   ./test_nonce_tetration         -> full nonce_generate_deterministic(3, 24)
 *   ./test_nonce_tetration tetration -> clock_init + nonce_build_tetration_stack_abacus(5,3,UINT64_MAX)
 *   ./test_nonce_tetration mod_exp   -> direct abacus_mod_exp(5, 3125, 2^64)
 *
 * Link with libalgorithms and libcrystallinemath. Run with LD_LIBRARY_PATH/DYLD_LIBRARY_PATH
 * including . and ../math/lib (from algorithms dir).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "nonce_generation.h"
#include "math/clock.h"

static void run_full_nonce(void) {
    fprintf(stderr, "[test_nonce_tetration] full nonce: nonce_generate_deterministic(3, 24)\n");
    NonceConfig cfg;
    NonceResult res;
    nonce_config_init(&cfg, 3, 24);
    if (nonce_generate_deterministic(&cfg, &res)) {
        fprintf(stderr, "[test_nonce_tetration] OK nonce=%lu seed_prime=%lu\n",
                (unsigned long)res.nonce, (unsigned long)res.seed_prime);
    } else {
        fprintf(stderr, "[test_nonce_tetration] nonce_generate_deterministic returned false\n");
    }
}

static void run_tetration_only(void) {
    fprintf(stderr, "[test_nonce_tetration] tetration only: clock_init + nonce_build_tetration_stack_abacus(5, 3, UINT64_MAX)\n");
    ClockContext ctx;
    if (clock_init(&ctx) != MATH_SUCCESS) {
        fprintf(stderr, "[test_nonce_tetration] clock_init failed\n");
        return;
    }
    fprintf(stderr, "[test_nonce_tetration] clock_init OK, calling nonce_build_tetration_stack_abacus...\n");
    fflush(stderr);

    CrystallineAbacus* tet = nonce_build_tetration_stack_abacus(5, 3, UINT64_MAX, &ctx);
    clock_cleanup(&ctx);

    if (!tet) {
        fprintf(stderr, "[test_nonce_tetration] nonce_build_tetration_stack_abacus returned NULL\n");
        return;
    }
    uint64_t val;
    if (abacus_to_uint64(tet, &val) == MATH_SUCCESS) {
        fprintf(stderr, "[test_nonce_tetration] tetration OK value=%lu\n", (unsigned long)val);
    } else {
        fprintf(stderr, "[test_nonce_tetration] tetration OK but abacus_to_uint64 failed\n");
    }
    abacus_free(tet);
}

static void run_mod_exp_direct(void) {
    fprintf(stderr, "[test_nonce_tetration] mod_exp direct: 5^3125 mod 2^64\n");
    uint32_t base_val = 12;
    CrystallineAbacus* base = abacus_from_uint64(5, base_val);
    CrystallineAbacus* exp  = abacus_from_uint64(3125, base_val);
    CrystallineAbacus* mod = abacus_from_uint64(UINT64_MAX, base_val);
    CrystallineAbacus* result = abacus_new(base_val);

    if (!base || !exp || !mod || !result) {
        fprintf(stderr, "[test_nonce_tetration] abacus alloc failed\n");
        if (base) abacus_free(base);
        if (exp) abacus_free(exp);
        if (mod) abacus_free(mod);
        if (result) abacus_free(result);
        return;
    }
    fprintf(stderr, "[test_nonce_tetration] calling abacus_mod_exp...\n");
    fflush(stderr);

    MathError err = abacus_mod_exp(result, base, exp, mod);

    abacus_free(base);
    abacus_free(exp);
    abacus_free(mod);

    if (err != MATH_SUCCESS) {
        fprintf(stderr, "[test_nonce_tetration] abacus_mod_exp failed err=%d\n", (int)err);
        abacus_free(result);
        return;
    }
    uint64_t val;
    if (abacus_to_uint64(result, &val) == MATH_SUCCESS) {
        fprintf(stderr, "[test_nonce_tetration] abacus_mod_exp OK result=%lu\n", (unsigned long)val);
    } else {
        fprintf(stderr, "[test_nonce_tetration] abacus_mod_exp OK but to_uint64 failed\n");
    }
    abacus_free(result);
}

int main(int argc, char** argv) {
    const char* mode = (argc > 1) ? argv[1] : "full";

    if (strcmp(mode, "tetration") == 0) {
        run_tetration_only();
    } else if (strcmp(mode, "mod_exp") == 0) {
        run_mod_exp_direct();
    } else {
        run_full_nonce();
    }
    fprintf(stderr, "[test_nonce_tetration] done\n");
    return 0;
}
