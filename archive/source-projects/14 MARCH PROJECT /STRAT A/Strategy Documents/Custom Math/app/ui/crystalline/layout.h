/*
 * Crystalline Layout - Header
 * 
 * Layout engine for the Crystalline UI
 * Provides 6 layout types based on sacred geometry
 * 
 * Layout Types:
 * 1. Radial - Elements arranged in circles (12-fold symmetry)
 * 2. Spiral - Elements arranged in golden ratio spiral
 * 3. Grid - Elements arranged in sacred geometry grid
 * 4. Clock - Elements positioned on Babylonian clock lattice
 * 5. Flower - Elements arranged in Flower of Life pattern
 * 6. Metatron - Elements arranged in Metatron's Cube pattern
 */

#ifndef CRYSTALLINE_LAYOUT_H
#define CRYSTALLINE_LAYOUT_H

#include "geometry.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Layout Types
 */
typedef enum {
    CRYSTALLINE_LAYOUT_RADIAL,      // Circular arrangement with 12-fold symmetry
    CRYSTALLINE_LAYOUT_SPIRAL,      // Golden ratio spiral arrangement
    CRYSTALLINE_LAYOUT_GRID,        // Sacred geometry grid
    CRYSTALLINE_LAYOUT_CLOCK,       // Babylonian clock lattice
    CRYSTALLINE_LAYOUT_FLOWER,      // Flower of Life pattern
    CRYSTALLINE_LAYOUT_METATRON     // Metatron's Cube pattern
} CrystallineLayoutType;

/*
 * Layout Configuration
 */
typedef struct {
    CrystallineLayoutType type;     // Layout type
    CrystallinePoint center;        // Center point of layout
    float base_radius;              // Base radius for calculations
    int symmetry;                   // Symmetry order (default 12)
    float spacing;                  // Spacing between elements
    float rotation;                 // Overall rotation (radians)
    bool auto_scale;                // Auto-scale to fit elements
    int max_elements;               // Maximum elements to layout
} CrystallineLayoutConfig;

/*
 * Layout Result
 */
typedef struct {
    CrystallinePoint* positions;    // Array of calculated positions
    int count;                      // Number of positions
    float actual_radius;            // Actual radius used
    CrystallineRect bounds;         // Bounding area
} CrystallineLayoutResult;

/*
 * Layout Creation Functions
 */

// Create layout configuration with defaults
CrystallineLayoutConfig crystalline_layout_config_default(CrystallineLayoutType type);

// Create radial layout (12-fold symmetry by default)
CrystallineLayoutConfig crystalline_layout_config_radial(CrystallinePoint center, 
                                                          float radius, 
                                                          int symmetry);

// Create spiral layout (golden ratio growth)
CrystallineLayoutConfig crystalline_layout_config_spiral(CrystallinePoint center, 
                                                          float start_radius, 
                                                          float spacing);

// Create grid layout (sacred geometry proportions)
CrystallineLayoutConfig crystalline_layout_config_grid(CrystallinePoint center, 
                                                        float cell_size, 
                                                        int rows, 
                                                        int cols);

// Create clock layout (Babylonian clock lattice)
CrystallineLayoutConfig crystalline_layout_config_clock(CrystallinePoint center, 
                                                         float base_radius);

// Create flower of life layout
CrystallineLayoutConfig crystalline_layout_config_flower(CrystallinePoint center, 
                                                          float petal_radius, 
                                                          int rings);

// Create metatron's cube layout
CrystallineLayoutConfig crystalline_layout_config_metatron(CrystallinePoint center, 
                                                            float radius);

/*
 * Layout Calculation Functions
 */

// Calculate positions for N elements using the layout configuration
CrystallineLayoutResult crystalline_layout_calculate(CrystallineLayoutConfig config, 
                                                      int num_elements);

// Calculate single position for element at index
CrystallinePoint crystalline_layout_position(CrystallineLayoutConfig config, 
                                              int index, 
                                              int total);

// Free layout result
void crystalline_layout_result_free(CrystallineLayoutResult result);

/*
 * Radial Layout Functions
 */

