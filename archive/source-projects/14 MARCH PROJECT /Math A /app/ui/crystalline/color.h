/*
 * Crystalline Color - Header
 * 
 * Color system for the Crystalline UI
 * Provides frequency-based colors, activity colors, and golden ratio harmonies
 * 
 * Color Philosophy:
 * - Frequency-based colors (cymatic resonance: 432 Hz, 528 Hz, etc.)
 * - Activity-based colors (from sphere_visualization.c)
 * - Golden ratio color harmonies
 * - 12-fold color wheel
 * - All interpolation uses prime_* functions
 */

#ifndef CRYSTALLINE_COLOR_H
#define CRYSTALLINE_COLOR_H

#include "geometry.h"
#include <SDL2/SDL.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Color Constants - Cymatic Frequencies
 */
#define CRYSTALLINE_FREQ_432HZ 432.0f   // Natural tuning frequency
#define CRYSTALLINE_FREQ_528HZ 528.0f   // Love frequency
#define CRYSTALLINE_FREQ_639HZ 639.0f   // Connection frequency
#define CRYSTALLINE_FREQ_741HZ 741.0f   // Awakening frequency
#define CRYSTALLINE_FREQ_852HZ 852.0f   // Intuition frequency
#define CRYSTALLINE_FREQ_963HZ 963.0f   // Divine frequency

/*
 * Activity Levels (from sphere_visualization.c)
 */
typedef enum {
    CRYSTALLINE_ACTIVITY_INACTIVE,      // < 0.01 (dark gray)
    CRYSTALLINE_ACTIVITY_LOW,           // 0.01 - 0.3 (blue)
    CRYSTALLINE_ACTIVITY_MEDIUM,        // 0.3 - 0.6 (cyan)
    CRYSTALLINE_ACTIVITY_HIGH,          // 0.6 - 0.9 (yellow)
    CRYSTALLINE_ACTIVITY_VERY_HIGH      // > 0.9 (orange/red)
} CrystallineActivityLevel;

/*
 * Color Harmony Types
 */
typedef enum {
    CRYSTALLINE_HARMONY_COMPLEMENTARY,  // Opposite on color wheel
    CRYSTALLINE_HARMONY_TRIADIC,        // 3 colors, 120° apart
    CRYSTALLINE_HARMONY_TETRADIC,       // 4 colors, 90° apart
    CRYSTALLINE_HARMONY_ANALOGOUS,      // Adjacent colors
    CRYSTALLINE_HARMONY_GOLDEN          // Golden ratio spacing
} CrystallineHarmonyType;

/*
 * Color Palette Structure
 */
typedef struct {
    SDL_Color colors[12];               // 12 colors for 12-fold symmetry
    int count;                          // Number of colors in palette
    CrystallineHarmonyType harmony;     // Harmony type used
    float base_hue;                     // Base hue (0-360)
} CrystallinePalette;

/*
 * Basic Color Functions
 */

// Create color from RGB
SDL_Color crystalline_color_rgb(Uint8 r, Uint8 g, Uint8 b);

// Create color from RGBA
SDL_Color crystalline_color_rgba(Uint8 r, Uint8 g, Uint8 b, Uint8 a);

// Create color from HSV (uses prime_* for conversion)
SDL_Color crystalline_color_hsv(float h, float s, float v);

// Create color from HSL (uses prime_* for conversion)
SDL_Color crystalline_color_hsl(float h, float s, float l);

/*
 * Frequency-Based Colors
 */

// Get color for specific frequency (cymatic resonance)
SDL_Color crystalline_color_from_frequency(float frequency);

// Get color for 432 Hz (natural tuning)
SDL_Color crystalline_color_432hz(void);

// Get color for 528 Hz (love frequency)
SDL_Color crystalline_color_528hz(void);

// Get color for 639 Hz (connection)
SDL_Color crystalline_color_639hz(void);

// Get color for 741 Hz (awakening)
SDL_Color crystalline_color_741hz(void);

// Get color for 852 Hz (intuition)
SDL_Color crystalline_color_852hz(void);

// Get color for 963 Hz (divine)
SDL_Color crystalline_color_963hz(void);

/*
 * Activity-Based Colors (from sphere_visualization.c)
 */

// Get color based on activity level (0.0 - 1.0)
SDL_Color crystalline_color_activity(float activity);

// Get color for specific activity level
SDL_Color crystalline_color_activity_level(CrystallineActivityLevel level);

// Get activity level from value
CrystallineActivityLevel crystalline_activity_level(float activity);

/*
 * Golden Ratio Color Harmonies
 */

// Generate palette using golden ratio
CrystallinePalette crystalline_palette_golden(float base_hue, int count);

// Generate palette using specific harmony
CrystallinePalette crystalline_palette_harmony(float base_hue, 
                                                CrystallineHarmonyType harmony);

