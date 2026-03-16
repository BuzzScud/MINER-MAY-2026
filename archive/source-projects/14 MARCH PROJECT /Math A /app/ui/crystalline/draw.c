/*
 * Crystalline Draw - Implementation
 * 
 * Drawing primitives for the Crystalline UI
 * Uses SDL for rendering, prime_* for all calculations
 */

#include "draw.h"
#include <SDL2/SDL_ttf.h>
#include <stdlib.h>
#include <string.h>

/*
 * Constants
 */
#define CIRCLE_SEGMENTS 64
#define ARC_SEGMENTS 32
#define SPIRAL_SEGMENTS 128
#define BEZIER_SEGMENTS 32

/*
 * Style Creation Functions
 */

CrystallineDrawStyle crystalline_draw_style_default(void) {
    CrystallineDrawStyle style;
    style.color = (SDL_Color){255, 255, 255, 255};
    style.stroke_color = (SDL_Color){255, 255, 255, 255};
    style.stroke_width = 1.0f;
    style.filled = true;
    style.stroked = false;
    style.alpha = 1.0f;
    return style;
}

CrystallineDrawStyle crystalline_draw_style_filled(SDL_Color color) {
    CrystallineDrawStyle style = crystalline_draw_style_default();
    style.color = color;
    style.filled = true;
    style.stroked = false;
    return style;
}

CrystallineDrawStyle crystalline_draw_style_stroked(SDL_Color color, float width) {
    CrystallineDrawStyle style = crystalline_draw_style_default();
    style.stroke_color = color;
    style.stroke_width = width;
    style.filled = false;
    style.stroked = true;
    return style;
}

CrystallineDrawStyle crystalline_draw_style_both(SDL_Color fill, SDL_Color stroke, float width) {
    CrystallineDrawStyle style = crystalline_draw_style_default();
    style.color = fill;
    style.stroke_color = stroke;
    style.stroke_width = width;
    style.filled = true;
    style.stroked = true;
    return style;
}

/*
 * Utility Functions
 */

void crystalline_draw_set_color(SDL_Renderer* renderer, SDL_Color color, float alpha) {
    Uint8 a = (Uint8)(color.a * alpha);
    SDL_SetRenderDrawColor(renderer, color.r, color.g, color.b, a);
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
}

void crystalline_draw_point(SDL_Renderer* renderer, CrystallinePoint point, SDL_Color color) {
    crystalline_draw_set_color(renderer, color, 1.0f);
    SDL_RenderDrawPoint(renderer, (int)point.x, (int)point.y);
}

void crystalline_draw_points(SDL_Renderer* renderer, 
                            CrystallinePoint* points, 
                            int count, 
                            SDL_Color color) {
    crystalline_draw_set_color(renderer, color, 1.0f);
    
    SDL_Point* sdl_points = (SDL_Point*)malloc(sizeof(SDL_Point) * count);
    if (!sdl_points) return;
    
    for (int i = 0; i < count; i++) {
        sdl_points[i].x = (int)points[i].x;
        sdl_points[i].y = (int)points[i].y;
    }
    
    SDL_RenderDrawPoints(renderer, sdl_points, count);
    free(sdl_points);
}

/*
 * Helper Functions - Point Calculation
 */

void crystalline_draw_circle_points(CrystallinePoint center, 
                                   float radius, 
                                   int segments, 
                                   CrystallinePoint* out_points) {
    for (int i = 0; i < segments; i++) {
        float angle = CRYSTALLINE_TWO_PI * i / segments;
        float x = center.x + radius * math_cos(angle);
        float y = center.y + radius * math_sin(angle);
        out_points[i] = crystalline_point_cartesian(x, y);
    }
}

void crystalline_draw_arc_points(CrystallinePoint center, 
                                float radius, 
                                float start_angle, 
                                float end_angle, 
                                int segments, 
                                CrystallinePoint* out_points) {
    float angle_range = end_angle - start_angle;
    
    for (int i = 0; i < segments; i++) {
        float t = (float)i / (float)(segments - 1);
        float angle = start_angle + angle_range * t;
        float x = center.x + radius * math_cos(angle);
        float y = center.y + radius * math_sin(angle);
        out_points[i] = crystalline_point_cartesian(x, y);
    }
}

