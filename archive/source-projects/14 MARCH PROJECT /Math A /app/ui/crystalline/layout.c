/*
 * Crystalline Layout - Implementation
 * 
 * Layout engine for the Crystalline UI
 * ALL calculations use prime_* functions
 */

#include "layout.h"
#include <stdlib.h>
#include <string.h>

/*
 * Layout Creation Functions
 */

CrystallineLayoutConfig crystalline_layout_config_default(CrystallineLayoutType type) {
    CrystallineLayoutConfig config;
    config.type = type;
    config.center = crystalline_point_zero();
    config.base_radius = 100.0f;
    config.symmetry = CRYSTALLINE_TWELVE_FOLD;
    config.spacing = 10.0f;
    config.rotation = 0.0f;
    config.auto_scale = false;
    config.max_elements = 1000;
    return config;
}

CrystallineLayoutConfig crystalline_layout_config_radial(CrystallinePoint center, 
                                                          float radius, 
                                                          int symmetry) {
    CrystallineLayoutConfig config = crystalline_layout_config_default(CRYSTALLINE_LAYOUT_RADIAL);
    config.center = center;
    config.base_radius = radius;
    config.symmetry = symmetry;
    return config;
}

CrystallineLayoutConfig crystalline_layout_config_spiral(CrystallinePoint center, 
                                                          float start_radius, 
                                                          float spacing) {
    CrystallineLayoutConfig config = crystalline_layout_config_default(CRYSTALLINE_LAYOUT_SPIRAL);
    config.center = center;
    config.base_radius = start_radius;
    config.spacing = spacing;
    return config;
}

CrystallineLayoutConfig crystalline_layout_config_grid(CrystallinePoint center, 
                                                        float cell_size, 
                                                        int rows, 
                                                        int cols) {
    CrystallineLayoutConfig config = crystalline_layout_config_default(CRYSTALLINE_LAYOUT_GRID);
    config.center = center;
    config.spacing = cell_size;
    config.symmetry = rows;  // Store rows in symmetry
    config.max_elements = cols;  // Store cols in max_elements
    return config;
}

CrystallineLayoutConfig crystalline_layout_config_clock(CrystallinePoint center, 
                                                         float base_radius) {
    CrystallineLayoutConfig config = crystalline_layout_config_default(CRYSTALLINE_LAYOUT_CLOCK);
    config.center = center;
    config.base_radius = base_radius;
    return config;
}

CrystallineLayoutConfig crystalline_layout_config_flower(CrystallinePoint center, 
                                                          float petal_radius, 
                                                          int rings) {
    CrystallineLayoutConfig config = crystalline_layout_config_default(CRYSTALLINE_LAYOUT_FLOWER);
    config.center = center;
    config.base_radius = petal_radius;
    config.symmetry = rings;
    return config;
}

CrystallineLayoutConfig crystalline_layout_config_metatron(CrystallinePoint center, 
                                                            float radius) {
    CrystallineLayoutConfig config = crystalline_layout_config_default(CRYSTALLINE_LAYOUT_METATRON);
    config.center = center;
    config.base_radius = radius;
    return config;
}

/*
 * Layout Calculation Functions
 */

CrystallineLayoutResult crystalline_layout_calculate(CrystallineLayoutConfig config, 
                                                      int num_elements) {
    CrystallineLayoutResult result;
    result.positions = NULL;
    result.count = 0;
    result.actual_radius = config.base_radius;
    
    if (num_elements <= 0 || num_elements > config.max_elements) {
        return result;
    }
    
    // Allocate positions array
    result.positions = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * num_elements);
    if (!result.positions) {
        return result;
    }
    
    result.count = num_elements;
    
    // Calculate positions based on layout type
    for (int i = 0; i < num_elements; i++) {
        result.positions[i] = crystalline_layout_position(config, i, num_elements);
    }
    
    // Calculate bounds
    result.bounds = crystalline_layout_bounds(result.positions, result.count);
    
    // Apply rotation if specified
    if (config.rotation != 0.0f) {
        crystalline_layout_rotate(&result, config.center, config.rotation);
    }
    
    return result;
}

