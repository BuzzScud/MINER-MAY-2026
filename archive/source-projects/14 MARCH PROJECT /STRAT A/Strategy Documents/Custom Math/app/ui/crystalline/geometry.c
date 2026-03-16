/*
 * Crystalline Geometry - Implementation
 * 
 * Core geometry system for the Crystalline UI
 * ALL calculations use prime_* functions (NO math.h)
 */

#include "geometry.h"
#include <string.h>

/*
 * Point Creation Functions
 */

CrystallinePoint crystalline_point_cartesian(float x, float y) {
    CrystallinePoint point;
    point.x = x;
    point.y = y;
    point.angle = 0.0f;
    point.radius = 0.0f;
    point.cart_valid = true;
    point.polar_valid = false;
    return point;
}

CrystallinePoint crystalline_point_polar(float angle, float radius) {
    CrystallinePoint point;
    point.angle = angle;
    point.radius = radius;
    point.x = 0.0f;
    point.y = 0.0f;
    point.polar_valid = true;
    point.cart_valid = false;
    
    // Calculate Cartesian coordinates using prime_* functions
    crystalline_point_update_cartesian(&point);
    
    return point;
}

CrystallinePoint crystalline_point_clock(int ring, int position, float base_radius) {
    CrystallineClockPosition clock_pos = crystalline_clock_position(ring, position);
    return crystalline_clock_to_point(clock_pos, base_radius);
}

CrystallinePoint crystalline_point_zero(void) {
    return crystalline_point_cartesian(0.0f, 0.0f);
}

/*
 * Coordinate Conversion Functions
 */

void crystalline_point_update_polar(CrystallinePoint* point) {
    if (point->polar_valid) return;
    
    // Calculate radius using prime_sqrtf
    point->radius = math_sqrt(point->x * point->x + point->y * point->y);
    
    // Calculate angle using prime_atan2f
    point->angle = prime_atan2f(point->y, point->x);
    
    point->polar_valid = true;
}

void crystalline_point_update_cartesian(CrystallinePoint* point) {
    if (point->cart_valid) return;
    
    // Calculate Cartesian coordinates using prime_sinf and prime_cosf
    point->x = point->radius * math_cos(point->angle);
    point->y = point->radius * math_sin(point->angle);
    
    point->cart_valid = true;
}

/*
 * Distance and Angle Functions
 */

float crystalline_distance(CrystallinePoint a, CrystallinePoint b) {
    float dx = b.x - a.x;
    float dy = b.y - a.y;
    return math_sqrt(dx * dx + dy * dy);
}

float crystalline_distance_squared(CrystallinePoint a, CrystallinePoint b) {
    float dx = b.x - a.x;
    float dy = b.y - a.y;
    return dx * dx + dy * dy;
}

float crystalline_angle_between(CrystallinePoint a, CrystallinePoint b) {
    float dx = b.x - a.x;
    float dy = b.y - a.y;
    return prime_atan2f(dy, dx);
}

float crystalline_angle_difference(float angle1, float angle2) {
    float diff = angle2 - angle1;
    
    // Normalize to [-π, π]
    while (diff > M_PI) diff -= CRYSTALLINE_TWO_PI;
    while (diff < -M_PI) diff += CRYSTALLINE_TWO_PI;
    
    return diff;
}

/*
 * Geometric Operations
 */

CrystallinePoint crystalline_point_add(CrystallinePoint a, CrystallinePoint b) {
    return crystalline_point_cartesian(a.x + b.x, a.y + b.y);
}

CrystallinePoint crystalline_point_subtract(CrystallinePoint a, CrystallinePoint b) {
    return crystalline_point_cartesian(a.x - b.x, a.y - b.y);
}

CrystallinePoint crystalline_point_scale(CrystallinePoint point, float scale) {
    return crystalline_point_cartesian(point.x * scale, point.y * scale);
}

CrystallinePoint crystalline_point_rotate(CrystallinePoint point, float angle) {
    // Use prime_sinf and prime_cosf for rotation
    float cos_a = math_cos(angle);
    float sin_a = math_sin(angle);
    
    float new_x = point.x * cos_a - point.y * sin_a;
    float new_y = point.x * sin_a + point.y * cos_a;
    
    return crystalline_point_cartesian(new_x, new_y);
}

