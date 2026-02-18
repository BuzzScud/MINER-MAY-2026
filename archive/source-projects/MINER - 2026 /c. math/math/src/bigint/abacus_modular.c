/**
 * @file abacus_modular.c
 * @brief Modular arithmetic operations for Crystalline Abacus
 * 
 * ⚠️ CRITICAL: ALL WORK MUST USE THE 'audit' FEATURE BRANCH ⚠️
 * 
 * Implements modular arithmetic on the clock lattice using geometric operations.
 * This is the pure crystalline approach - no BigInt arrays, just geometric transformations.
 */

#include "math/abacus.h"
#include "math/arithmetic.h"
#include <stdlib.h>
#include <stdint.h>

/* ============================================================================
 * 64-BIT FAST PATH HELPERS (avoid abacus loop hang for tetration case)
 * ============================================================================ */

#if defined(__SIZEOF_INT128__) && __SIZEOF_INT128__ >= 16
/* GCC/Clang: use __uint128_t for (a * b) % m without overflow */
static uint64_t mul_mod64(uint64_t a, uint64_t b, uint64_t m) {
    if (m == 0) return 0;
    return (uint64_t)(((__uint128_t)a * (__uint128_t)b) % (__uint128_t)m);
}
#else
/* Portable fallback: avoid overflow by splitting */
static uint64_t mul_mod64(uint64_t a, uint64_t b, uint64_t m) {
    if (m == 0) return 0;
    uint64_t r = 0;
    a %= m;
    b %= m;
    while (b) {
        if (b & 1) {
            r += a;
            if (r >= m) r -= m;
        }
        a <<= 1;
        if (a >= m) a -= m;
        b >>= 1;
    }
    return r;
}
#endif

static uint64_t mod_exp64(uint64_t base, uint64_t exp, uint64_t mod) {
    if (mod <= 1) return 0;
    uint64_t r = 1;
    base %= mod;
    while (exp) {
        if (exp & 1)
            r = mul_mod64(r, base, mod);
        base = mul_mod64(base, base, mod);
        exp >>= 1;
    }
    return r;
}

/* ============================================================================
 * MODULAR ARITHMETIC OPERATIONS
 * ============================================================================ */

MathError abacus_mod(CrystallineAbacus* result, const CrystallineAbacus* a, const CrystallineAbacus* modulus) {
    if (!result || !a || !modulus) {
        return MATH_ERROR_INVALID_ARG;
    }
    
    /* Use division to compute a mod m = a - floor(a/m) * m */
    CrystallineAbacus* quotient = abacus_new(a->base);
    CrystallineAbacus* remainder = abacus_new(a->base);
    
    if (!quotient || !remainder) {
        if (quotient) abacus_free(quotient);
        if (remainder) abacus_free(remainder);
        return MATH_ERROR_OUT_OF_MEMORY;
    }
    
    MathError err = abacus_div(quotient, remainder, a, modulus);
    if (err != MATH_SUCCESS) {
        abacus_free(quotient);
        abacus_free(remainder);
        return err;
    }
    
    /* Copy remainder to result */
    CrystallineAbacus* temp = abacus_copy(remainder);
    if (!temp) {
        abacus_free(quotient);
        abacus_free(remainder);
        return MATH_ERROR_OUT_OF_MEMORY;
    }
    
    /* Clear result and copy temp into it */
    result->num_beads = temp->num_beads;
    result->negative = temp->negative;
    for (size_t i = 0; i < temp->num_beads && i < result->capacity; i++) {
        result->beads[i] = temp->beads[i];
    }
    
    abacus_free(quotient);
    abacus_free(remainder);
    abacus_free(temp);
    
    return MATH_SUCCESS;
}

MathError abacus_mod_add(CrystallineAbacus* result, const CrystallineAbacus* a, const CrystallineAbacus* b, const CrystallineAbacus* modulus) {
    if (!result || !a || !b || !modulus) {
        return MATH_ERROR_INVALID_ARG;
    }
    
    /* Compute (a + b) mod m */
    CrystallineAbacus* temp = abacus_new(a->base);
    if (!temp) return MATH_ERROR_OUT_OF_MEMORY;
    
    MathError err = abacus_add(temp, a, b);
    if (err != MATH_SUCCESS) {
        abacus_free(temp);
        return err;
    }
    
    err = abacus_mod(result, temp, modulus);
    abacus_free(temp);
    
    return err;
}