CrystallinePoint crystalline_layout_position(CrystallineLayoutConfig config, 
                                              int index, 
                                              int total) {
    switch (config.type) {
        case CRYSTALLINE_LAYOUT_RADIAL:
            return crystalline_layout_radial_position(config.center, config.base_radius, 
                                                      index, total, config.symmetry);
        
        case CRYSTALLINE_LAYOUT_SPIRAL:
            return crystalline_layout_spiral_position(config.center, config.base_radius, 
                                                      config.spacing, index);
        
        case CRYSTALLINE_LAYOUT_GRID: {
            int cols = config.max_elements;
            int rows = config.symmetry;
            int row = index / cols;
            int col = index % cols;
            return crystalline_layout_grid_position(config.center, config.spacing, 
                                                    row, col, rows, cols);
        }
        
        case CRYSTALLINE_LAYOUT_CLOCK: {
            // Distribute across rings
            int ring = 0;
            int pos_in_ring = index;
            int positions_so_far = 0;
            
            for (ring = 0; ring < 4; ring++) {
                int ring_positions = crystalline_clock_ring_positions(ring);
                if (pos_in_ring < ring_positions) {
                    break;
                }
                pos_in_ring -= ring_positions;
                positions_so_far += ring_positions;
            }
            
            return crystalline_layout_clock_position(config.center, config.base_radius, 
                                                     ring, pos_in_ring + 1);
        }
        
        case CRYSTALLINE_LAYOUT_FLOWER: {
            int rings = config.symmetry;
            int petal = index % 6;
            int ring = index / 6;
            if (ring >= rings) ring = rings - 1;
            return crystalline_layout_flower_position(config.center, config.base_radius, 
                                                      petal, ring);
        }
        
        case CRYSTALLINE_LAYOUT_METATRON:
            if (index < 13) {
                return crystalline_layout_metatron_position(config.center, config.base_radius, 
                                                            index);
            }
            return config.center;
        
        default:
            return config.center;
    }
}

void crystalline_layout_result_free(CrystallineLayoutResult result) {
    if (result.positions) {
        free(result.positions);
    }
}

/*
 * Radial Layout Functions
 */

CrystallinePoint crystalline_layout_radial_position(CrystallinePoint center, 
                                                     float radius, 
                                                     int index, 
                                                     int total, 
                                                     int symmetry) {
    if (total == 0) return center;
    
    // Calculate angle using symmetry
    float angle_step = CRYSTALLINE_TWO_PI / (float)symmetry;
    float angle = angle_step * index;
    
    // Create point at radius and angle
    CrystallinePoint point = crystalline_point_polar(angle, radius);
    
    // Translate to center
    return crystalline_point_add(point, center);
}

CrystallineLayoutResult crystalline_layout_radial_rings(CrystallinePoint center, 
                                                         float inner_radius, 
                                                         float outer_radius, 
                                                         int rings, 
                                                         int elements_per_ring) {
    CrystallineLayoutResult result;
    result.count = rings * elements_per_ring;
    result.positions = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * result.count);
    result.actual_radius = outer_radius;
    
    if (!result.positions) {
        result.count = 0;
        return result;
    }
    
    int idx = 0;
    for (int ring = 0; ring < rings; ring++) {
        // Calculate radius for this ring using golden ratio spacing
        float t = (float)ring / (float)(rings - 1);
        float radius = inner_radius + (outer_radius - inner_radius) * t;
        
        for (int elem = 0; elem < elements_per_ring; elem++) {
            result.positions[idx++] = crystalline_layout_radial_position(
                center, radius, elem, elements_per_ring, elements_per_ring
            );
        }
    }
    
    result.bounds = crystalline_layout_bounds(result.positions, result.count);
    return result;
}

/*
 * Spiral Layout Functions
 */

CrystallinePoint crystalline_layout_spiral_position(CrystallinePoint center, 
                                                     float start_radius, 
                                                     float spacing, 
                                                     int index) {
    // Golden ratio spiral: r = a * φ^(θ/π)
    // Adjust to use spacing parameter
    float angle __attribute__((unused)) = CRYSTALLINE_TWO_PI * index / CRYSTALLINE_TWELVE_FOLD;
    float growth = spacing / (CRYSTALLINE_TWO_PI * start_radius);
    
    CrystallinePoint spiral_point = crystalline_layout_spiral_custom(
        center, start_radius, growth, index
    );
    
    return spiral_point;
}

CrystallinePoint crystalline_layout_spiral_custom(CrystallinePoint center, 
                                                   float start_radius, 
                                                   float growth_rate, 
                                                   int index) {
    // Calculate angle (multiple rotations)
    float angle = CRYSTALLINE_TWO_PI * index / CRYSTALLINE_TWELVE_FOLD;
    
    // Calculate radius with exponential growth
    float radius = start_radius * math_exp(growth_rate * angle);
    
    // Create point
    CrystallinePoint point = crystalline_point_polar(angle, radius);
    
    // Translate to center
    return crystalline_point_add(point, center);
}

/*
 * Grid Layout Functions
 */