// Get color from palette by index
SDL_Color crystalline_palette_get(CrystallinePalette palette, int index);

/*
 * 12-Fold Color Wheel
 */

// Get color from 12-fold color wheel (position 0-11)
SDL_Color crystalline_color_twelve_fold(int position);

// Get color at angle on color wheel (uses prime_* for calculation)
SDL_Color crystalline_color_wheel(float angle);

// Get complementary color (opposite on wheel)
SDL_Color crystalline_color_complementary(SDL_Color color);

// Get triadic colors (120° apart)
void crystalline_color_triadic(SDL_Color base, SDL_Color* out_colors);

// Get tetradic colors (90° apart)
void crystalline_color_tetradic(SDL_Color base, SDL_Color* out_colors);

/*
 * Color Interpolation (uses prime_* functions)
 */

// Linear interpolation between two colors
SDL_Color crystalline_color_lerp(SDL_Color a, SDL_Color b, float t);

// Smooth interpolation (uses prime_* for smoothing)
SDL_Color crystalline_color_smooth_lerp(SDL_Color a, SDL_Color b, float t);

// Interpolate through HSV space (uses prime_* for conversion)
SDL_Color crystalline_color_hsv_lerp(SDL_Color a, SDL_Color b, float t);

// Interpolate using golden ratio
SDL_Color crystalline_color_golden_lerp(SDL_Color a, SDL_Color b, float t);

/*
 * Color Transformations
 */

// Adjust brightness (uses prime_* for calculation)
SDL_Color crystalline_color_brightness(SDL_Color color, float factor);

// Adjust saturation (uses prime_* for calculation)
SDL_Color crystalline_color_saturation(SDL_Color color, float factor);

// Adjust hue (rotate on color wheel)
SDL_Color crystalline_color_hue_shift(SDL_Color color, float degrees);

// Adjust alpha
SDL_Color crystalline_color_alpha(SDL_Color color, Uint8 alpha);

// Blend two colors (uses prime_* for blending)
SDL_Color crystalline_color_blend(SDL_Color a, SDL_Color b, float t);

/*
 * Color Analysis
 */

// Get hue from color (0-360, uses prime_atan2f)
float crystalline_color_get_hue(SDL_Color color);

// Get saturation from color (0-1)
float crystalline_color_get_saturation(SDL_Color color);

// Get value/brightness from color (0-1)
float crystalline_color_get_value(SDL_Color color);

// Get luminance from color (0-1, uses prime_* for calculation)
float crystalline_color_get_luminance(SDL_Color color);

// Check if color is dark (luminance < 0.5)
bool crystalline_color_is_dark(SDL_Color color);

// Check if color is light (luminance > 0.5)
bool crystalline_color_is_light(SDL_Color color);

/*
 * Predefined Color Palettes
 */

// Get sacred geometry palette (based on flower of life)
CrystallinePalette crystalline_palette_sacred(void);

// Get clock lattice palette (4 colors for 4 rings)
CrystallinePalette crystalline_palette_clock(void);

// Get activity palette (5 colors for activity levels)
CrystallinePalette crystalline_palette_activity(void);

// Get frequency palette (6 colors for cymatic frequencies)
CrystallinePalette crystalline_palette_frequency(void);

/*
 * Color Utilities
 */

// Convert RGB to HSV (uses prime_* for calculation)
void crystalline_color_rgb_to_hsv(SDL_Color rgb, float* h, float* s, float* v);

// Convert HSV to RGB (uses prime_* for calculation)
SDL_Color crystalline_color_hsv_to_rgb(float h, float s, float v);

// Convert RGB to HSL (uses prime_* for calculation)
void crystalline_color_rgb_to_hsl(SDL_Color rgb, float* h, float* s, float* l);

// Convert HSL to RGB (uses prime_* for calculation)
SDL_Color crystalline_color_hsl_to_rgb(float h, float s, float l);

// Clamp color components to valid range
SDL_Color crystalline_color_clamp(SDL_Color color);

// Compare two colors for equality
bool crystalline_color_equals(SDL_Color a, SDL_Color b);

// Get distance between two colors in RGB space (uses prime_sqrtf)
float crystalline_color_distance(SDL_Color a, SDL_Color b);

/*
 * Color Gradients
 */

// Create gradient between two colors
void crystalline_color_gradient(SDL_Color start, SDL_Color end, 
                               int steps, SDL_Color* out_colors);

// Create gradient through multiple colors
void crystalline_color_gradient_multi(SDL_Color* colors, int color_count,
                                     int steps, SDL_Color* out_colors);

// Create radial gradient colors (for drawing)
void crystalline_color_radial_gradient(SDL_Color inner, SDL_Color outer,
                                      int steps, SDL_Color* out_colors);

#ifdef __cplusplus
}
#endif

#endif /* CRYSTALLINE_COLOR_H */