void crystalline_draw_spiral_points(CrystallinePoint center, 
                                   float start_radius, 
                                   float end_radius, 
                                   float rotations, 
                                   int segments, 
                                   CrystallinePoint* out_points) {
    for (int i = 0; i < segments; i++) {
        float t = (float)i / (float)(segments - 1);
        float angle = CRYSTALLINE_TWO_PI * rotations * t;
        
        // Exponential growth for golden spiral
        float radius;
        if (end_radius > 0.0f && start_radius > 0.0f) {
            float growth = math_log(end_radius / start_radius);
            radius = start_radius * math_exp(growth * t);
        } else {
            radius = start_radius + (end_radius - start_radius) * t;
        }
        
        float x = center.x + radius * math_cos(angle);
        float y = center.y + radius * math_sin(angle);
        out_points[i] = crystalline_point_cartesian(x, y);
    }
}

void crystalline_draw_bezier_points(CrystallinePoint p0, 
                                   CrystallinePoint p1, 
                                   CrystallinePoint p2, 
                                   CrystallinePoint p3, 
                                   int segments, 
                                   CrystallinePoint* out_points) {
    for (int i = 0; i < segments; i++) {
        float t = (float)i / (float)(segments - 1);
        float t2 = t * t;
        float t3 = t2 * t;
        float mt = 1.0f - t;
        float mt2 = mt * mt;
        float mt3 = mt2 * mt;
        
        // Cubic Bezier formula
        float x = mt3 * p0.x + 3.0f * mt2 * t * p1.x + 3.0f * mt * t2 * p2.x + t3 * p3.x;
        float y = mt3 * p0.y + 3.0f * mt2 * t * p1.y + 3.0f * mt * t2 * p2.y + t3 * p3.y;
        
        out_points[i] = crystalline_point_cartesian(x, y);
    }
}

/*
 * Basic Shape Drawing Functions
 */

void crystalline_draw_line(SDL_Renderer* renderer, 
                          CrystallinePoint start, 
                          CrystallinePoint end, 
                          CrystallineDrawStyle style) {
    crystalline_draw_set_color(renderer, style.stroke_color, style.alpha);
    
    // For thick lines, draw multiple parallel lines
    if (style.stroke_width > 1.0f) {
        int width = (int)style.stroke_width;
        for (int i = -width/2; i <= width/2; i++) {
            SDL_RenderDrawLine(renderer, 
                             (int)start.x + i, (int)start.y,
                             (int)end.x + i, (int)end.y);
        }
    } else {
        SDL_RenderDrawLine(renderer, 
                         (int)start.x, (int)start.y,
                         (int)end.x, (int)end.y);
    }
}

void crystalline_draw_polyline(SDL_Renderer* renderer, 
                              CrystallinePoint* points, 
                              int count, 
                              CrystallineDrawStyle style) {
    if (count < 2) return;
    
    for (int i = 0; i < count - 1; i++) {
        crystalline_draw_line(renderer, points[i], points[i + 1], style);
    }
}

void crystalline_draw_circle(SDL_Renderer* renderer, 
                             CrystallinePoint center, 
                             float radius, 
                             CrystallineDrawStyle style) {
    CrystallinePoint* points = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * CIRCLE_SEGMENTS);
    if (!points) return;
    
    crystalline_draw_circle_points(center, radius, CIRCLE_SEGMENTS, points);
    
    if (style.filled) {
        // Fill circle by drawing horizontal lines
        crystalline_draw_set_color(renderer, style.color, style.alpha);
        
        int min_y = (int)(center.y - radius);
        int max_y = (int)(center.y + radius);
        
        for (int y = min_y; y <= max_y; y++) {
            float dy = y - center.y;
            float dx = math_sqrt(radius * radius - dy * dy);
            if (!math_is_nan(dx)) {
                int x1 = (int)(center.x - dx);
                int x2 = (int)(center.x + dx);
                SDL_RenderDrawLine(renderer, x1, y, x2, y);
            }
        }
    }
    
    if (style.stroked) {
        // Draw outline
        crystalline_draw_polyline(renderer, points, CIRCLE_SEGMENTS, style);
        // Close the circle
        crystalline_draw_line(renderer, points[CIRCLE_SEGMENTS - 1], points[0], style);
    }
    
    free(points);
}

