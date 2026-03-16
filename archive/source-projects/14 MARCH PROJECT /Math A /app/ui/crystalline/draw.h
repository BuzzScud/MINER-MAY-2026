/*
 * Crystalline Draw - Header
 * 
 * Drawing primitives for the Crystalline UI
 * Uses SDL as the basic drawing library with crystalline mathematics
 * 
 * ALL coordinate calculations use prime_* functions
 * SDL is used for actual rendering (SDL_RenderDrawLine, SDL_RenderFillRect, etc.)
 */

#ifndef CRYSTALLINE_DRAW_H
#define CRYSTALLINE_DRAW_H

#include "geometry.h"
#include <SDL2/SDL.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Drawing Style
 */
typedef struct {
    SDL_Color color;            // Primary color
    SDL_Color stroke_color;     // Stroke/outline color
    float stroke_width;         // Stroke width in pixels
    bool filled;                // Fill shape
    bool stroked;               // Draw outline
    float alpha;                // Overall alpha (0.0 - 1.0)
} CrystallineDrawStyle;

/*
 * Style Creation Functions
 */

// Create default style
CrystallineDrawStyle crystalline_draw_style_default(void);

// Create filled style
CrystallineDrawStyle crystalline_draw_style_filled(SDL_Color color);

// Create stroked style
CrystallineDrawStyle crystalline_draw_style_stroked(SDL_Color color, float width);

// Create filled and stroked style
CrystallineDrawStyle crystalline_draw_style_both(SDL_Color fill, SDL_Color stroke, float width);

/*
 * Basic Shape Drawing Functions
 * All use prime_* for coordinate calculations, SDL for rendering
 */

// Draw circle (uses prime_sinf, prime_cosf for point calculation)
void crystalline_draw_circle(SDL_Renderer* renderer, 
                             CrystallinePoint center, 
                             float radius, 
                             CrystallineDrawStyle style);

// Draw arc (uses prime_sinf, prime_cosf, prime_atan2f)
void crystalline_draw_arc(SDL_Renderer* renderer, 
                         CrystallinePoint center, 
                         float radius, 
                         float start_angle, 
                         float end_angle, 
                         CrystallineDrawStyle style);

// Draw line (straight line between two points)
void crystalline_draw_line(SDL_Renderer* renderer, 
                          CrystallinePoint start, 
                          CrystallinePoint end, 
                          CrystallineDrawStyle style);

// Draw polygon (uses prime_sinf, prime_cosf for vertices)
void crystalline_draw_polygon(SDL_Renderer* renderer, 
                             CrystallinePoint center, 
                             float radius, 
                             int sides, 
                             float rotation, 
                             CrystallineDrawStyle style);

// Draw rectangle
void crystalline_draw_rect(SDL_Renderer* renderer, 
                          CrystallineRect rect, 
                          CrystallineDrawStyle style);

/*
 * Advanced Shape Drawing Functions
 */

// Draw golden ratio spiral (uses prime_expf, prime_sinf, prime_cosf)
void crystalline_draw_spiral(SDL_Renderer* renderer, 
                            CrystallinePoint center, 
                            float start_radius, 
                            float end_radius, 
                            float rotations, 
                            CrystallineDrawStyle style);

// Draw Bezier curve (uses prime_* for interpolation)
void crystalline_draw_bezier(SDL_Renderer* renderer, 
                            CrystallinePoint p0, 
                            CrystallinePoint p1, 
                            CrystallinePoint p2, 
                            CrystallinePoint p3, 
                            CrystallineDrawStyle style);

// Draw smooth curve through points (uses prime_* for spline calculation)
void crystalline_draw_curve(SDL_Renderer* renderer, 
                           CrystallinePoint* points, 
                           int count, 
                           CrystallineDrawStyle style);

/*
 * Sacred Geometry Drawing Functions
 */

// Draw flower of life pattern
void crystalline_draw_flower_of_life(SDL_Renderer* renderer, 
                                    CrystallinePoint center, 
                                    float petal_radius, 
                                    int rings, 
                                    CrystallineDrawStyle style);

// Draw metatron's cube
void crystalline_draw_metatron_cube(SDL_Renderer* renderer, 
                                   CrystallinePoint center, 
                                   float radius, 
                                   CrystallineDrawStyle style);

// Draw vesica piscis
void crystalline_draw_vesica_piscis(SDL_Renderer* renderer, 
                                   CrystallinePoint center, 
                                   float radius, 
                                   CrystallineDrawStyle style);

// Draw seed of life (7 circles)
void crystalline_draw_seed_of_life(SDL_Renderer* renderer, 
                                  CrystallinePoint center, 
                                  float radius, 
                                  CrystallineDrawStyle style);