CrystallinePoint crystalline_point_rotate_around(CrystallinePoint point, 
                                                  CrystallinePoint center, 
                                                  float angle) {
    // Translate to origin
    CrystallinePoint translated = crystalline_point_subtract(point, center);
    
    // Rotate
    CrystallinePoint rotated = crystalline_point_rotate(translated, angle);
    
    // Translate back
    return crystalline_point_add(rotated, center);
}

CrystallinePoint crystalline_point_lerp(CrystallinePoint a, CrystallinePoint b, float t) {
    float x = a.x + (b.x - a.x) * t;
    float y = a.y + (b.y - a.y) * t;
    return crystalline_point_cartesian(x, y);
}

CrystallinePoint crystalline_point_spiral_lerp(CrystallinePoint a, CrystallinePoint b, float t) {
    // Ensure polar coordinates are valid
    CrystallinePoint a_copy = a;
    CrystallinePoint b_copy = b;
    crystalline_point_update_polar(&a_copy);
    crystalline_point_update_polar(&b_copy);
    
    // Interpolate angle linearly
    float angle = a_copy.angle + (b_copy.angle - a_copy.angle) * t;
    
    // Interpolate radius using golden ratio growth
    // r(t) = r_a * φ^t where φ is adjusted to reach r_b at t=1
    float radius;
    if (b_copy.radius > 0.0f && a_copy.radius > 0.0f) {
        float growth = math_log(b_copy.radius / a_copy.radius);
        radius = a_copy.radius * math_exp(growth * t);
    } else {
        radius = a_copy.radius + (b_copy.radius - a_copy.radius) * t;
    }
    
    return crystalline_point_polar(angle, radius);
}

/*
 * Clock Lattice Functions
 */

CrystallineClockPosition crystalline_clock_position(int ring, int position) {
    CrystallineClockPosition clock_pos;
    clock_pos.ring = ring;
    clock_pos.position = position;
    clock_pos.angle = crystalline_clock_position_angle(ring, position);
    clock_pos.radius = crystalline_clock_ring_radius(ring);
    return clock_pos;
}

CrystallinePoint crystalline_clock_to_point(CrystallineClockPosition clock_pos, float base_radius) {
    float radius = clock_pos.radius * base_radius;
    return crystalline_point_polar(clock_pos.angle, radius);
}

int crystalline_clock_ring_positions(int ring) {
    switch (ring) {
        case 0: return 12;   // Hours
        case 1: return 60;   // Minutes
        case 2: return 60;   // Seconds
        case 3: return 100;  // Milliseconds
        default: return 12;
    }
}

float crystalline_clock_position_angle(int ring, int position) {
    int positions = crystalline_clock_ring_positions(ring);
    
    // Calculate angle: start at top (12 o'clock = -π/2), go clockwise
    // position is 1-based, so position 1 is at top
    float angle = -M_PI / 2.0f + (CRYSTALLINE_TWO_PI * (position - 1)) / positions;
    
    return angle;
}

float crystalline_clock_ring_radius(int ring) {
    // Use golden ratio spacing for rings
    // Ring 0 (innermost) = φ^0 = 1.0
    // Ring 1 = φ^1 = 1.618
    // Ring 2 = φ^2 = 2.618
    // Ring 3 = φ^3 = 4.236
    // Normalize to [0.2, 1.0] range
    
    float phi_power = math_pow(CRYSTALLINE_PHI, (float)ring);
    float max_power = math_pow(CRYSTALLINE_PHI, 3.0f);
    
    // Normalize and scale to [0.2, 1.0]
    return 0.2f + 0.8f * (phi_power / max_power);
}

/*
 * Rectangle Functions
 */

CrystallineRect crystalline_rect_create(float x, float y, float width, float height) {
    CrystallineRect rect;
    rect.center = crystalline_point_cartesian(x, y);
    rect.width = width;
    rect.height = height;
    rect.radius = 0.0f;
    rect.sides = 4;  // Rectangle
    rect.rotation = 0.0f;
    return rect;
}

CrystallineRect crystalline_rect_circle(float x, float y, float radius) {
    CrystallineRect rect;
    rect.center = crystalline_point_cartesian(x, y);
    rect.width = radius * 2.0f;
    rect.height = radius * 2.0f;
    rect.radius = radius;
    rect.sides = 0;  // Circle
    rect.rotation = 0.0f;
    return rect;
}

CrystallineRect crystalline_rect_polygon(float x, float y, float radius, int sides) {
    CrystallineRect rect;
    rect.center = crystalline_point_cartesian(x, y);
    rect.width = radius * 2.0f;
    rect.height = radius * 2.0f;
    rect.radius = radius;
    rect.sides = sides;
    rect.rotation = 0.0f;
    return rect;
}

