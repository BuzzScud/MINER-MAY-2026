# NTT-Polytope Integration Specification

**Date:** December 15, 2024  
**Version:** 1.0  
**Status:** Design Complete

---

## Overview

This document specifies the integration of Number Theoretic Transform (NTT) operations with the polytope system to enable O(n log n) operations on large polytopes.

---

## Design Principles

1. **Automatic Optimization:** NTT is used automatically when beneficial
2. **Transparent Integration:** Users don't need to know about NTT
3. **No Regression:** Small polytopes use direct methods (faster)
4. **Pure Abacus:** All operations use CrystallineAbacus
5. **Seamless API:** NTT is part of unified polytope API

---

## Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Unified Polytope API                          │
│  (polytope_unified.h/c)                                 │
│  - polytope_create() with automatic NTT selection       │
│  - PolytopeSpec with NTT configuration                  │
│  - PolytopeInfo with NTT status                         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Polytope-NTT Bridge (NEW)                     │
│  (polytope_ntt.h/c)                                     │
│  - Automatic NTT selection logic                        │
│  - NTT-based face enumeration                           │
│  - NTT-based vertex transformations                     │
│  - Convolution operations                               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 1: NTT Core (EXISTING)                           │
│  (ntt.h/c)                                              │
│  - Forward/Inverse NTT                                  │
│  - Prime selection                                      │
│  - Primitive root finding                               │
│  - Pure CrystallineAbacus operations                    │
└─────────────────────────────────────────────────────────┘
```

---

## API Specification

### File: `math/include/math/polytope_ntt.h`

```c
#ifndef MATH_POLYTOPE_NTT_H
#define MATH_POLYTOPE_NTT_H

#include "math/polytope.h"
#include "math/ntt.h"
#include "math/higher_faces.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * AUTOMATIC NTT SELECTION
 * ============================================================================ */

/**
 * @brief Determine if NTT should be used for a polytope
 * 
 * Decision based on:
 * - Vertex count (threshold: 100)
 * - Operation type
 * - Available memory
 * 
 * @param solid Polytope to analyze
 * @return true if NTT should be used, false otherwise
 */
bool polytope_ntt_should_use(const PlatonicSolid* solid);

/**
 * @brief Find optimal NTT prime for a polytope
 * 
 * Selects NTT-friendly prime based on polytope size.
 * 
 * @param solid Polytope to analyze
 * @return Optimal NTT prime, or 0 if NTT not recommended
 */
uint64_t polytope_ntt_find_optimal_prime(const PlatonicSolid* solid);

/**
 * @brief Get recommended transform size for polytope
 * 
 * Returns next power of 2 >= vertex count.
 * 
 * @param solid Polytope to analyze
 * @return Recommended NTT transform size
 */
size_t polytope_ntt_get_transform_size(const PlatonicSolid* solid);

/* ============================================================================
 * NTT CONTEXT MANAGEMENT
 * ============================================================================ */

/**
 * @brief Create NTT context for polytope operations
 * 
 * Automatically selects optimal prime and transform size.
 * 
 * @param solid Polytope to create context for
 * @return NTT context, or NULL on failure
 */
NTTContext* polytope_ntt_create_context(const PlatonicSolid* solid);

/**
 * @brief Create NTT context with specific parameters
 * 
 * @param transform_size Transform size (must be power of 2)
 * @param prime NTT-friendly prime
 * @return NTT context, or NULL on failure
 */
NTTContext* polytope_ntt_create_context_custom(size_t transform_size, 
                                                uint64_t prime);

/* ============================================================================
 * NTT-BASED FACE ENUMERATION
 * ============================================================================ */

/**
 * @brief Enumerate k-faces using NTT-based convolution
 * 
 * Uses fast convolution to generate face combinations.
 * Significantly faster than direct enumeration for large polytopes.
 * 
 * Complexity: O(n log n) vs O(n^k) for direct method
 * 
 * @param solid Polytope to enumerate faces for
 * @param k Dimension of faces to enumerate (0=vertices, 1=edges, etc.)
 * @param ctx NTT context (NULL = create automatically)
 * @param faces Output: generated faces
 * @return MATH_SUCCESS or error code
 */