MathError abacus_mod_sub(CrystallineAbacus* result, const CrystallineAbacus* a, const CrystallineAbacus* b, const CrystallineAbacus* modulus) {
    if (!result || !a || !b || !modulus) {
        return MATH_ERROR_INVALID_ARG;
    }
    
    /* Compute (a - b) mod m */
    CrystallineAbacus* temp = abacus_new(a->base);
    if (!temp) return MATH_ERROR_OUT_OF_MEMORY;
    
    MathError err = abacus_sub(temp, a, b);
    if (err != MATH_SUCCESS) {
        abacus_free(temp);
        return err;
    }
    
    /* Handle negative results: if temp < 0, add modulus */
    if (temp->negative) {
        CrystallineAbacus* adjusted = abacus_new(a->base);
        if (!adjusted) {
            abacus_free(temp);
            return MATH_ERROR_OUT_OF_MEMORY;
        }
        
        err = abacus_add(adjusted, temp, modulus);
        if (err != MATH_SUCCESS) {
            abacus_free(temp);
            abacus_free(adjusted);
            return err;
        }
        
        abacus_free(temp);
        temp = adjusted;
    }
    
    err = abacus_mod(result, temp, modulus);
    abacus_free(temp);
    
    return err;
}

MathError abacus_mod_mul(CrystallineAbacus* result, const CrystallineAbacus* a, const CrystallineAbacus* b, const CrystallineAbacus* modulus) {
    if (!result || !a || !b || !modulus) {
        return MATH_ERROR_INVALID_ARG;
    }
    
    /* Compute (a * b) mod m */
    CrystallineAbacus* temp = abacus_new(a->base);
    if (!temp) return MATH_ERROR_OUT_OF_MEMORY;
    
    MathError err = abacus_mul(temp, a, b);
    if (err != MATH_SUCCESS) {
        abacus_free(temp);
        return err;
    }
    
    err = abacus_mod(result, temp, modulus);
    abacus_free(temp);
    
    return err;
}

