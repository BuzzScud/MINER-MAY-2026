# Function Placement Analysis: Math Library vs Algorithms

**Date:** December 15, 2024  
**Analysis:** Determine which functions belong in math library

---

## FUNCTIONS IN g_triangulation.c

### 1. `map_k_to_lattice(uint64_t k, double position[13])`

**What it does:**
- Maps a scalar value k to 13D clock lattice position
- Uses π×φ metric
- Uses dimensional frequencies [3, 7, 31, 12, 19, 5, 11, 13, 17, 23, 29, 37, 41]
- Applies cos() with φ powers

**Should be in:** ✅ **MATH LIBRARY**

**Rationale:**
- Fundamental clock lattice operation
- Used by ANY system mapping values to clock positions
- Core geometric mathematics
- No algorithm-specific logic

**Location:** `math/src/clock_lattice.c`

**Signature:**
```c
void clock_map_value_to_lattice_13d(uint64_t value, double position[13]);
```

---

### 2. `map_ec_point_to_lattice(EC_POINT* point, EC_GROUP* group, double position[13])`

**What it does:**
- Extracts x,y coordinates from EC_POINT
- Maps to 13D clock lattice

**Should be:** ❌ **NOT IN MATH LIBRARY** (crypto-specific)

**Replacement:** Abstract to use raw uint64_t
```c
void clock_map_pair_to_lattice_13d(uint64_t x, uint64_t y, double position[13]);
```

**Then this CAN go in math library:** ✅ **MATH LIBRARY**

**Rationale:**
- Once abstracted from EC_POINT, it's just mapping two uint64_t values
- Fundamental geometric operation
- Reusable for any (x,y) pair

---

### 3. `compute_distance(const double pos1[13], const double pos2[13])`

**What it does:**
- Euclidean distance in 13D space
- sqrt(sum of squared differences)

**Should be in:** ✅ **MATH LIBRARY**

**Rationale:**
- Pure mathematical operation
- Used everywhere in geometric algorithms
- No algorithm-specific logic

**Location:** `math/src/geometry.c` or `math/src/clock_lattice.c`

**Signature:**
```c
double math_distance_13d(const double pos1[13], const double pos2[13]);
```

---

### 4. `generate_platonic_anchors(Anchor* anchors, int* num_anchors)`

**What it does:**
- Generates 50 Platonic solid vertices
- Maps to 13D clock lattice
- Creates anchor points

**Should be in:** 🤔 **DEBATABLE**

**Analysis:**
- Platonic solid generation is fundamental geometry
- But anchor structure is algorithm-specific
- The VERTICES should be in math library
- The ANCHOR STRUCTURE should be in algorithms

**Split into two:**

**Math Library:** ✅
```c
// Generate raw Platonic solid vertices
void math_generate_platonic_vertices_13d(
    double vertices[][13],
    int* num_vertices
);
```

**Algorithms Library:** ✅
```c
// Wrap vertices in Anchor structure
void create_anchors_from_vertices(
    const double vertices[][13],
    int num_vertices,
    Anchor* anchors
);
```

---

## DIMENSIONAL FREQUENCIES

### `DIMENSIONAL_FREQUENCIES[13] = {3, 7, 31, 12, 19, 5, 11, 13, 17, 23, 29, 37, 41}`

**Should be in:** ✅ **MATH LIBRARY**

**Rationale:**
- Fundamental to clock lattice structure
- Used by all 13D mapping operations
- Core geometric constant

**Location:** `math/include/math/constants.h`

**Definition:**
```c
extern const uint64_t CLOCK_LATTICE_FREQUENCIES_13D[13];
```

---

## FUNCTIONS IN multi_torus_tracker.c

### Already Clean (No OpenSSL)

These are algorithm-specific and correctly placed in algorithms library:
- `create_multi_torus_tracker()`
- `identify_tori()`
- `multi_torus_add_sample()`
- `compute_torus_intersection()`

---

## PROPOSED MATH LIBRARY ADDITIONS

### New File: `math/src/clock_lattice_13d.c`

```c
/**
 * 13-Dimensional Clock Lattice Operations
 */

#include "math/clock_lattice.h"
#include "math/constants.h"
#include "math/transcendental.h"

// Dimensional frequencies for 13D clock lattice
const uint64_t CLOCK_LATTICE_FREQUENCIES_13D[13] = {
    3, 7, 31, 12, 19, 5, 11, 13, 17, 23, 29, 37, 41
};

/**
 * Map single value to 13D clock lattice position
 */
void clock_map_value_to_lattice_13d(uint64_t value, double position[13]) {
    double base_angle = (double)value * MATH_PI * MATH_PHI;
    
    // Normalize to [0, 2π)
    while (base_angle < 0) base_angle += MATH_TWO_PI;
    while (base_angle >= MATH_TWO_PI) base_angle -= MATH_TWO_PI;
    
    for (int d = 0; d < 13; d++) {
        double freq = (double)CLOCK_LATTICE_FREQUENCIES_13D[d];
        position[d] = math_cos(base_angle * freq) * math_pow(MATH_PHI, d % 5);
    }
}

/**
 * Map (x,y) pair to 13D clock lattice position
 */
void clock_map_pair_to_lattice_13d(
    uint64_t x,
    uint64_t y,
    double position[13]
) {
    for (int d = 0; d < 13; d++) {
        double freq = (double)CLOCK_LATTICE_FREQUENCIES_13D[d];
        
        // X component
        double x_angle = (double)(x % 360) * MATH_PI / 180.0;
        position[d] = math_cos(x_angle * freq) * math_pow(MATH_PHI, d % 5);
        
        // Y component
        double y_angle = (double)(y % 360) * MATH_PI / 180.0;
        position[d] += math_sin(y_angle * freq) * math_pow(MATH_PHI, (d + 1) % 5) * 0.5;
    }
}

/**
 * Compute Euclidean distance in 13D space
 */
double math_distance_13d(const double pos1[13], const double pos2[13]) {
    double sum = 0.0;
    for (int d = 0; d < 13; d++) {
        double diff = pos1[d] - pos2[d];
        sum += diff * diff;
    }
    return math_sqrt(sum);
}
```