MathError polytope_ntt_enumerate_faces(const PlatonicSolid* solid,
                                        uint32_t k,
                                        NTTContext* ctx,
                                        FaceList** faces);

/**
 * @brief Generate complete face hierarchy using NTT
 * 
 * Generates all k-faces (0 to n-1) using NTT optimization.
 * 
 * @param solid Polytope to generate hierarchy for
 * @param ctx NTT context (NULL = create automatically)
 * @param hierarchy Output: complete face hierarchy
 * @return MATH_SUCCESS or error code
 */
MathError polytope_ntt_generate_hierarchy(const PlatonicSolid* solid,
                                           NTTContext* ctx,
                                           FaceHierarchy** hierarchy);

/* ============================================================================
 * NTT-BASED VERTEX TRANSFORMATIONS
 * ============================================================================ */

/**
 * @brief Transform vertices using NTT-based matrix multiplication
 * 
 * Applies transformation matrix to all vertices using fast polynomial
 * multiplication via NTT.
 * 
 * Complexity: O(n^2 log n) vs O(n^3) for direct method
 * 
 * @param solid Polytope to transform (modified in place)
 * @param transformation Transformation matrix (dimension × dimension)
 * @param ctx NTT context (NULL = create automatically)
 * @return MATH_SUCCESS or error code
 */
MathError polytope_ntt_transform_vertices(PlatonicSolid* solid,
                                           const CrystallineAbacus** transformation,
                                           NTTContext* ctx);

/**
 * @brief Rotate polytope using NTT-optimized operations
 * 
 * @param solid Polytope to rotate (modified in place)
 * @param axis Rotation axis (dimension-1 dimensional vector)
 * @param angle Rotation angle (in radians, as Abacus)
 * @param ctx NTT context (NULL = create automatically)
 * @return MATH_SUCCESS or error code
 */
MathError polytope_ntt_rotate(PlatonicSolid* solid,
                               const CrystallineAbacus** axis,
                               const CrystallineAbacus* angle,
                               NTTContext* ctx);

/**
 * @brief Scale polytope using NTT-optimized operations
 * 
 * @param solid Polytope to scale (modified in place)
 * @param scale_factor Scale factor (as Abacus)
 * @param ctx NTT context (NULL = create automatically)
 * @return MATH_SUCCESS or error code
 */
MathError polytope_ntt_scale(PlatonicSolid* solid,
                              const CrystallineAbacus* scale_factor,
                              NTTContext* ctx);

/* ============================================================================
 * NTT-BASED CONVOLUTION OPERATIONS
 * ============================================================================ */

/**
 * @brief General convolution for polytope operations
 * 
 * Performs convolution of two sequences using NTT.
 * Used internally for various polytope operations.
 * 
 * @param result Output: convolution result (length n+m-1)
 * @param a First sequence (length n)
 * @param n Length of first sequence
 * @param b Second sequence (length m)
 * @param m Length of second sequence
 * @param ctx NTT context
 * @return MATH_SUCCESS or error code
 */
MathError polytope_ntt_convolve(CrystallineAbacus** result,
                                 const CrystallineAbacus** a, size_t n,
                                 const CrystallineAbacus** b, size_t m,
                                 NTTContext* ctx);

/**
 * @brief Coordinate convolution for nested polytopes
 * 
 * Convolves coordinate sequences for hierarchical polytope operations.
 * 
 * @param result Output: convolved coordinates
 * @param coords1 First coordinate sequence
 * @param coords2 Second coordinate sequence
 * @param dimension Dimension of coordinates
 * @param ctx NTT context
 * @return MATH_SUCCESS or error code
 */
MathError polytope_ntt_convolve_coordinates(CrystallineAbacus** result,
                                             const CrystallineAbacus** coords1,
                                             const CrystallineAbacus** coords2,
                                             uint32_t dimension,
                                             NTTContext* ctx);

/* ============================================================================
 * PERFORMANCE UTILITIES
 * ============================================================================ */

