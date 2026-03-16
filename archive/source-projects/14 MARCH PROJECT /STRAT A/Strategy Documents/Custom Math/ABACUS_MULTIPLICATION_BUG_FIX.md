# CrystallineAbacus Multiplication Bug Fix

## Summary
Fixed critical bug in `abacus_mul()` that caused multiplication results to be off by factors of 10^n when using fractional precision.

## Impact
- **Before**: 9/12 tests passing (75%)
- **After**: 12/12 tests passing (100%)
- **Affected Operations**: Matrix multiplication, scaling, Hadamard product

## Root Cause Analysis

### The Bug
In the slow path of `abacus_mul()` (school multiplication algorithm), the code was shifting by **bead index** instead of **bead exponent**:

```c
// WRONG - shifts by loop index
for (size_t i = 0; i < b->num_beads; i++) {
    ...
    if (i > 0) {
        err = abacus_shift_left(shifted, temp, i);  // BUG: using index i
    }
}
```

### Why This Failed

When numbers have fractional parts (precision > 0), beads are stored at negative exponents:

```
2.0 with precision 5:
  Bead 0: value=0, exponent=-5  (fractional part)
  Bead 1: value=0, exponent=-4
  Bead 2: value=0, exponent=-3
  Bead 3: value=0, exponent=-2
  Bead 4: value=0, exponent=-1
  Bead 5: value=2, exponent=0   (integer part)
```

When multiplying 2.0 × 3.0:
1. Loop processes bead 5 (value=3, exponent=0)
2. Multiplies: 2.0 × 3 = 6.0
3. **BUG**: Shifts by index 5 instead of exponent 0
4. Result: 6 at exponent 5 = 600,000 instead of 6 at exponent 0 = 6

### The Fix

Changed the shift logic to use the **bead's actual exponent**:

```c
// CORRECT - shifts by bead exponent
for (size_t i = 0; i < b->num_beads; i++) {
    ...
    int32_t shift_amount = b->beads[i].weight_exponent;  // Use exponent, not index
    if (shift_amount != 0) {
        if (shift_amount > 0) {
            err = abacus_shift_left(shifted, temp, (size_t)shift_amount);
        } else {
            err = abacus_shift_right(shifted, temp, (size_t)(-shift_amount));
        }
    }
}
```

Additionally, fixed the `min_exponent` calculation to find the actual minimum exponent in the result beads:

```c
// WRONG - assumes min_exponent is sum of operands
result->min_exponent = a->min_exponent + b->min_exponent;

// CORRECT - find actual minimum exponent in result
if (result->num_beads > 0) {
    result->min_exponent = result->beads[0].weight_exponent;
    for (size_t i = 1; i < result->num_beads; i++) {
        if (result->beads[i].weight_exponent < result->min_exponent) {
            result->min_exponent = result->beads[i].weight_exponent;
        }
    }
}
```

## Test Results

### Before Fix
```
Test 5: Matrix Multiplication - FAILED
  Expected: 58.0
  Got: 5,800,000.0

Test 6: Matrix Scaling - FAILED
  Expected: 2.5
  Got: 250,000.0

Test 12: Hadamard Product - FAILED
  Expected: 2.0
  Got: 200,000.0

Total: 9/12 passing (75%)
```

### After Fix
```
Test 5: Matrix Multiplication - PASSED ✓
Test 6: Matrix Scaling - PASSED ✓
Test 12: Hadamard Product - PASSED ✓

Total: 12/12 passing (100%) 🎉
```

## Verification

Simple test case:
```c
CrystallineAbacus* a = abacus_from_double(2.0, 10, 5);
CrystallineAbacus* b = abacus_from_double(3.0, 10, 5);
CrystallineAbacus* result = abacus_new(10);
abacus_mul(result, a, b);

double val;
abacus_to_double(result, &val);
// Before: 600,000.0
// After:  6.0 ✓
```

## Files Modified

1. **math/src/bigint/abacus.c**
   - Fixed `abacus_mul()` slow path to use bead exponents
   - Fixed `min_exponent` calculation

2. **src/ai/cllm_abacus_matrix.c**
   - Removed workaround code (convert to double and back)
   - Now uses abacus multiplication directly

## Compliance with MASTER_PLAN.md

✅ **RULE 1**: NO EXTERNAL MATH LIBRARIES
- All operations use CrystallineAbacus (arbitrary precision)
- No floating-point arithmetic in core operations
- Pure crystalline mathematics

✅ **RULE 9**: GEOMETRIC OPERATIONS
- All arithmetic via CrystallineAbacus
- Operations performed on clock lattice
- Geometric structure maintained

## Performance Impact

- **No performance regression**: Fix only affects slow path (large numbers)
- **Fast path unchanged**: Small integers still use O(1) uint64_t multiplication
- **Correctness improved**: All precision levels now work correctly

## Future Work

- Consider optimizing school multiplication with Karatsuba algorithm (O(n^1.585))
- Add more comprehensive tests for edge cases
- Test with very high precision (>15 digits)

## Conclusion

This fix resolves a critical bug that was blocking Phase 3 of the CLLM architecture redesign. All matrix operations now work correctly with arbitrary precision arithmetic, enabling full compliance with the Babylonian mathematics foundation.

**Status**: ✅ **RESOLVED** - All tests passing, ready for production use