### New File: `math/src/platonic_vertices.c`

```c
/**
 * Platonic Solid Vertex Generation
 */

#include "math/platonic.h"
#include "math/constants.h"
#include "math/transcendental.h"

/**
 * Generate 50 Platonic solid vertices in 13D
 * 
 * Includes:
 * - Tetrahedron: 4 vertices
 * - Cube: 8 vertices
 * - Octahedron: 6 vertices
 * - Dodecahedron: 20 vertices
 * - Icosahedron: 12 vertices
 * Total: 50 vertices
 */
void math_generate_platonic_vertices_13d(
    double vertices[][13],
    int* num_vertices
) {
    int idx = 0;
    
    // Tetrahedron: 4 vertices
    for (int v = 0; v < 4; v++) {
        double angle = v * MATH_TWO_PI / 4.0;
        for (int d = 0; d < 13; d++) {
            double freq = (double)CLOCK_LATTICE_FREQUENCIES_13D[d];
            vertices[idx][d] = math_cos(angle * freq) * math_pow(MATH_PHI, d % 3);
        }
        idx++;
    }
    
    // Cube: 8 vertices
    for (int v = 0; v < 8; v++) {
        double angle = v * MATH_TWO_PI / 8.0;
        for (int d = 0; d < 13; d++) {
            double freq = (double)CLOCK_LATTICE_FREQUENCIES_13D[d];
            vertices[idx][d] = math_cos(angle * freq) * math_pow(MATH_PHI, d % 4);
        }
        idx++;
    }
    
    // Octahedron: 6 vertices
    for (int v = 0; v < 6; v++) {
        double angle = v * MATH_TWO_PI / 6.0;
        for (int d = 0; d < 13; d++) {
            double freq = (double)CLOCK_LATTICE_FREQUENCIES_13D[d];
            vertices[idx][d] = math_cos(angle * freq) * math_pow(MATH_PHI, d % 3);
        }
        idx++;
    }
    
    // Dodecahedron: 20 vertices
    for (int v = 0; v < 20; v++) {
        double angle = v * MATH_TWO_PI / 20.0;
        for (int d = 0; d < 13; d++) {
            double freq = (double)CLOCK_LATTICE_FREQUENCIES_13D[d];
            vertices[idx][d] = math_cos(angle * freq) * math_pow(MATH_PHI, d % 5);
        }
        idx++;
    }
    
    // Icosahedron: 12 vertices
    for (int v = 0; v < 12; v++) {
        double angle = v * MATH_TWO_PI / 12.0;
        for (int d = 0; d < 13; d++) {
            double freq = (double)CLOCK_LATTICE_FREQUENCIES_13D[d];
            vertices[idx][d] = math_cos(angle * freq) * math_pow(MATH_PHI, d % 4);
        }
        idx++;
    }
    
    *num_vertices = idx;  // Should be 50
}
```

---

## SUMMARY

### Functions to Move to Math Library:

1. ✅ `clock_map_value_to_lattice_13d()` - Map value to 13D
2. ✅ `clock_map_pair_to_lattice_13d()` - Map (x,y) to 13D
3. ✅ `math_distance_13d()` - Euclidean distance in 13D
4. ✅ `math_generate_platonic_vertices_13d()` - Generate 50 vertices
5. ✅ `CLOCK_LATTICE_FREQUENCIES_13D[13]` - Dimensional frequencies constant

### Files to Create in Math Library:

1. `math/src/clock_lattice_13d.c` - 13D clock lattice operations
2. `math/src/platonic_vertices.c` - Platonic solid vertex generation
3. `math/include/math/clock_lattice_13d.h` - Header for 13D operations
4. `math/include/math/platonic_vertices.h` - Header for vertices

### Benefits:

1. **Reusability** - Any algorithm can use these functions
2. **Separation of Concerns** - Math library = pure mathematics
3. **No Duplication** - Single implementation, used everywhere
4. **Testability** - Math functions can be tested independently
5. **Clarity** - Clear boundary between math and algorithms

---

## NEXT STEPS

1. Create new math library files
2. Move functions from g_triangulation.c
3. Update g_triangulation.c to use math library functions
4. Abstract away OpenSSL dependencies
5. Test thoroughly

---

**Status:** Ready to implement proper separation of concerns