void crystalline_draw_arc(SDL_Renderer* renderer, 
                         CrystallinePoint center, 
                         float radius, 
                         float start_angle, 
                         float end_angle, 
                         CrystallineDrawStyle style) {
    CrystallinePoint* points = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * ARC_SEGMENTS);
    if (!points) return;
    
    crystalline_draw_arc_points(center, radius, start_angle, end_angle, ARC_SEGMENTS, points);
    
    if (style.filled) {
        // Fill arc as a pie slice
        crystalline_draw_set_color(renderer, style.color, style.alpha);
        
        // Draw triangles from center to arc points
        for (int i = 0; i < ARC_SEGMENTS - 1; i++) {
            CrystallinePoint triangle[3] = {center, points[i], points[i + 1]};
            crystalline_draw_filled_polygon(renderer, triangle, 3, style.color);
        }
    }
    
    if (style.stroked) {
        crystalline_draw_polyline(renderer, points, ARC_SEGMENTS, style);
    }
    
    free(points);
}

void crystalline_draw_polygon(SDL_Renderer* renderer, 
                             CrystallinePoint center, 
                             float radius, 
                             int sides, 
                             float rotation, 
                             CrystallineDrawStyle style) {
    CrystallinePoint* points = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * sides);
    if (!points) return;
    
    for (int i = 0; i < sides; i++) {
        float angle = rotation + CRYSTALLINE_TWO_PI * i / sides;
        float x = center.x + radius * math_cos(angle);
        float y = center.y + radius * math_sin(angle);
        points[i] = crystalline_point_cartesian(x, y);
    }
    
    if (style.filled) {
        crystalline_draw_filled_polygon(renderer, points, sides, style.color);
    }
    
    if (style.stroked) {
        crystalline_draw_polyline(renderer, points, sides, style);
        // Close the polygon
        crystalline_draw_line(renderer, points[sides - 1], points[0], style);
    }
    
    free(points);
}

void crystalline_draw_rect(SDL_Renderer* renderer, 
                          CrystallineRect rect, 
                          CrystallineDrawStyle style) {
    SDL_Rect sdl_rect;
    sdl_rect.x = (int)(rect.center.x - rect.width / 2.0f);
    sdl_rect.y = (int)(rect.center.y - rect.height / 2.0f);
    sdl_rect.w = (int)rect.width;
    sdl_rect.h = (int)rect.height;
    
    if (style.filled) {
        crystalline_draw_set_color(renderer, style.color, style.alpha);
        SDL_RenderFillRect(renderer, &sdl_rect);
    }
    
    if (style.stroked) {
        crystalline_draw_set_color(renderer, style.stroke_color, style.alpha);
        SDL_RenderDrawRect(renderer, &sdl_rect);
    }
}

void crystalline_draw_filled_polygon(SDL_Renderer* renderer, 
                                    CrystallinePoint* points, 
                                    int count, 
                                    SDL_Color color) {
    if (count < 3) return;
    
    crystalline_draw_set_color(renderer, color, 1.0f);
    
    // Simple scanline fill algorithm
    // Find bounding box
    float min_y = points[0].y;
    float max_y = points[0].y;
    
    for (int i = 1; i < count; i++) {
        if (points[i].y < min_y) min_y = points[i].y;
        if (points[i].y > max_y) max_y = points[i].y;
    }
    
    // For each scanline
    for (int y = (int)min_y; y <= (int)max_y; y++) {
        // Find intersections with polygon edges
        float intersections[32];
        int num_intersections = 0;
        
        for (int i = 0; i < count && num_intersections < 32; i++) {
            int j = (i + 1) % count;
            
            float y1 = points[i].y;
            float y2 = points[j].y;
            
            if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
                float x1 = points[i].x;
                float x2 = points[j].x;
                float x = x1 + (y - y1) * (x2 - x1) / (y2 - y1);
                intersections[num_intersections++] = x;
            }
        }
        
        // Sort intersections
        for (int i = 0; i < num_intersections - 1; i++) {
            for (int j = i + 1; j < num_intersections; j++) {
                if (intersections[i] > intersections[j]) {
                    float temp = intersections[i];
                    intersections[i] = intersections[j];
                    intersections[j] = temp;
                }
            }
        }
        
        // Draw lines between pairs of intersections
        for (int i = 0; i < num_intersections - 1; i += 2) {
            SDL_RenderDrawLine(renderer, 
                             (int)intersections[i], y,
                             (int)intersections[i + 1], y);
        }
    }
}