bool crystalline_rect_contains_point(CrystallineRect rect, CrystallinePoint point) {
    if (rect.sides == 0) {
        // Circle: check distance from center
        float dist = crystalline_distance(rect.center, point);
        return dist <= rect.radius;
    } else if (rect.sides == 4 && rect.rotation == 0.0f) {
        // Axis-aligned rectangle: simple bounds check
        float half_w = rect.width / 2.0f;
        float half_h = rect.height / 2.0f;
        float dx = math_abs(point.x - rect.center.x);
        float dy = math_abs(point.y - rect.center.y);
        return dx <= half_w && dy <= half_h;
    } else {
        // Polygon: use winding number algorithm
        // For now, approximate with circle
        float dist = crystalline_distance(rect.center, point);
        return dist <= rect.radius;
    }
}

bool crystalline_rect_intersects(CrystallineRect a, CrystallineRect b) {
    // Simple circle-based intersection for now
    float dist = crystalline_distance(a.center, b.center);
    float radius_sum = math_max(a.radius, a.width / 2.0f) + 
                       math_max(b.radius, b.width / 2.0f);
    return dist <= radius_sum;
}

CrystallinePoint crystalline_rect_center(CrystallineRect rect) {
    return rect.center;
}

/*
 * Sacred Geometry Functions
 */

CrystallinePoint crystalline_golden_spiral(float angle, float scale) {
    // Golden spiral: r = a * φ^(θ/π)
    // where φ is the golden ratio
    float radius = scale * math_pow(CRYSTALLINE_PHI, angle / M_PI);
    return crystalline_point_polar(angle, radius);
}

CrystallinePoint crystalline_flower_of_life_point(int petal, int ring, float radius) {
    // Flower of Life: 6 petals per ring, arranged in 60° increments
    float angle = (CRYSTALLINE_TWO_PI / 6.0f) * petal;
    float r = radius * ring;
    return crystalline_point_polar(angle, r);
}

CrystallinePoint crystalline_metatron_point(int vertex, float radius) {
    // Metatron's Cube: 13 circles (1 center + 12 around)
    if (vertex == 0) {
        return crystalline_point_zero();
    }
    
    // 12 vertices arranged in 12-fold symmetry
    float angle = crystalline_twelve_fold_angle(vertex - 1);
    return crystalline_point_polar(angle, radius);
}

CrystallinePoint crystalline_vesica_piscis_point(float t, float radius) {
    // Vesica Piscis: intersection of two circles
    // Parametric form for the lens shape
    float angle = t * CRYSTALLINE_TWO_PI;
    float r = radius * math_cos(angle / 2.0f);
    return crystalline_point_polar(angle, r);
}

/*
 * 12-Fold Symmetry Functions
 */

float crystalline_twelve_fold_angle(int position) {
    // 12-fold symmetry: 2π/12 = π/6 between positions
    // Position 0 is at right (0°), position 3 is at top (90°)
    return CRYSTALLINE_PI_OVER_6 * position;
}

CrystallinePoint crystalline_twelve_fold_point(int position, float radius) {
    float angle = crystalline_twelve_fold_angle(position);
    return crystalline_point_polar(angle, radius);
}

float crystalline_snap_to_twelve_fold(float angle) {
    // Find nearest 12-fold position
    float normalized = crystalline_normalize_angle(angle);
    int position = (int)((normalized / CRYSTALLINE_PI_OVER_6) + 0.5f);
    position = position % CRYSTALLINE_TWELVE_FOLD;
    return crystalline_twelve_fold_angle(position);
}

/*
 * Utility Functions
 */

float crystalline_normalize_angle(float angle) {
    // Normalize to [0, 2π)
    while (angle < 0.0f) angle += CRYSTALLINE_TWO_PI;
    while (angle >= CRYSTALLINE_TWO_PI) angle -= CRYSTALLINE_TWO_PI;
    return angle;
}

float crystalline_clamp(float value, float min, float max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

float crystalline_lerp(float a, float b, float t) {
    return a + (b - a) * t;
}

float crystalline_smooth_step(float t) {
    // Smooth step: 3t² - 2t³
    t = crystalline_clamp(t, 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

float crystalline_smoother_step(float t) {
    // Smoother step: 6t⁵ - 15t⁴ + 10t³
    t = crystalline_clamp(t, 0.0f, 1.0f);
    return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f);
}