MathError abacus_mod_exp(CrystallineAbacus* result, const CrystallineAbacus* base, const CrystallineAbacus* exponent, const CrystallineAbacus* modulus) {
    if (!result || !base || !exponent || !modulus) {
        return MATH_ERROR_INVALID_ARG;
    }
    
    /* 64-bit fast path: tetration uses base and exponent that fit in uint64_t (e.g. 5^3125 mod 2^64). */
    uint64_t base_u64, exp_u64, mod_u64;
    if (abacus_to_uint64(base, &base_u64) == MATH_SUCCESS &&
        abacus_to_uint64(exponent, &exp_u64) == MATH_SUCCESS &&
        abacus_to_uint64(modulus, &mod_u64) == MATH_SUCCESS &&
        !base->negative && !exponent->negative && !modulus->negative) {
        uint64_t r64 = mod_exp64(base_u64, exp_u64, mod_u64);
        CrystallineAbacus* fast = abacus_from_uint64(r64, base->base);
        if (fast) {
            result->num_beads = fast->num_beads;
            result->negative = fast->negative;
            for (size_t i = 0; i < fast->num_beads && i < result->capacity; i++) {
                result->beads[i] = fast->beads[i];
            }
            abacus_free(fast);
            return MATH_SUCCESS;
        }
        /* Fall through to general path if fast path failed */
    }
    
    /* Binary exponentiation: compute base^exponent mod modulus */
    CrystallineAbacus* res = abacus_from_uint64(1, base->base);
    CrystallineAbacus* b = abacus_new(base->base);
    CrystallineAbacus* exp = abacus_copy(exponent);
    CrystallineAbacus* two = abacus_from_uint64(2, base->base);
    
    if (!res || !b || !exp || !two) {
        if (res) abacus_free(res);
        if (b) abacus_free(b);
        if (exp) abacus_free(exp);
        if (two) abacus_free(two);
        return MATH_ERROR_OUT_OF_MEMORY;
    }
    
    /* b = base mod modulus */
    MathError err = abacus_mod(b, base, modulus);
    if (err != MATH_SUCCESS) {
        abacus_free(res);
        abacus_free(b);
        abacus_free(exp);
        abacus_free(two);
        return err;
    }
    
    /* Binary exponentiation loop */
    while (!abacus_is_zero(exp)) {
        /* If exp is odd, multiply result by b */
        CrystallineAbacus* exp_mod_2 = abacus_new(base->base);
        if (!exp_mod_2) {
            abacus_free(res);
            abacus_free(b);
            abacus_free(exp);
            abacus_free(two);
            return MATH_ERROR_OUT_OF_MEMORY;
        }
        
        err = abacus_mod(exp_mod_2, exp, two);
        if (err != MATH_SUCCESS) {
            abacus_free(res);
            abacus_free(b);
            abacus_free(exp);
            abacus_free(two);
            abacus_free(exp_mod_2);
            return err;
        }
        
        if (!abacus_is_zero(exp_mod_2)) {
            CrystallineAbacus* temp = abacus_new(base->base);
            if (!temp) {
                abacus_free(res);
                abacus_free(b);
                abacus_free(exp);
                abacus_free(two);
                abacus_free(exp_mod_2);
                return MATH_ERROR_OUT_OF_MEMORY;
            }
            
            err = abacus_mod_mul(temp, res, b, modulus);
            if (err != MATH_SUCCESS) {
                abacus_free(res);
                abacus_free(b);
                abacus_free(exp);
                abacus_free(two);
                abacus_free(exp_mod_2);
                abacus_free(temp);
                return err;
            }
            
            abacus_free(res);
            res = temp;
        }
        abacus_free(exp_mod_2);
        
        /* Square b and halve exp */
        CrystallineAbacus* b_squared = abacus_new(base->base);
        if (!b_squared) {
            abacus_free(res);
            abacus_free(b);
            abacus_free(exp);
            abacus_free(two);
            return MATH_ERROR_OUT_OF_MEMORY;
        }
        
        err = abacus_mod_mul(b_squared, b, b, modulus);
        if (err != MATH_SUCCESS) {
            abacus_free(res);
            abacus_free(b);
            abacus_free(exp);
            abacus_free(two);
            abacus_free(b_squared);
            return err;
        }
        
        abacus_free(b);
        b = b_squared;
        
        /* exp = exp / 2 */
        CrystallineAbacus* exp_halved = abacus_new(base->base);
        CrystallineAbacus* remainder = abacus_new(base->base);
        if (!exp_halved || !remainder) {
            abacus_free(res);
            abacus_free(b);
            abacus_free(exp);
            abacus_free(two);
            if (exp_halved) abacus_free(exp_halved);
            if (remainder) abacus_free(remainder);
            return MATH_ERROR_OUT_OF_MEMORY;
        }
        
        err = abacus_div(exp_halved, remainder, exp, two);
        if (err != MATH_SUCCESS) {
            abacus_free(res);
            abacus_free(b);
            abacus_free(exp);
            abacus_free(two);
            abacus_free(exp_halved);
            abacus_free(remainder);
            return err;
        }
        
        abacus_free(exp);
        abacus_free(remainder);
        exp = exp_halved;
    }
    
    /* Copy result */
    result->num_beads = res->num_beads;
    result->negative = res->negative;
    for (size_t i = 0; i < res->num_beads && i < result->capacity; i++) {
        result->beads[i] = res->beads[i];
    }
    
    abacus_free(res);
    abacus_free(b);
    abacus_free(exp);
    abacus_free(two);
    
    return MATH_SUCCESS;
}