CrystallinePoint crystalline_layout_grid_position(CrystallinePoint center, 
                                                   float cell_size, 
                                                   int row, 
                                                   int col, 
                                                   int total_rows, 
                                                   int total_cols) {
    // Calculate offset from center
    float x_offset = (col - (total_cols - 1) / 2.0f) * cell_size;
    float y_offset = (row - (total_rows - 1) / 2.0f) * cell_size;
    
    return crystalline_point_cartesian(center.x + x_offset, center.y + y_offset);
}

CrystallineLayoutResult crystalline_layout_grid_golden(CrystallinePoint center, 
                                                        float width, 
                                                        float height, 
                                                        int rows, 
                                                        int cols) {
    CrystallineLayoutResult result;
    result.count = rows * cols;
    result.positions = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * result.count);
    
    if (!result.positions) {
        result.count = 0;
        return result;
    }
    
    // Use golden ratio for cell sizing
    float cell_width = width / cols;
    float cell_height __attribute__((unused)) = height / rows;
    
    int idx = 0;
    for (int row = 0; row < rows; row++) {
        for (int col = 0; col < cols; col++) {
            result.positions[idx++] = crystalline_layout_grid_position(
                center, cell_width, row, col, rows, cols
            );
        }
    }
    
    result.actual_radius = math_sqrt(width * width + height * height) / 2.0f;
    result.bounds = crystalline_layout_bounds(result.positions, result.count);
    return result;
}

/*
 * Clock Layout Functions
 */

CrystallinePoint crystalline_layout_clock_position(CrystallinePoint center, 
                                                    float base_radius, 
                                                    int ring, 
                                                    int position) {
    CrystallinePoint point = crystalline_point_clock(ring, position, base_radius);
    return crystalline_point_add(point, center);
}

CrystallineLayoutResult crystalline_layout_clock_ring(CrystallinePoint center, 
                                                       float base_radius, 
                                                       int ring) {
    int positions = crystalline_clock_ring_positions(ring);
    
    CrystallineLayoutResult result;
    result.count = positions;
    result.positions = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * positions);
    result.actual_radius = base_radius * crystalline_clock_ring_radius(ring);
    
    if (!result.positions) {
        result.count = 0;
        return result;
    }
    
    for (int i = 0; i < positions; i++) {
        result.positions[i] = crystalline_layout_clock_position(center, base_radius, ring, i + 1);
    }
    
    result.bounds = crystalline_layout_bounds(result.positions, result.count);
    return result;
}

CrystallineLayoutResult crystalline_layout_clock_multi_ring(CrystallinePoint center, 
                                                             float base_radius, 
                                                             int start_ring, 
                                                             int end_ring) {
    // Count total positions
    int total = 0;
    for (int ring = start_ring; ring <= end_ring; ring++) {
        total += crystalline_clock_ring_positions(ring);
    }
    
    CrystallineLayoutResult result;
    result.count = total;
    result.positions = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * total);
    result.actual_radius = base_radius * crystalline_clock_ring_radius(end_ring);
    
    if (!result.positions) {
        result.count = 0;
        return result;
    }
    
    int idx = 0;
    for (int ring = start_ring; ring <= end_ring; ring++) {
        int positions = crystalline_clock_ring_positions(ring);
        for (int pos = 1; pos <= positions; pos++) {
            result.positions[idx++] = crystalline_layout_clock_position(
                center, base_radius, ring, pos
            );
        }
    }
    
    result.bounds = crystalline_layout_bounds(result.positions, result.count);
    return result;
}

/*
 * Flower of Life Layout Functions
 */

CrystallinePoint crystalline_layout_flower_position(CrystallinePoint center, 
                                                     float petal_radius, 
                                                     int petal, 
                                                     int ring) {
    CrystallinePoint point = crystalline_flower_of_life_point(petal, ring, petal_radius);
    return crystalline_point_add(point, center);
}

CrystallineLayoutResult crystalline_layout_flower_rings(CrystallinePoint center, 
                                                         float petal_radius, 
                                                         int rings) {
    // Center + 6 petals per ring
    int total = 1 + (6 * rings);
    
    CrystallineLayoutResult result;
    result.count = total;
    result.positions = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * total);
    result.actual_radius = petal_radius * rings;
    
    if (!result.positions) {
        result.count = 0;
        return result;
    }
    
    // Center point
    result.positions[0] = center;
    
    int idx = 1;
    for (int ring = 1; ring <= rings; ring++) {
        for (int petal = 0; petal < 6; petal++) {
            result.positions[idx++] = crystalline_layout_flower_position(
                center, petal_radius, petal, ring
            );
        }
    }
    
    result.bounds = crystalline_layout_bounds(result.positions, result.count);
    return result;
}

/*
 * Metatron's Cube Layout Functions
 */

