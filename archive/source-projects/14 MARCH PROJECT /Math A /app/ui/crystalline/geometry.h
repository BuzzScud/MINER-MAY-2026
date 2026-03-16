#include "math/types.h"

#define CRYSTALLINE_TWO_PI (2.0f * MATH_PI)
#define CRYSTALLINE_PI_OVER_6 (MATH_PI / 6.0f)
/*
 * Crystalline Geometry - Header
 * 
 * Core geometry system for the Crystalline UI
 * ALL calculations use prime_* functions (NO math.h)
 * 
 * Key Principles:
 * - 12-fold symmetry (2π/12 = π/6 between elements)
 * - Golden ratio (φ = 1.618...) for proportions
 * - Babylonian clock lattice positioning (12, 60, 60, 100)
 * - Sacred geometry patterns
 */

#ifndef CRYSTALLINE_GEOMETRY_H
#define CRYSTALLINE_GEOMETRY_H

#include "math/arithmetic.h"

#define CRYSTALLINE_TWO_PI (2.0f * MATH_PI)
#define CRYSTALLINE_PI_OVER_6 (MATH_PI / 6.0f)
#include "math/transcendental.h"

#define CRYSTALLINE_TWO_PI (2.0f * MATH_PI)
#define CRYSTALLINE_PI_OVER_6 (MATH_PI / 6.0f)
#include "clock_lattice.h"

#define CRYSTALLINE_TWO_PI (2.0f * MATH_PI)
#define CRYSTALLINE_PI_OVER_6 (MATH_PI / 6.0f)
#include <stdbool.h>

#define CRYSTALLINE_TWO_PI (2.0f * MATH_PI)
#define CRYSTALLINE_PI_OVER_6 (MATH_PI / 6.0f)

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Mathematical Constants
 */
#define CRYSTALLINE_PHI 1.618033988749895f          // Golden ratio
#define CRYSTALLINE_PHI_INV 0.618033988749895f      // 1/φ
#define CRYSTALLINE_TWELVE_FOLD 12                   // 12-fold symmetry

/*
 * CrystallinePoint - Position in 2D space
 * 
 * Supports both Cartesian (x, y) and polar (angle, radius) representations
 * All angle calculations use prime_atan2f
 * All distance calculations use prime_sqrtf
 */
typedef struct {
    float x;            // Cartesian X coordinate
    float y;            // Cartesian Y coordinate
    float angle;        // Polar angle (radians, 0 = right, π/2 = up)
    float radius;       // Polar radius
    bool polar_valid;   // True if polar coordinates are up-to-date
    bool cart_valid;    // True if Cartesian coordinates are up-to-date
} CrystallinePoint;

/*
 * CrystallineRect - Bounding area
 * 
 * Can represent circular, polygonal, or rectangular regions
 * Used for layout and hit detection
 */
typedef struct {
    CrystallinePoint center;    // Center point
    float width;                // Width (for rectangular)
    float height;               // Height (for rectangular)
    float radius;               // Radius (for circular)
    int sides;                  // Number of sides (for polygonal, 0 = circle)
    float rotation;             // Rotation angle (radians)
} CrystallineRect;

/*
 * ClockPosition - Position on Babylonian clock lattice
 * 
 * Maps to the 4-ring Babylonian clock structure:
 * - Ring 0: 12 positions (hours)
 * - Ring 1: 60 positions (minutes)
 * - Ring 2: 60 positions (seconds)
 * - Ring 3: 100 positions (milliseconds)
 */
typedef struct {
    int ring;           // Ring number (0-3)
    int position;       // Position on ring (1-based)
    float angle;        // Calculated angle (radians)
    float radius;       // Calculated radius (normalized 0-1)
} CrystallineClockPosition;

/*
 * Point Creation Functions
 */

// Create point from Cartesian coordinates
CrystallinePoint crystalline_point_cartesian(float x, float y);

// Create point from polar coordinates (uses prime_sinf, prime_cosf)
CrystallinePoint crystalline_point_polar(float angle, float radius);

// Create point from clock position (uses Babylonian clock mathematics)
CrystallinePoint crystalline_point_clock(int ring, int position, float base_radius);

// Create point at origin
CrystallinePoint crystalline_point_zero(void);

/*
 * Coordinate Conversion Functions
 */

// Ensure polar coordinates are calculated (uses prime_atan2f, prime_sqrtf)
void crystalline_point_update_polar(CrystallinePoint* point);

// Ensure Cartesian coordinates are calculated (uses prime_sinf, prime_cosf)
void crystalline_point_update_cartesian(CrystallinePoint* point);