/*
 * Advanced Shape Drawing Functions
 */

void crystalline_draw_spiral(SDL_Renderer* renderer, 
                            CrystallinePoint center, 
                            float start_radius, 
                            float end_radius, 
                            float rotations, 
                            CrystallineDrawStyle style) {
    CrystallinePoint* points = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * SPIRAL_SEGMENTS);
    if (!points) return;
    
    crystalline_draw_spiral_points(center, start_radius, end_radius, rotations, 
                                  SPIRAL_SEGMENTS, points);
    
    crystalline_draw_polyline(renderer, points, SPIRAL_SEGMENTS, style);
    
    free(points);
}

void crystalline_draw_bezier(SDL_Renderer* renderer, 
                            CrystallinePoint p0, 
                            CrystallinePoint p1, 
                            CrystallinePoint p2, 
                            CrystallinePoint p3, 
                            CrystallineDrawStyle style) {
    CrystallinePoint* points = (CrystallinePoint*)malloc(sizeof(CrystallinePoint) * BEZIER_SEGMENTS);
    if (!points) return;
    
    crystalline_draw_bezier_points(p0, p1, p2, p3, BEZIER_SEGMENTS, points);
    
    crystalline_draw_polyline(renderer, points, BEZIER_SEGMENTS, style);
    
    free(points);
}

void crystalline_draw_curve(SDL_Renderer* renderer, 
                           CrystallinePoint* points, 
                           int count, 
                           CrystallineDrawStyle style) {
    if (count < 2) return;
    
    // Simple curve through points using Catmull-Rom spline
    for (int i = 0; i < count - 1; i++) {
        CrystallinePoint p0 = (i > 0) ? points[i - 1] : points[i];
        CrystallinePoint p1 = points[i];
        CrystallinePoint p2 = points[i + 1];
        CrystallinePoint p3 = (i < count - 2) ? points[i + 2] : points[i + 1];
        
        // Convert to Bezier control points
        CrystallinePoint b1 = crystalline_point_cartesian(
            p1.x + (p2.x - p0.x) / 6.0f,
            p1.y + (p2.y - p0.y) / 6.0f
        );
        CrystallinePoint b2 = crystalline_point_cartesian(
            p2.x - (p3.x - p1.x) / 6.0f,
            p2.y - (p3.y - p1.y) / 6.0f
        );
        
        crystalline_draw_bezier(renderer, p1, b1, b2, p2, style);
    }
}

/*
 * Sacred Geometry Drawing Functions
 */

void crystalline_draw_flower_of_life(SDL_Renderer* renderer, 
                                    CrystallinePoint center, 
                                    float petal_radius, 
                                    int rings, 
                                    CrystallineDrawStyle style) {
    // Draw center circle
    crystalline_draw_circle(renderer, center, petal_radius, style);
    
    // Draw petals in rings
    for (int ring = 1; ring <= rings; ring++) {
        for (int petal = 0; petal < 6; petal++) {
            CrystallinePoint petal_center = crystalline_flower_of_life_point(
                petal, ring, petal_radius
            );
            petal_center = crystalline_point_add(petal_center, center);
            crystalline_draw_circle(renderer, petal_center, petal_radius, style);
        }
    }
}

void crystalline_draw_metatron_cube(SDL_Renderer* renderer, 
                                   CrystallinePoint center, 
                                   float radius, 
                                   CrystallineDrawStyle style) {
    // Draw 13 circles (1 center + 12 around)
    crystalline_draw_circle(renderer, center, radius / 3.0f, style);
    
    for (int i = 0; i < 12; i++) {
        CrystallinePoint vertex = crystalline_metatron_point(i + 1, radius);
        vertex = crystalline_point_add(vertex, center);
        crystalline_draw_circle(renderer, vertex, radius / 3.0f, style);
    }
    
    // Draw connecting lines
    CrystallineDrawStyle line_style = crystalline_draw_style_stroked(style.stroke_color, 1.0f);
    
    // Connect center to all outer circles
    for (int i = 0; i < 12; i++) {
        CrystallinePoint vertex = crystalline_metatron_point(i + 1, radius);
        vertex = crystalline_point_add(vertex, center);
        crystalline_draw_line(renderer, center, vertex, line_style);
    }
    
    // Connect outer circles to each other
    for (int i = 0; i < 12; i++) {
        CrystallinePoint v1 = crystalline_metatron_point(i + 1, radius);
        v1 = crystalline_point_add(v1, center);
        
        for (int j = i + 1; j < 12; j++) {
            CrystallinePoint v2 = crystalline_metatron_point(j + 1, radius);
            v2 = crystalline_point_add(v2, center);
            
            // Only connect adjacent and opposite vertices
            int diff = j - i;
            if (diff == 1 || diff == 6) {
                crystalline_draw_line(renderer, v1, v2, line_style);
            }
        }
    }
}