MathError abacus_mod_inverse(CrystallineAbacus* result, const CrystallineAbacus* a, const CrystallineAbacus* modulus) {
    if (!result || !a || !modulus) {
        return MATH_ERROR_INVALID_ARG;
    }
    
    /* Extended Euclidean algorithm to find a^-1 mod m */
    CrystallineAbacus* old_r = abacus_copy(modulus);
    CrystallineAbacus* r = abacus_copy(a);
    CrystallineAbacus* old_s = abacus_from_uint64(0, a->base);
    CrystallineAbacus* s = abacus_from_uint64(1, a->base);
    
    if (!old_r || !r || !old_s || !s) {
        if (old_r) abacus_free(old_r);
        if (r) abacus_free(r);
        if (old_s) abacus_free(old_s);
        if (s) abacus_free(s);
        return MATH_ERROR_OUT_OF_MEMORY;
    }
    
    while (!abacus_is_zero(r)) {
        CrystallineAbacus* quotient = abacus_new(a->base);
        CrystallineAbacus* remainder = abacus_new(a->base);
        
        if (!quotient || !remainder) {
            abacus_free(old_r);
            abacus_free(r);
            abacus_free(old_s);
            abacus_free(s);
            if (quotient) abacus_free(quotient);
            if (remainder) abacus_free(remainder);
            return MATH_ERROR_OUT_OF_MEMORY;
        }
        
        MathError err = abacus_div(quotient, remainder, old_r, r);
        if (err != MATH_SUCCESS) {
            abacus_free(old_r);
            abacus_free(r);
            abacus_free(old_s);
            abacus_free(s);
            abacus_free(quotient);
            abacus_free(remainder);
            return err;
        }
        
        /* Update old_r, r */
        abacus_free(old_r);
        old_r = r;
        r = remainder;
        
        /* Update old_s, s: new_s = old_s - quotient * s */
        CrystallineAbacus* temp = abacus_new(a->base);
        if (!temp) {
            abacus_free(old_r);
            abacus_free(r);
            abacus_free(old_s);
            abacus_free(s);
            abacus_free(quotient);
            return MATH_ERROR_OUT_OF_MEMORY;
        }
        
        err = abacus_mul(temp, quotient, s);
        if (err != MATH_SUCCESS) {
            abacus_free(old_r);
            abacus_free(r);
            abacus_free(old_s);
            abacus_free(s);
            abacus_free(quotient);
            abacus_free(temp);
            return err;
        }
        
        CrystallineAbacus* new_s = abacus_new(a->base);
        if (!new_s) {
            abacus_free(old_r);
            abacus_free(r);
            abacus_free(old_s);
            abacus_free(s);
            abacus_free(quotient);
            abacus_free(temp);
            return MATH_ERROR_OUT_OF_MEMORY;
        }
        
        err = abacus_sub(new_s, old_s, temp);
        if (err != MATH_SUCCESS) {
            abacus_free(old_r);
            abacus_free(r);
            abacus_free(old_s);
            abacus_free(s);
            abacus_free(quotient);
            abacus_free(temp);
            abacus_free(new_s);
            return err;
        }
        
        abacus_free(old_s);
        old_s = s;
        s = new_s;
        
        abacus_free(quotient);
        abacus_free(temp);
    }
    
    /* If old_s is negative, add modulus */
    if (old_s->negative) {
        CrystallineAbacus* adjusted = abacus_new(a->base);
        if (!adjusted) {
            abacus_free(old_r);
            abacus_free(r);
            abacus_free(old_s);
            abacus_free(s);
            return MATH_ERROR_OUT_OF_MEMORY;
        }
        
        MathError err = abacus_add(adjusted, old_s, modulus);
        if (err != MATH_SUCCESS) {
            abacus_free(old_r);
            abacus_free(r);
            abacus_free(old_s);
            abacus_free(s);
            abacus_free(adjusted);
            return err;
        }
        
        result->num_beads = adjusted->num_beads;
        result->negative = adjusted->negative;
        for (size_t i = 0; i < adjusted->num_beads && i < result->capacity; i++) {
            result->beads[i] = adjusted->beads[i];
        }
        
        abacus_free(adjusted);
    } else {
        result->num_beads = old_s->num_beads;
        result->negative = old_s->negative;
        for (size_t i = 0; i < old_s->num_beads && i < result->capacity; i++) {
            result->beads[i] = old_s->beads[i];
        }
    }
    
    abacus_free(old_r);
    abacus_free(r);
    abacus_free(old_s);
    abacus_free(s);
    
    return MATH_SUCCESS;
}