/*
 * 12-Fold Symmetry Drawing Functions
 */

// Draw 12-fold symmetry pattern
void crystalline_draw_twelve_fold(SDL_Renderer* renderer, 
                                 CrystallinePoint center, 
                                 float radius, 
                                 CrystallineDrawStyle style);

// Draw dodecagon (12-sided polygon)
void crystalline_draw_dodecagon(SDL_Renderer* renderer, 
                               CrystallinePoint center, 
                               float radius, 
                               float rotation, 
                               CrystallineDrawStyle style);

/*
 * Clock Lattice Drawing Functions
 */

// Draw Babylonian clock lattice
void crystalline_draw_clock_lattice(SDL_Renderer* renderer, 
                                   CrystallinePoint center, 
                                   float base_radius, 
                                   CrystallineDrawStyle style);

// Draw single clock ring
void crystalline_draw_clock_ring(SDL_Renderer* renderer, 
                                CrystallinePoint center, 
                                float base_radius, 
                                int ring, 
                                CrystallineDrawStyle style);

// Draw clock position marker
void crystalline_draw_clock_marker(SDL_Renderer* renderer, 
                                  CrystallinePoint center, 
                                  float base_radius, 
                                  int ring, 
                                  int position, 
                                  float marker_size, 
                                  CrystallineDrawStyle style);

/*
 * Text Drawing Functions
 */

// Draw text at point (uses SDL_ttf)
void crystalline_draw_text(SDL_Renderer* renderer, 
                          const char* text, 
                          CrystallinePoint position, 
                          SDL_Color color, 
                          void* font);

// Draw text centered at point
void crystalline_draw_text_centered(SDL_Renderer* renderer, 
                                   const char* text, 
                                   CrystallinePoint position, 
                                   SDL_Color color, 
                                   void* font);

// Draw text along arc (radial text)
void crystalline_draw_text_arc(SDL_Renderer* renderer, 
                              const char* text, 
                              CrystallinePoint center, 
                              float radius, 
                              float start_angle, 
                              SDL_Color color, 
                              void* font);

/*
 * Gradient and Effect Functions
 */

// Draw radial gradient (uses prime_* for color interpolation)
void crystalline_draw_radial_gradient(SDL_Renderer* renderer, 
                                     CrystallinePoint center, 
                                     float inner_radius, 
                                     float outer_radius, 
                                     SDL_Color inner_color, 
                                     SDL_Color outer_color);

// Draw glow effect around shape
void crystalline_draw_glow(SDL_Renderer* renderer, 
                          CrystallinePoint center, 
                          float radius, 
                          SDL_Color color, 
                          float intensity);

/*
 * Utility Drawing Functions
 */

// Set SDL render color from style
void crystalline_draw_set_color(SDL_Renderer* renderer, SDL_Color color, float alpha);

// Draw point (single pixel)
void crystalline_draw_point(SDL_Renderer* renderer, CrystallinePoint point, SDL_Color color);

// Draw points array
void crystalline_draw_points(SDL_Renderer* renderer, 
                            CrystallinePoint* points, 
                            int count, 
                            SDL_Color color);

// Draw polyline (connected line segments)
void crystalline_draw_polyline(SDL_Renderer* renderer, 
                              CrystallinePoint* points, 
                              int count, 
                              CrystallineDrawStyle style);

// Fill polygon
void crystalline_draw_filled_polygon(SDL_Renderer* renderer, 
                                    CrystallinePoint* points, 
                                    int count, 
                                    SDL_Color color);

/*
 * Helper Functions
 */

// Calculate points on circle (uses prime_sinf, prime_cosf)
void crystalline_draw_circle_points(CrystallinePoint center, 
                                   float radius, 
                                   int segments, 
                                   CrystallinePoint* out_points);

// Calculate points on arc (uses prime_sinf, prime_cosf)
void crystalline_draw_arc_points(CrystallinePoint center, 
                                float radius, 
                                float start_angle, 
                                float end_angle, 
                                int segments, 
                                CrystallinePoint* out_points);

// Calculate points on spiral (uses prime_expf, prime_sinf, prime_cosf)
void crystalline_draw_spiral_points(CrystallinePoint center, 
                                   float start_radius, 
                                   float end_radius, 
                                   float rotations, 
                                   int segments, 
                                   CrystallinePoint* out_points);

// Calculate Bezier curve points (uses prime_* for interpolation)
void crystalline_draw_bezier_points(CrystallinePoint p0, 
                                   CrystallinePoint p1, 
                                   CrystallinePoint p2, 
                                   CrystallinePoint p3, 
                                   int segments, 
                                   CrystallinePoint* out_points);

#ifdef __cplusplus
}
#endif

#endif /* CRYSTALLINE_DRAW_H */