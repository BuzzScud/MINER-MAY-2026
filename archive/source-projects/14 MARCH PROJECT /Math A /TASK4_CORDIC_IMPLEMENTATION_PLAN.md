# Task 4: CORDIC Implementation Plan

## Overview
Complete the CORDIC (COordinate Rotation DIgital Computer) implementation for pure Abacus transcendental functions without double intermediates.

## Current Status
- ✅ CORDIC structure defined in `math/include/math/cordic.h`
- ✅ Basic implementation started in `math/src/core/cordic.c` (424 lines)
- ✅ Test file created in `math/tests/test_cordic.c`
- ❌ Implementation incomplete - needs debugging
- ❌ Tests not passing yet

---

## Why CORDIC?

### Current Limitation
Our transcendental functions (sin, cos, atan2) currently use double precision as intermediate:
```c
// Current approach (precision loss)
double x = abacus_to_double(input);
double result = sin(x);  // Uses math.h
return abacus_from_double(result);
```

### CORDIC Solution
CORDIC provides pure integer/fixed-point arithmetic for transcendentals:
```c
// CORDIC approach (arbitrary precision)
CrystallineAbacus* result = cordic_sin(input);  // Pure Abacus
// No double conversion, no precision loss
```

### Benefits
1. **True Arbitrary Precision**: No double precision bottleneck
2. **Hardware-Friendly**: Used in calculators and embedded systems
3. **Unified Algorithm**: Single algorithm for sin, cos, atan, sinh, cosh, etc.
4. **Deterministic**: Exact number of iterations for desired precision

---

## CORDIC Algorithm Overview

### Core Principle
CORDIC rotates a vector by decomposing the rotation into a series of predetermined angles:
```
angle = atan(2^-0) + atan(2^-1) + atan(2^-2) + ...
```

### Three Modes

#### 1. Rotation Mode (Compute sin/cos)
**Input**: Angle θ
**Output**: cos(θ), sin(θ)
**Process**: Rotate unit vector (1,0) by angle θ

#### 2. Vectoring Mode (Compute atan2)
**Input**: Vector (x, y)
**Output**: atan2(y, x)
**Process**: Rotate vector to x-axis, accumulate angle

#### 3. Hyperbolic Mode (Compute sinh/cosh)
**Input**: Angle θ
**Output**: cosh(θ), sinh(θ)
**Process**: Similar to rotation but with hyperbolic angles

---

## Implementation Plan

### Phase 1: Core CORDIC Engine (2-3 hours)

#### Step 1: Angle Table Generation (30 min)
**File**: `math/src/core/cordic.c`

**Task**: Generate precomputed arctangent table
```c
// Precomputed: atan(2^-i) for i = 0 to 63
static const CrystallineAbacus* CORDIC_ANGLES[64];
```

**Implementation**:
1. Compute atan(1), atan(0.5), atan(0.25), ... using high precision
2. Store as Abacus constants
3. Initialize once at startup

#### Step 2: Basic Rotation (1 hour)
**Function**: `cordic_rotate_step()`

**Task**: Implement single CORDIC iteration
```c
static void cordic_rotate_step(
    CrystallineAbacus* x,
    CrystallineAbacus* y,
    CrystallineAbacus* z,
    int iteration,
    int direction
);
```

**Algorithm**:
```
if (z >= 0):
    x_new = x - y * 2^-i
    y_new = y + x * 2^-i
    z_new = z - atan(2^-i)
else:
    x_new = x + y * 2^-i
    y_new = y - x * 2^-i
    z_new = z + atan(2^-i)
```

#### Step 3: Scaling Factor (30 min)
**Task**: Apply CORDIC gain correction

**Constant**: K = 0.6072529350088812561694...
```c
static const CrystallineAbacus* CORDIC_GAIN;
```

**Application**: Multiply final result by K

### Phase 2: Transcendental Functions (2-3 hours)

#### Step 1: Sine and Cosine (1 hour)
**Functions**: `cordic_sin()`, `cordic_cos()`, `cordic_sincos()`

**Algorithm**:
1. Reduce angle to [0, π/2] using symmetry
2. Initialize: x = K, y = 0, z = angle
3. Perform CORDIC iterations (rotation mode)
4. Result: x = cos(angle), y = sin(angle)

**Implementation**:
```c
MathError cordic_sin(CrystallineAbacus* result, 
                     const CrystallineAbacus* angle,
                     int iterations);

MathError cordic_cos(CrystallineAbacus* result,
                     const CrystallineAbacus* angle,
                     int iterations);

MathError cordic_sincos(CrystallineAbacus* sin_result,
                        CrystallineAbacus* cos_result,
                        const CrystallineAbacus* angle,
                        int iterations);
```