void crystalline_draw_vesica_piscis(SDL_Renderer* renderer, 
                                   CrystallinePoint center, 
                                   float radius, 
                                   CrystallineDrawStyle style) {
    // Two overlapping circles
    CrystallinePoint left = crystalline_point_cartesian(center.x - radius / 2.0f, center.y);
    CrystallinePoint right = crystalline_point_cartesian(center.x + radius / 2.0f, center.y);
    
    crystalline_draw_circle(renderer, left, radius, style);
    crystalline_draw_circle(renderer, right, radius, style);
}

void crystalline_draw_seed_of_life(SDL_Renderer* renderer, 
                                  CrystallinePoint center, 
                                  float radius, 
                                  CrystallineDrawStyle style) {
    // Center circle
    crystalline_draw_circle(renderer, center, radius, style);
    
    // 6 surrounding circles
    for (int i = 0; i < 6; i++) {
        float angle = CRYSTALLINE_TWO_PI * i / 6.0f;
        CrystallinePoint circle_center = crystalline_point_cartesian(
            center.x + radius * math_cos(angle),
            center.y + radius * math_sin(angle)
        );
        crystalline_draw_circle(renderer, circle_center, radius, style);
    }
}

/*
 * 12-Fold Symmetry Drawing Functions
 */

void crystalline_draw_twelve_fold(SDL_Renderer* renderer, 
                                 CrystallinePoint center, 
                                 float radius, 
                                 CrystallineDrawStyle style) {
    // Draw 12 lines radiating from center
    for (int i = 0; i < 12; i++) {
        float angle = crystalline_twelve_fold_angle(i);
        CrystallinePoint end = crystalline_point_cartesian(
            center.x + radius * math_cos(angle),
            center.y + radius * math_sin(angle)
        );
        crystalline_draw_line(renderer, center, end, style);
    }
}

void crystalline_draw_dodecagon(SDL_Renderer* renderer, 
                               CrystallinePoint center, 
                               float radius, 
                               float rotation, 
                               CrystallineDrawStyle style) {
    crystalline_draw_polygon(renderer, center, radius, 12, rotation, style);
}

/*
 * Clock Lattice Drawing Functions
 */

void crystalline_draw_clock_lattice(SDL_Renderer* renderer, 
                                   CrystallinePoint center, 
                                   float base_radius, 
                                   CrystallineDrawStyle style) {
    // Draw all 4 rings
    for (int ring = 0; ring < 4; ring++) {
        crystalline_draw_clock_ring(renderer, center, base_radius, ring, style);
    }
}

void crystalline_draw_clock_ring(SDL_Renderer* renderer, 
                                CrystallinePoint center, 
                                float base_radius, 
                                int ring, 
                                CrystallineDrawStyle style) {
    float radius = base_radius * crystalline_clock_ring_radius(ring);
    
    // Draw ring circle
    crystalline_draw_circle(renderer, center, radius, style);
    
    // Draw position markers
    int positions = crystalline_clock_ring_positions(ring);
    for (int pos = 1; pos <= positions; pos++) {
        crystalline_draw_clock_marker(renderer, center, base_radius, ring, pos, 3.0f, style);
    }
}

void crystalline_draw_clock_marker(SDL_Renderer* renderer, 
                                  CrystallinePoint center, 
                                  float base_radius, 
                                  int ring, 
                                  int position, 
                                  float marker_size, 
                                  CrystallineDrawStyle style) {
    CrystallinePoint pos = crystalline_point_clock(ring, position, base_radius);
    pos = crystalline_point_add(pos, center);
    crystalline_draw_circle(renderer, pos, marker_size, style);
}