// Calculate position on radial layout
CrystallinePoint crystalline_layout_radial_position(CrystallinePoint center, 
                                                     float radius, 
                                                     int index, 
                                                     int total, 
                                                     int symmetry);

// Calculate positions for multiple rings
CrystallineLayoutResult crystalline_layout_radial_rings(CrystallinePoint center, 
                                                         float inner_radius, 
                                                         float outer_radius, 
                                                         int rings, 
                                                         int elements_per_ring);

/*
 * Spiral Layout Functions
 */

// Calculate position on golden ratio spiral
CrystallinePoint crystalline_layout_spiral_position(CrystallinePoint center, 
                                                     float start_radius, 
                                                     float spacing, 
                                                     int index);

// Calculate spiral with specific growth rate
CrystallinePoint crystalline_layout_spiral_custom(CrystallinePoint center, 
                                                   float start_radius, 
                                                   float growth_rate, 
                                                   int index);

/*
 * Grid Layout Functions
 */

// Calculate position on sacred geometry grid
CrystallinePoint crystalline_layout_grid_position(CrystallinePoint center, 
                                                   float cell_size, 
                                                   int row, 
                                                   int col, 
                                                   int total_rows, 
                                                   int total_cols);

// Calculate grid with golden ratio proportions
CrystallineLayoutResult crystalline_layout_grid_golden(CrystallinePoint center, 
                                                        float width, 
                                                        float height, 
                                                        int rows, 
                                                        int cols);

/*
 * Clock Layout Functions
 */

// Calculate position on clock lattice
CrystallinePoint crystalline_layout_clock_position(CrystallinePoint center, 
                                                    float base_radius, 
                                                    int ring, 
                                                    int position);

// Calculate positions for all positions in a ring
CrystallineLayoutResult crystalline_layout_clock_ring(CrystallinePoint center, 
                                                       float base_radius, 
                                                       int ring);

// Calculate positions across multiple rings
CrystallineLayoutResult crystalline_layout_clock_multi_ring(CrystallinePoint center, 
                                                             float base_radius, 
                                                             int start_ring, 
                                                             int end_ring);

/*
 * Flower of Life Layout Functions
 */

// Calculate position on flower of life pattern
CrystallinePoint crystalline_layout_flower_position(CrystallinePoint center, 
                                                     float petal_radius, 
                                                     int petal, 
                                                     int ring);

// Calculate all positions for flower of life with N rings
CrystallineLayoutResult crystalline_layout_flower_rings(CrystallinePoint center, 
                                                         float petal_radius, 
                                                         int rings);

/*
 * Metatron's Cube Layout Functions
 */

// Calculate position on metatron's cube (13 points)
CrystallinePoint crystalline_layout_metatron_position(CrystallinePoint center, 
                                                       float radius, 
                                                       int vertex);

// Calculate all 13 positions of metatron's cube
CrystallineLayoutResult crystalline_layout_metatron_all(CrystallinePoint center, 
                                                         float radius);

/*
 * Layout Utility Functions
 */

// Calculate bounding rectangle for positions
CrystallineRect crystalline_layout_bounds(CrystallinePoint* positions, int count);

// Scale layout to fit within bounds
void crystalline_layout_scale_to_fit(CrystallineLayoutResult* result, 
                                     CrystallineRect target_bounds);

// Rotate entire layout around center
void crystalline_layout_rotate(CrystallineLayoutResult* result, 
                               CrystallinePoint center, 
                               float angle);

// Translate entire layout
void crystalline_layout_translate(CrystallineLayoutResult* result, 
                                  float dx, 
                                  float dy);

/*
 * Layout Animation Functions
 */

// Interpolate between two layouts
CrystallineLayoutResult crystalline_layout_interpolate(CrystallineLayoutResult from, 
                                                        CrystallineLayoutResult to, 
                                                        float t);

// Animate layout transition (returns position for element at time t)
CrystallinePoint crystalline_layout_animate_position(CrystallinePoint from, 
                                                      CrystallinePoint to, 
                                                      float t, 
                                                      bool use_spiral);

#ifdef __cplusplus
}
#endif

#endif /* CRYSTALLINE_LAYOUT_H */