/**
 * @brief Estimate speedup from using NTT
 * 
 * Returns estimated speedup factor (e.g., 10.0 = 10x faster).
 * 
 * @param solid Polytope to analyze
 * @param operation Operation type (face enumeration, transformation, etc.)
 * @return Estimated speedup factor (1.0 = no speedup)
 */
double polytope_ntt_estimate_speedup(const PlatonicSolid* solid,
                                      const char* operation);

/**
 * @brief Get NTT performance statistics
 * 
 * @param solid Polytope
 * @param ctx NTT context
 * @param stats Output: performance statistics
 * @return MATH_SUCCESS or error code
 */
typedef struct {
    size_t transform_size;
    uint64_t prime_used;
    double setup_time_ms;
    double operation_time_ms;
    double total_time_ms;
    size_t memory_used_bytes;
} PolytopeNTTStats;

MathError polytope_ntt_get_stats(const PlatonicSolid* solid,
                                  const NTTContext* ctx,
                                  PolytopeNTTStats* stats);

#ifdef __cplusplus
}
#endif

#endif /* MATH_POLYTOPE_NTT_H */
```

---

## Integration with Unified API

### Updates to `polytope_unified.h`

```c
// Add to PolytopeSpec structure:
typedef struct {
    // ... existing fields ...
    
    // ========================================================================
    // NTT CONFIGURATION (Automatic by default)
    // ========================================================================
    bool use_ntt;                 /**< Use NTT for operations (default: auto) */
    uint32_t ntt_threshold;       /**< Vertex threshold for NTT (default: 100) */
    uint64_t ntt_prime;           /**< NTT prime (0 = auto-select) */
    size_t ntt_transform_size;    /**< Transform size (0 = auto-select) */
    
} PolytopeSpec;

// Add to PolytopeInfo structure:
typedef struct {
    // ... existing fields ...
    
    // ========================================================================
    // NTT STATUS
    // ========================================================================
    bool ntt_enabled;             /**< Whether NTT is being used */
    uint64_t ntt_prime;           /**< NTT prime in use (0 if not using NTT) */
    size_t ntt_transform_size;    /**< NTT transform size */
    double ntt_speedup_estimate;  /**< Estimated speedup from NTT */
    
} PolytopeInfo;
```

### Default Behavior

```c
// When creating a polytope with default spec:
PolytopeSpec spec = {
    .schlafli_symbol = "{3,3,5}",  // 600-cell
    .use_ntt = true,                // Auto-select (will use NTT)
    .ntt_threshold = 100,           // Default threshold
    .ntt_prime = 0,                 // Auto-select
    .ntt_transform_size = 0,        // Auto-select
    // ... other fields ...
};

NestedPolytopeTree* tree = polytope_create(&spec);

// NTT will be automatically used because 600-cell has 120 vertices > 100
```

---

## Automatic NTT Selection Algorithm

```c
bool polytope_ntt_should_use(const PlatonicSolid* solid) {
    // Check vertex count threshold
    if (solid->num_vertices < 100) {
        return false;  // Too small, direct method faster
    }
    
    // Check if suitable NTT prime exists
    uint64_t prime = polytope_ntt_find_optimal_prime(solid);
    if (prime == 0) {
        return false;  // No suitable prime
    }
    
    // Check memory availability
    size_t transform_size = polytope_ntt_get_transform_size(solid);
    size_t memory_needed = transform_size * sizeof(CrystallineAbacus*) * 2;
    if (memory_needed > MAX_NTT_MEMORY) {
        return false;  // Too much memory required
    }
    
    return true;  // Use NTT
}
```

---

## Face Enumeration Algorithm

### Direct Method (Current)
```
For each k-face:
    For each combination of k+1 vertices:
        Check if forms valid face
        Add to face list
        
Complexity: O(n^k) where n = num_vertices, k = face dimension
```

### NTT Method (New)
```
1. Convert vertex adjacency to polynomial coefficients
2. Pad to next power of 2
3. Apply forward NTT
4. Perform pointwise multiplication (convolution)
5. Apply inverse NTT
6. Extract face combinations from result
7. Validate and construct face structures