/*
 * Distance and Angle Functions
 */

// Calculate distance between two points (uses prime_sqrtf)
float crystalline_distance(CrystallinePoint a, CrystallinePoint b);

// Calculate squared distance (avoids sqrt for performance)
float crystalline_distance_squared(CrystallinePoint a, CrystallinePoint b);

// Calculate angle from point a to point b (uses prime_atan2f)
float crystalline_angle_between(CrystallinePoint a, CrystallinePoint b);

// Calculate angle difference (shortest path, handles wrapping)
float crystalline_angle_difference(float angle1, float angle2);

/*
 * Geometric Operations
 */

// Add two points (vector addition)
CrystallinePoint crystalline_point_add(CrystallinePoint a, CrystallinePoint b);

// Subtract two points (vector subtraction)
CrystallinePoint crystalline_point_subtract(CrystallinePoint a, CrystallinePoint b);

// Scale point by factor
CrystallinePoint crystalline_point_scale(CrystallinePoint point, float scale);

// Rotate point around origin (uses prime_sinf, prime_cosf)
CrystallinePoint crystalline_point_rotate(CrystallinePoint point, float angle);

// Rotate point around center (uses prime_sinf, prime_cosf)
CrystallinePoint crystalline_point_rotate_around(CrystallinePoint point, 
                                                  CrystallinePoint center, 
                                                  float angle);

// Interpolate between two points (linear)
CrystallinePoint crystalline_point_lerp(CrystallinePoint a, CrystallinePoint b, float t);

// Interpolate between two points (using golden ratio spiral)
CrystallinePoint crystalline_point_spiral_lerp(CrystallinePoint a, CrystallinePoint b, float t);

/*
 * Clock Lattice Functions
 */

// Create clock position
CrystallineClockPosition crystalline_clock_position(int ring, int position);

// Convert clock position to point (uses Babylonian clock mathematics)
CrystallinePoint crystalline_clock_to_point(CrystallineClockPosition clock_pos, float base_radius);

// Get number of positions in a ring (12, 60, 60, 100)
int crystalline_clock_ring_positions(int ring);

// Get angle for position in ring (uses prime_* for calculation)
float crystalline_clock_position_angle(int ring, int position);

// Get radius for ring (normalized 0-1, uses golden ratio spacing)
float crystalline_clock_ring_radius(int ring);

/*
 * Rectangle Functions
 */

// Create rectangular region
CrystallineRect crystalline_rect_create(float x, float y, float width, float height);

// Create circular region
CrystallineRect crystalline_rect_circle(float x, float y, float radius);

// Create polygonal region (uses 12-fold symmetry by default)
CrystallineRect crystalline_rect_polygon(float x, float y, float radius, int sides);

// Check if point is inside rectangle
bool crystalline_rect_contains_point(CrystallineRect rect, CrystallinePoint point);

// Check if two rectangles intersect
bool crystalline_rect_intersects(CrystallineRect a, CrystallineRect b);

// Get center point of rectangle
CrystallinePoint crystalline_rect_center(CrystallineRect rect);

/*
 * Sacred Geometry Functions
 */

// Calculate golden ratio spiral point (uses prime_expf for growth)
CrystallinePoint crystalline_golden_spiral(float angle, float scale);

// Calculate point on flower of life pattern
CrystallinePoint crystalline_flower_of_life_point(int petal, int ring, float radius);

// Calculate point on metatron's cube
CrystallinePoint crystalline_metatron_point(int vertex, float radius);

// Calculate point on vesica piscis
CrystallinePoint crystalline_vesica_piscis_point(float t, float radius);

/*
 * 12-Fold Symmetry Functions
 */

// Get angle for 12-fold symmetry position (0-11)
float crystalline_twelve_fold_angle(int position);

// Get point on 12-fold circle
CrystallinePoint crystalline_twelve_fold_point(int position, float radius);

// Snap angle to nearest 12-fold position
float crystalline_snap_to_twelve_fold(float angle);

/*
 * Utility Functions
 */

// Normalize angle to [0, 2π)
float crystalline_normalize_angle(float angle);

// Clamp value between min and max
float crystalline_clamp(float value, float min, float max);

// Linear interpolation
float crystalline_lerp(float a, float b, float t);

// Smooth step interpolation (uses prime_* for smoothing)
float crystalline_smooth_step(float t);

// Smoother step interpolation (uses prime_* for smoothing)
float crystalline_smoother_step(float t);

#ifdef __cplusplus
}
#endif

#endif /* CRYSTALLINE_GEOMETRY_H */