CrystallinePoint crystalline_layout_metatron_position(CrystallinePoint center, 
                                                       float radius, 
                                                       int vertex) {
    CrystallinePoint point = crystalline_metatron_point(vertex, radius);
    return crystalline_point_add(point, center);
}

CrystallineLayoutResult crystalline_layout_metatron_all(CrystallinePoint center, 
                                                         float radius) {
    CrystallineLayoutResult result;
    result.count = 13;
    result.positions = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * 13);
    result.actual_radius = radius;
    
    if (!result.positions) {
        result.count = 0;
        return result;
    }
    
    for (int i = 0; i < 13; i++) {
        result.positions[i] = crystalline_layout_metatron_position(center, radius, i);
    }
    
    result.bounds = crystalline_layout_bounds(result.positions, result.count);
    return result;
}

/*
 * Layout Utility Functions
 */

CrystallineRect crystalline_layout_bounds(CrystallinePoint* positions, int count) {
    if (count == 0 || !positions) {
        return crystalline_rect_create(0, 0, 0, 0);
    }
    
    float min_x = positions[0].x;
    float max_x = positions[0].x;
    float min_y = positions[0].y;
    float max_y = positions[0].y;
    
    for (int i = 1; i < count; i++) {
        if (positions[i].x < min_x) min_x = positions[i].x;
        if (positions[i].x > max_x) max_x = positions[i].x;
        if (positions[i].y < min_y) min_y = positions[i].y;
        if (positions[i].y > max_y) max_y = positions[i].y;
    }
    
    float width = max_x - min_x;
    float height = max_y - min_y;
    float center_x = (min_x + max_x) / 2.0f;
    float center_y = (min_y + max_y) / 2.0f;
    
    return crystalline_rect_create(center_x, center_y, width, height);
}

void crystalline_layout_scale_to_fit(CrystallineLayoutResult* result, 
                                     CrystallineRect target_bounds) {
    if (!result || !result->positions || result->count == 0) return;
    
    CrystallinePoint current_center = crystalline_rect_center(result->bounds);
    CrystallinePoint target_center = crystalline_rect_center(target_bounds);
    
    // Calculate scale factor
    float scale_x = target_bounds.width / result->bounds.width;
    float scale_y = target_bounds.height / result->bounds.height;
    float scale = math_min(scale_x, scale_y);
    
    // Scale and translate each position
    for (int i = 0; i < result->count; i++) {
        // Translate to origin
        CrystallinePoint p = crystalline_point_subtract(result->positions[i], current_center);
        
        // Scale
        p = crystalline_point_scale(p, scale);
        
        // Translate to target center
        result->positions[i] = crystalline_point_add(p, target_center);
    }
    
    // Update bounds
    result->bounds = target_bounds;
    result->actual_radius *= scale;
}

void crystalline_layout_rotate(CrystallineLayoutResult* result, 
                               CrystallinePoint center, 
                               float angle) {
    if (!result || !result->positions) return;
    
    for (int i = 0; i < result->count; i++) {
        result->positions[i] = crystalline_point_rotate_around(
            result->positions[i], center, angle
        );
    }
    
    // Update bounds
    result->bounds = crystalline_layout_bounds(result->positions, result->count);
}

void crystalline_layout_translate(CrystallineLayoutResult* result, 
                                  float dx, 
                                  float dy) {
    if (!result || !result->positions) return;
    
    CrystallinePoint offset = crystalline_point_cartesian(dx, dy);
    
    for (int i = 0; i < result->count; i++) {
        result->positions[i] = crystalline_point_add(result->positions[i], offset);
    }
    
    // Update bounds
    result->bounds.center = crystalline_point_add(result->bounds.center, offset);
}

/*
 * Layout Animation Functions
 */

CrystallineLayoutResult crystalline_layout_interpolate(CrystallineLayoutResult from, 
                                                        CrystallineLayoutResult to, 
                                                        float t) {
    int count = from.count < to.count ? from.count : to.count;
    
    CrystallineLayoutResult result;
    result.count = count;
    result.positions = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * count);
    
    if (!result.positions) {
        result.count = 0;
        return result;
    }
    
    for (int i = 0; i < count; i++) {
        result.positions[i] = crystalline_point_lerp(from.positions[i], to.positions[i], t);
    }
    
    result.actual_radius = crystalline_lerp(from.actual_radius, to.actual_radius, t);
    result.bounds = crystalline_layout_bounds(result.positions, result.count);
    
    return result;
}

CrystallinePoint crystalline_layout_animate_position(CrystallinePoint from, 
                                                      CrystallinePoint to, 
                                                      float t, 
                                                      bool use_spiral) {
    if (use_spiral) {
        return crystalline_point_spiral_lerp(from, to, t);
    } else {
        return crystalline_point_lerp(from, to, t);
    }
}