Complexity: O(n log n)
```

### Speedup Example (600-cell, 120 vertices)

**2-faces (triangles):**
- Direct: C(120, 3) = 280,840 checks
- NTT: 120 × log₂(128) ≈ 840 operations
- **Speedup: ~334x**

---

## Implementation Plan

### Phase 1: Core API (2 hours)
**File:** `math/include/math/polytope_ntt.h`
- [ ] Define all function signatures
- [ ] Document API thoroughly
- [ ] Add usage examples

### Phase 2: Automatic Selection (1 hour)
**File:** `math/src/platonic/polytope_ntt.c`
- [ ] Implement `polytope_ntt_should_use()`
- [ ] Implement `polytope_ntt_find_optimal_prime()`
- [ ] Implement `polytope_ntt_get_transform_size()`
- [ ] Implement context creation functions

### Phase 3: Face Enumeration (2 hours)
**File:** `math/src/platonic/polytope_ntt.c`
- [ ] Design convolution-based algorithm
- [ ] Implement `polytope_ntt_enumerate_faces()`
- [ ] Implement `polytope_ntt_generate_hierarchy()`
- [ ] Integrate with higher_faces system

### Phase 4: Vertex Operations (1 hour)
**File:** `math/src/platonic/polytope_ntt.c`
- [ ] Implement `polytope_ntt_transform_vertices()`
- [ ] Implement `polytope_ntt_rotate()`
- [ ] Implement `polytope_ntt_scale()`

### Phase 5: Convolution Operations (1 hour)
**File:** `math/src/platonic/polytope_ntt.c`
- [ ] Implement `polytope_ntt_convolve()`
- [ ] Implement `polytope_ntt_convolve_coordinates()`

### Phase 6: Unified API Integration (1 hour)
**Files:** `polytope_unified.h/c`
- [ ] Add NTT fields to PolytopeSpec
- [ ] Add NTT fields to PolytopeInfo
- [ ] Update `polytope_create()` for automatic NTT
- [ ] Update `polytope_get_info()` to include NTT status

### Phase 7: Testing (1 hour)
**File:** `math/tests/test_polytope_ntt.c`
- [ ] Test automatic selection logic
- [ ] Test small polytopes (should NOT use NTT)
- [ ] Test large polytopes (should use NTT)
- [ ] Verify correctness
- [ ] Benchmark performance

**Total: 9 hours**

---

## Testing Strategy

### Test Cases

1. **Automatic Selection Tests**
   - Tetrahedron (4 vertices) → Should NOT use NTT
   - Icosahedron (12 vertices) → Should NOT use NTT
   - 600-cell (120 vertices) → SHOULD use NTT
   - Custom threshold testing

2. **Correctness Tests**
   - Compare NTT results with direct method
   - Verify face counts match
   - Verify vertex transformations are correct
   - Test edge cases (empty polytope, single vertex)

3. **Performance Tests**
   - Benchmark small polytopes (verify no regression)
   - Benchmark large polytopes (verify speedup)
   - Memory usage monitoring
   - Compare with theoretical estimates

4. **Integration Tests**
   - Test with unified API
   - Test with nested polytopes
   - Test with higher_faces system
   - Test with clock lattice mapping

---

## Success Criteria

### Functional
- ✅ All tests pass (100% success rate)
- ✅ Correct results for all polytope sizes
- ✅ Automatic NTT selection works correctly
- ✅ Seamless integration with unified API

### Performance
- ✅ No regression for small polytopes (< 100 vertices)
- ✅ 10-100x speedup for large polytopes (> 100 vertices)
- ✅ Memory usage within acceptable limits
- ✅ Faster than direct method for target use cases

### Code Quality
- ✅ Zero build warnings
- ✅ Zero build errors
- ✅ Comprehensive documentation
- ✅ Clean, maintainable code

---

## Conclusion

This specification provides a complete design for integrating NTT operations with the polytope system. The design is:

- **Automatic:** NTT is used transparently when beneficial
- **Efficient:** Significant speedups for large polytopes
- **Safe:** No performance regression for small polytopes
- **Clean:** Seamless integration with existing APIs

**Status:** ✅ Ready for implementation

**Next Step:** Begin Phase 1 - Create `polytope_ntt.h`