#### Step 2: Arctangent (1 hour)
**Function**: `cordic_atan2()`

**Algorithm**:
1. Initialize: x = x_input, y = y_input, z = 0
2. Perform CORDIC iterations (vectoring mode)
3. Result: z = atan2(y_input, x_input)

**Implementation**:
```c
MathError cordic_atan2(CrystallineAbacus* result,
                       const CrystallineAbacus* y,
                       const CrystallineAbacus* x,
                       int iterations);
```

#### Step 3: Hyperbolic Functions (1 hour - OPTIONAL)
**Functions**: `cordic_sinh()`, `cordic_cosh()`, `cordic_tanh()`

**Algorithm**: Similar to circular but with hyperbolic angles

### Phase 3: Integration and Testing (1-2 hours)

#### Step 1: Update Transcendental Functions (30 min)
**File**: `math/src/core/transcendental.c`

**Task**: Replace double intermediate with CORDIC
```c
// Before
MathError math_sin_abacus(CrystallineAbacus* result,
                          const CrystallineAbacus* x,
                          int precision) {
    double val = abacus_to_double(x);
    double sin_val = sin(val);  // math.h
    return abacus_from_double(sin_val, ...);
}

// After
MathError math_sin_abacus(CrystallineAbacus* result,
                          const CrystallineAbacus* x,
                          int precision) {
    return cordic_sin(result, x, precision);
}
```

#### Step 2: Comprehensive Testing (1 hour)
**File**: `math/tests/test_cordic.c`

**Test Cases**:
1. Basic angles (0, π/4, π/2, π)
2. Arbitrary angles
3. Negative angles
4. Large angles (> 2π)
5. Small angles (< 0.01)
6. Precision tests (compare with reference)
7. Performance tests

#### Step 3: Validation (30 min)
**Tasks**:
1. Compare CORDIC results with current implementation
2. Verify precision improvement
3. Measure performance impact
4. Update documentation

---

## Debugging Strategy

### Current Issues (To Be Diagnosed)
1. **Compilation errors**: Check for syntax issues
2. **Linking errors**: Verify function signatures
3. **Runtime errors**: Check for null pointers, memory leaks
4. **Precision errors**: Verify angle table accuracy
5. **Convergence errors**: Check iteration count

### Debugging Steps

#### Step 1: Compilation (30 min)
1. Fix all compilation errors
2. Verify header includes
3. Check function signatures
4. Ensure proper types

#### Step 2: Basic Functionality (1 hour)
1. Test angle table generation
2. Test single rotation step
3. Test gain factor application
4. Verify basic sin(0) = 0, cos(0) = 1

#### Step 3: Precision Analysis (1 hour)
1. Compare with reference implementation
2. Test different iteration counts
3. Verify convergence
4. Check edge cases

#### Step 4: Performance Optimization (1 hour)
1. Profile CORDIC operations
2. Optimize hot paths
3. Consider lookup tables
4. Benchmark vs current implementation

---

## Success Criteria

### Must Have ✅
- [ ] CORDIC compiles without errors
- [ ] Basic tests passing (sin, cos, atan2)
- [ ] Precision better than or equal to current implementation
- [ ] No memory leaks
- [ ] Integration with transcendental.c complete

### Should Have 🎯
- [ ] All test cases passing
- [ ] Performance comparable to current implementation
- [ ] Documentation complete
- [ ] Examples provided

### Nice to Have 💡
- [ ] Hyperbolic functions implemented
- [ ] Performance better than current implementation
- [ ] Adaptive iteration count
- [ ] Lookup table optimization

---

## Estimated Time: 4-7 hours total
- Phase 1: Core Engine (2-3 hours)
- Phase 2: Functions (2-3 hours)
- Phase 3: Integration (1-2 hours)
- Debugging: +1-2 hours buffer

---

## Alternative: Skip CORDIC for Now

### Rationale
1. Current transcendental functions work correctly
2. CORDIC is complex and time-consuming
3. Other priorities may be more important
4. Can be implemented later as optimization

### If Skipping
1. Document current limitation (double intermediate)
2. Mark as future enhancement
3. Focus on higher-priority tasks
4. Revisit after core functionality complete

---

## Decision Point

**Question**: Should we implement CORDIC now or defer?

**Factors to Consider**:
1. **Urgency**: How critical is pure Abacus transcendentals?
2. **Time**: Do we have 4-7 hours available?
3. **Priority**: Are there higher-priority tasks?
4. **Risk**: Is current implementation sufficient?

**Recommendation**: 
- If precision is critical: Implement CORDIC now
- If time is limited: Defer to future optimization
- If other tasks are urgent: Skip for now

---

## Current Status: READY TO START (or DEFER)

**Next Action**: Decide whether to implement CORDIC now or focus on Task 3 (Integration Testing) first.