/*
 * Gradient and Effect Functions
 */

void crystalline_draw_radial_gradient(SDL_Renderer* renderer, 
                                     CrystallinePoint center, 
                                     float inner_radius, 
                                     float outer_radius, 
                                     SDL_Color inner_color, 
                                     SDL_Color outer_color) {
    int steps = 32;
    
    for (int i = 0; i < steps; i++) {
        float t = (float)i / (float)steps;
        float radius = inner_radius + (outer_radius - inner_radius) * t;
        
        // Interpolate color
        SDL_Color color;
        color.r = (Uint8)(inner_color.r + (outer_color.r - inner_color.r) * t);
        color.g = (Uint8)(inner_color.g + (outer_color.g - inner_color.g) * t);
        color.b = (Uint8)(inner_color.b + (outer_color.b - inner_color.b) * t);
        color.a = (Uint8)(inner_color.a + (outer_color.a - inner_color.a) * t);
        
        CrystallineDrawStyle style = crystalline_draw_style_stroked(color, 1.0f);
        crystalline_draw_circle(renderer, center, radius, style);
    }
}

void crystalline_draw_glow(SDL_Renderer* renderer, 
                          CrystallinePoint center, 
                          float radius, 
                          SDL_Color color, 
                          float intensity) {
    int layers = 10;
    
    for (int i = 0; i < layers; i++) {
        float t = (float)i / (float)layers;
        float r = radius * (1.0f + t * 0.5f);
        
        SDL_Color glow_color = color;
        glow_color.a = (Uint8)(color.a * intensity * (1.0f - t));
        
        CrystallineDrawStyle style = crystalline_draw_style_stroked(glow_color, 2.0f);
        crystalline_draw_circle(renderer, center, r, style);
    }
}
// Text drawing functions
void crystalline_draw_text(SDL_Renderer* renderer, 
                          const char* text,
                          CrystallinePoint position,
                          SDL_Color color,
                          void* font) {
    if (!renderer || !font || !text) return;
    
    TTF_Font* ttf_font = (TTF_Font*)font;
    SDL_Surface* surface = TTF_RenderText_Blended(ttf_font, text, color);
    if (!surface) return;
    
    SDL_Texture* texture = SDL_CreateTextureFromSurface(renderer, surface);
    if (!texture) {
        SDL_FreeSurface(surface);
        return;
    }
    
    SDL_Rect dest = {
        (int)position.x,
        (int)position.y,
        surface->w,
        surface->h
    };
    
    SDL_RenderCopy(renderer, texture, NULL, &dest);
    
    SDL_DestroyTexture(texture);
    SDL_FreeSurface(surface);
}

void crystalline_draw_text_centered(SDL_Renderer* renderer,
                                    const char* text,
                                    CrystallinePoint center,
                                    SDL_Color color,
                                    void* font) {
    if (!renderer || !font || !text) return;
    
    TTF_Font* ttf_font = (TTF_Font*)font;
    SDL_Surface* surface = TTF_RenderText_Blended(ttf_font, text, color);
    if (!surface) return;
    
    SDL_Texture* texture = SDL_CreateTextureFromSurface(renderer, surface);
    if (!texture) {
        SDL_FreeSurface(surface);
        return;
    }
    
    SDL_Rect dest = {
        (int)(center.x - surface->w / 2),
        (int)(center.y - surface->h / 2),
        surface->w,
        surface->h
    };
    
    SDL_RenderCopy(renderer, texture, NULL, &dest);
    
    SDL_DestroyTexture(texture);
    SDL_FreeSurface(surface);
}

void crystalline_draw_text_arc(SDL_Renderer* renderer,
                               const char* text,
                               CrystallinePoint center,
                               float radius,
                               float start_angle,
                               SDL_Color color,
                               void* font) {
    // For now, just draw text at the start angle position
    // Full arc text would require character-by-character rotation
    if (!renderer || !font || !text) return;
    
    float x = center.x + radius * math_cos(start_angle);
    float y = center.y + radius * math_sin(start_angle);
    
    CrystallinePoint pos = crystalline_point_cartesian(x, y);
    crystalline_draw_text_centered(renderer, text, pos, color, font);
}
