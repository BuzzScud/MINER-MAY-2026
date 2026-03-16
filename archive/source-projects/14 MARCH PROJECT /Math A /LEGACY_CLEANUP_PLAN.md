# Legacy Cleanup Plan - Geometric Recovery

## Problem Statement

The repository contains TWO geometric recovery systems:

1. **OLD (crypto-specific)**: 
   - `algorithms/include/geometric_recovery.h` - Uses OpenSSL/BIGNUM/EC_POINT
   - Various crypto-specific implementation files
   - Bitcoin ECDLP-specific

2. **NEW (general-purpose)**:
   - `algorithms/include/geometric_recovery/geometric_recovery_orchestrator.h`
   - Modular component-based architecture
   - Works with ANY system (not crypto-specific)
   - Uses only standard types (uint64_t, double, etc.)

## Files to Remove from Build

### Crypto-Specific Files (Currently Being Compiled)
These files are in SOURCES but not used by the orchestrator:

1. `src/geometric_recovery/oscillation_vector.c` - Uses geometric_recovery.h
2. `src/geometric_recovery/quadrant_polarity.c` - Uses geometric_recovery.h  
3. `src/geometric_recovery/shared_geometry.c` - Uses geometric_recovery.h
4. `src/geometric_recovery/geometric_utils.c` - Uses BIGNUM/EC_POINT

### Reference Files (Not in Build, Can Be Archived)
These are reference implementations with OpenSSL:

1. `src/geometric_recovery/*_reference.c` (5 files)
2. `src/geometric_recovery/geometric_recovery.c` - OLD main file
3. `src/geometric_recovery/integrated_recovery.c`
4. `src/geometric_recovery/anchor_tracking.c`
5. `src/geometric_recovery/geometric_anchors.c`
6. `src/geometric_recovery/ecdsa_sample_loader.c`

### Test Files (Can Be Updated or Archived)
These tests use the OLD system:

1. `tests/test_geometric_recovery.c`
2. `tests/test_single_candidate_validation.c`
3. `tests/test_secp128_*.c` (3 files)
4. `tests/test_iterative_recovery_v2.c`
5. `tests/test_geometric_quick.c`
6. `tests/test_candidate_analysis.c`
7. `tests/test_geometric_1k.c`

## Files to Keep (NEW System)

### Core Orchestrator
- ✅ `geometric_recovery_orchestrator.h/c` - Main coordinator

### Modular Components (All General-Purpose)
- ✅ `g_triangulation.h/c` - Geometric triangulation
- ✅ `tetration_attractors.h/c` - Tetration system
- ✅ `torus_analysis.h/c` - Torus intersection
- ✅ `multi_torus_tracker.h/c` - Multi-torus tracking
- ✅ `prime_factor_extraction.h/c` - Prime factorization
- ✅ `clock_lattice_integration.h/c` - Clock lattice
- ✅ `fractal_bounds.h/c` - Fractal partitioning
- ✅ `multi_scale_search.h/c` - Multi-scale search
- ✅ `recursive_recovery.h/c` - Recursive strategy
- ✅ `spherical_recovery.h/c` - Spherical strategy
- ✅ `search_recovery.h/c` - Search strategy
- ✅ `anchor_grid_24.h/c` - Anchor grid (to be replaced)
- ✅ `harmonic_folding.h/c` - Harmonic analysis
- ✅ `kissing_spheres.h/c` - Sphere packing
- ✅ `micro_model.h/c` - Micro-model training
- ✅ `clock_recovery.h/c` - Clock inverse mapping
- ✅ `convergence_detection.h/c` - Convergence analysis (NEW)
- ✅ `oscillation_detection.h/c` - Oscillation analysis (NEW)
- ✅ `confidence_scoring.h/c` - Confidence scoring (NEW)

## Cleanup Actions

### Step 1: Remove Crypto-Specific Files from Build
Remove from Makefile SOURCES:
```makefile
# REMOVE THESE:
src/geometric_recovery/oscillation_vector.c
src/geometric_recovery/quadrant_polarity.c
src/geometric_recovery/shared_geometry.c
src/geometric_recovery/geometric_utils.c
```

### Step 2: Archive Legacy Files
Move to `algorithms/legacy/geometric_recovery/`:
- All *_reference.c files
- geometric_recovery.c (OLD main)
- integrated_recovery.c
- anchor_tracking.c
- geometric_anchors.c
- ecdsa_sample_loader.c
- oscillation_vector.c
- quadrant_polarity.c
- shared_geometry.c
- geometric_utils.c

### Step 3: Archive OLD Header
Move `algorithms/include/geometric_recovery.h` to `algorithms/legacy/`

### Step 4: Archive OLD Tests
Move crypto-specific tests to `algorithms/legacy/tests/`

### Step 5: Verify Build
```bash
cd algorithms
make clean
make
# Should build successfully with only NEW components
```

### Step 6: Update Documentation
- Update README to clarify general-purpose design
- Remove references to Bitcoin/ECDLP specifics
- Emphasize universal geometric mathematics

## Benefits of Cleanup

1. **Clarity**: Single, clear system architecture
2. **Maintainability**: No confusion about which files to use
3. **General-Purpose**: Emphasizes universal applicability
4. **Build Speed**: Fewer files to compile
5. **No OpenSSL Dependency**: Removes crypto library requirement

## Verification Checklist

- [ ] Makefile builds successfully
- [ ] No OpenSSL includes in active code
- [ ] Orchestrator compiles and links
- [ ] All NEW components compile
- [ ] libalgorithms.so created successfully
- [ ] No BIGNUM/EC_POINT types in active code
- [ ] Documentation updated

## Implementation Priority

**HIGH PRIORITY** - Should be done before further development to avoid confusion and ensure clean architecture.