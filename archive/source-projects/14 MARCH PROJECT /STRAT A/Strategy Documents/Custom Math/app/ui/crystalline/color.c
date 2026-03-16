/*
 * Crystalline Color - Implementation
 * 
 * Color system for the Crystalline UI
 * ALL calculations use prime_* functions
 */

#include "color.h"
#include <string.h>

/*
 * Helper Functions
 */

static float clamp_float(float value, float min, float max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

static Uint8 clamp_byte(int value) __attribute__((unused));
static Uint8 clamp_byte(int value) {
    if (value < 0) return 0;
    if (value > 255) return 255;
    return (Uint8)value;
}

/*
 * Basic Color Functions
 */

SDL_Color crystalline_color_rgb(Uint8 r, Uint8 g, Uint8 b) {
    SDL_Color color = {r, g, b, 255};
    return color;
}

SDL_Color crystalline_color_rgba(Uint8 r, Uint8 g, Uint8 b, Uint8 a) {
    SDL_Color color = {r, g, b, a};
    return color;
}

SDL_Color crystalline_color_hsv(float h, float s, float v) {
    return crystalline_color_hsv_to_rgb(h, s, v);
}

SDL_Color crystalline_color_hsl(float h, float s, float l) {
    return crystalline_color_hsl_to_rgb(h, s, l);
}

/*
 * RGB/HSV/HSL Conversion Functions
 */

void crystalline_color_rgb_to_hsv(SDL_Color rgb, float* h, float* s, float* v) {
    float r = rgb.r / 255.0f;
    float g = rgb.g / 255.0f;
    float b = rgb.b / 255.0f;
    
    float max = math_max(r, math_max(g, b));
    float min = math_min(r, math_min(g, b));
    float delta = max - min;
    
    // Value
    *v = max;
    
    // Saturation
    if (max > 0.0f) {
        *s = delta / max;
    } else {
        *s = 0.0f;
    }
    
    // Hue
    if (delta > 0.0f) {
        if (max == r) {
            *h = 60.0f * (g - b) / delta;
            if (*h < 0.0f) *h += 360.0f;
        } else if (max == g) {
            *h = 60.0f * ((b - r) / delta + 2.0f);
        } else {
            *h = 60.0f * ((r - g) / delta + 4.0f);
        }
    } else {
        *h = 0.0f;
    }
}

SDL_Color crystalline_color_hsv_to_rgb(float h, float s, float v) {
    // Clamp inputs
    h = clamp_float(h, 0.0f, 360.0f);
    s = clamp_float(s, 0.0f, 1.0f);
    v = clamp_float(v, 0.0f, 1.0f);
    
    if (s == 0.0f) {
        // Grayscale
        Uint8 gray = (Uint8)(v * 255.0f);
        return crystalline_color_rgb(gray, gray, gray);
    }
    
    float h_sector = h / 60.0f;
    int sector = (int)h_sector;
    float f = h_sector - sector;
    
    float p = v * (1.0f - s);
    float q = v * (1.0f - s * f);
    float t = v * (1.0f - s * (1.0f - f));
    
    float r, g, b;
    
    switch (sector % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
        default: r = v; g = t; b = p; break;
    }
    
    return crystalline_color_rgb(
        (Uint8)(r * 255.0f),
        (Uint8)(g * 255.0f),
        (Uint8)(b * 255.0f)
    );
}

void crystalline_color_rgb_to_hsl(SDL_Color rgb, float* h, float* s, float* l) {
    float r = rgb.r / 255.0f;
    float g = rgb.g / 255.0f;
    float b = rgb.b / 255.0f;
    
    float max = math_max(r, math_max(g, b));
    float min = math_min(r, math_min(g, b));
    float delta = max - min;
    
    // Lightness
    *l = (max + min) / 2.0f;
    
    // Saturation
    if (delta == 0.0f) {
        *s = 0.0f;
        *h = 0.0f;
        return;
    }
    
    if (*l < 0.5f) {
        *s = delta / (max + min);
    } else {
        *s = delta / (2.0f - max - min);
    }
    
    // Hue
    if (max == r) {
        *h = 60.0f * (g - b) / delta;
        if (*h < 0.0f) *h += 360.0f;
    } else if (max == g) {
        *h = 60.0f * ((b - r) / delta + 2.0f);
    } else {
        *h = 60.0f * ((r - g) / delta + 4.0f);
    }
}

static float hue_to_rgb_helper(float p, float q, float t) {
    if (t < 0.0f) t += 1.0f;
    if (t > 1.0f) t -= 1.0f;
    if (t < 1.0f/6.0f) return p + (q - p) * 6.0f * t;
    if (t < 1.0f/2.0f) return q;
    if (t < 2.0f/3.0f) return p + (q - p) * (2.0f/3.0f - t) * 6.0f;
    return p;
}

SDL_Color crystalline_color_hsl_to_rgb(float h, float s, float l) {
    // Clamp inputs
    h = clamp_float(h, 0.0f, 360.0f);
    s = clamp_float(s, 0.0f, 1.0f);
    l = clamp_float(l, 0.0f, 1.0f);
    
    if (s == 0.0f) {
        // Grayscale
        Uint8 gray = (Uint8)(l * 255.0f);
        return crystalline_color_rgb(gray, gray, gray);
    }
    
    float q = (l < 0.5f) ? l * (1.0f + s) : l + s - l * s;
    float p = 2.0f * l - q;
    
    float h_k = h / 360.0f;
    
    float r = hue_to_rgb_helper(p, q, h_k + 1.0f/3.0f);
    float g = hue_to_rgb_helper(p, q, h_k);
    float b = hue_to_rgb_helper(p, q, h_k - 1.0f/3.0f);
    
    return crystalline_color_rgb(
        (Uint8)(r * 255.0f),
        (Uint8)(g * 255.0f),
        (Uint8)(b * 255.0f)
    );
}

/*
 * Frequency-Based Colors
 */

SDL_Color crystalline_color_from_frequency(float frequency) {
    // Map frequency to hue using logarithmic scale
    // Audible range: 20 Hz - 20,000 Hz
    // Map to hue: 0° - 360°
    
    float min_freq = 20.0f;
    float max_freq = 20000.0f;
    
    // Clamp frequency
    frequency = clamp_float(frequency, min_freq, max_freq);
    
    // Logarithmic mapping using prime_logf
    float log_freq = math_log(frequency);
    float log_min = math_log(min_freq);
    float log_max = math_log(max_freq);
    
    float t = (log_freq - log_min) / (log_max - log_min);
    float hue = t * 360.0f;
    
    // Full saturation and value for vibrant colors
    return crystalline_color_hsv(hue, 1.0f, 1.0f);
}

SDL_Color crystalline_color_432hz(void) {
    return crystalline_color_from_frequency(CRYSTALLINE_FREQ_432HZ);
}

SDL_Color crystalline_color_528hz(void) {
    return crystalline_color_from_frequency(CRYSTALLINE_FREQ_528HZ);
}

SDL_Color crystalline_color_639hz(void) {
    return crystalline_color_from_frequency(CRYSTALLINE_FREQ_639HZ);
}

SDL_Color crystalline_color_741hz(void) {
    return crystalline_color_from_frequency(CRYSTALLINE_FREQ_741HZ);
}

SDL_Color crystalline_color_852hz(void) {
    return crystalline_color_from_frequency(CRYSTALLINE_FREQ_852HZ);
}

SDL_Color crystalline_color_963hz(void) {
    return crystalline_color_from_frequency(CRYSTALLINE_FREQ_963HZ);
}

/*
 * Activity-Based Colors (from sphere_visualization.c)
 */

CrystallineActivityLevel crystalline_activity_level(float activity) {
    if (activity < 0.01f) return CRYSTALLINE_ACTIVITY_INACTIVE;
    if (activity < 0.3f) return CRYSTALLINE_ACTIVITY_LOW;
    if (activity < 0.6f) return CRYSTALLINE_ACTIVITY_MEDIUM;
    if (activity < 0.9f) return CRYSTALLINE_ACTIVITY_HIGH;
    return CRYSTALLINE_ACTIVITY_VERY_HIGH;
}

SDL_Color crystalline_color_activity_level(CrystallineActivityLevel level) {
    switch (level) {
        case CRYSTALLINE_ACTIVITY_INACTIVE:
            return crystalline_color_rgb(40, 40, 50);      // Dark gray
        case CRYSTALLINE_ACTIVITY_LOW:
            return crystalline_color_rgb(60, 100, 180);    // Blue
        case CRYSTALLINE_ACTIVITY_MEDIUM:
            return crystalline_color_rgb(80, 180, 200);    // Cyan
        case CRYSTALLINE_ACTIVITY_HIGH:
            return crystalline_color_rgb(220, 200, 80);    // Yellow
        case CRYSTALLINE_ACTIVITY_VERY_HIGH:
            return crystalline_color_rgb(255, 140, 60);    // Orange/Red
        default:
            return crystalline_color_rgb(40, 40, 50);
    }
}

SDL_Color crystalline_color_activity(float activity) {
    CrystallineActivityLevel level = crystalline_activity_level(activity);
    return crystalline_color_activity_level(level);
}

/*
 * Golden Ratio Color Harmonies
 */

CrystallinePalette crystalline_palette_golden(float base_hue, int count) {
    CrystallinePalette palette;
    palette.count = count > 12 ? 12 : count;
    palette.harmony = CRYSTALLINE_HARMONY_GOLDEN;
    palette.base_hue = base_hue;
    
    // Golden angle: 360° / φ² ≈ 137.5°
    float golden_angle = 360.0f / (CRYSTALLINE_PHI * CRYSTALLINE_PHI);
    
    for (int i = 0; i < palette.count; i++) {
        float hue = base_hue + golden_angle * i;
        while (hue >= 360.0f) hue -= 360.0f;
        palette.colors[i] = crystalline_color_hsv(hue, 0.8f, 0.9f);
    }
    
    return palette;
}

CrystallinePalette crystalline_palette_harmony(float base_hue, 
                                                CrystallineHarmonyType harmony) {
    CrystallinePalette palette;
    palette.harmony = harmony;
    palette.base_hue = base_hue;
    
    switch (harmony) {
        case CRYSTALLINE_HARMONY_COMPLEMENTARY:
            palette.count = 2;
            palette.colors[0] = crystalline_color_hsv(base_hue, 0.8f, 0.9f);
            palette.colors[1] = crystalline_color_hsv(base_hue + 180.0f, 0.8f, 0.9f);
            break;
            
        case CRYSTALLINE_HARMONY_TRIADIC:
            palette.count = 3;
            for (int i = 0; i < 3; i++) {
                float hue = base_hue + 120.0f * i;
                while (hue >= 360.0f) hue -= 360.0f;
                palette.colors[i] = crystalline_color_hsv(hue, 0.8f, 0.9f);
            }
            break;
            
        case CRYSTALLINE_HARMONY_TETRADIC:
            palette.count = 4;
            for (int i = 0; i < 4; i++) {
                float hue = base_hue + 90.0f * i;
                while (hue >= 360.0f) hue -= 360.0f;
                palette.colors[i] = crystalline_color_hsv(hue, 0.8f, 0.9f);
            }
            break;
            
        case CRYSTALLINE_HARMONY_ANALOGOUS:
            palette.count = 3;
            palette.colors[0] = crystalline_color_hsv(base_hue - 30.0f, 0.8f, 0.9f);
            palette.colors[1] = crystalline_color_hsv(base_hue, 0.8f, 0.9f);
            palette.colors[2] = crystalline_color_hsv(base_hue + 30.0f, 0.8f, 0.9f);
            break;
            
        case CRYSTALLINE_HARMONY_GOLDEN:
        default:
            return crystalline_palette_golden(base_hue, 12);
    }
    
    return palette;
}

SDL_Color crystalline_palette_get(CrystallinePalette palette, int index) {
    if (index < 0 || index >= palette.count) {
        return crystalline_color_rgb(255, 255, 255);
    }
    return palette.colors[index];
}

/*
 * 12-Fold Color Wheel
 */

SDL_Color crystalline_color_twelve_fold(int position) {
    // 12-fold color wheel: 360° / 12 = 30° per position
    float hue = (position % 12) * 30.0f;
    return crystalline_color_hsv(hue, 0.8f, 0.9f);
}

SDL_Color crystalline_color_wheel(float angle) {
    // Normalize angle to [0, 360)
    while (angle < 0.0f) angle += 360.0f;
    while (angle >= 360.0f) angle -= 360.0f;
    
    return crystalline_color_hsv(angle, 0.8f, 0.9f);
}

SDL_Color crystalline_color_complementary(SDL_Color color) {
    float h, s, v;
    crystalline_color_rgb_to_hsv(color, &h, &s, &v);
    
    h += 180.0f;
    if (h >= 360.0f) h -= 360.0f;
    
    return crystalline_color_hsv(h, s, v);
}

void crystalline_color_triadic(SDL_Color base, SDL_Color* out_colors) {
    float h, s, v;
    crystalline_color_rgb_to_hsv(base, &h, &s, &v);
    
    out_colors[0] = base;
    out_colors[1] = crystalline_color_hsv(h + 120.0f, s, v);
    out_colors[2] = crystalline_color_hsv(h + 240.0f, s, v);
}

void crystalline_color_tetradic(SDL_Color base, SDL_Color* out_colors) {
    float h, s, v;
    crystalline_color_rgb_to_hsv(base, &h, &s, &v);
    
    out_colors[0] = base;
    out_colors[1] = crystalline_color_hsv(h + 90.0f, s, v);
    out_colors[2] = crystalline_color_hsv(h + 180.0f, s, v);
    out_colors[3] = crystalline_color_hsv(h + 270.0f, s, v);
}

/*
 * Color Interpolation
 */

SDL_Color crystalline_color_lerp(SDL_Color a, SDL_Color b, float t) {
    t = clamp_float(t, 0.0f, 1.0f);
    
    return crystalline_color_rgba(
        (Uint8)(a.r + (b.r - a.r) * t),
        (Uint8)(a.g + (b.g - a.g) * t),
        (Uint8)(a.b + (b.b - a.b) * t),
        (Uint8)(a.a + (b.a - a.a) * t)
    );
}

SDL_Color crystalline_color_smooth_lerp(SDL_Color a, SDL_Color b, float t) {
    // Use smooth step for interpolation
    t = crystalline_smooth_step(t);
    return crystalline_color_lerp(a, b, t);
}

SDL_Color crystalline_color_hsv_lerp(SDL_Color a, SDL_Color b, float t) {
    float h1, s1, v1, h2, s2, v2;
    crystalline_color_rgb_to_hsv(a, &h1, &s1, &v1);
    crystalline_color_rgb_to_hsv(b, &h2, &s2, &v2);
    
    // Interpolate hue taking shortest path
    float dh = h2 - h1;
    if (dh > 180.0f) dh -= 360.0f;
    if (dh < -180.0f) dh += 360.0f;
    
    float h = h1 + dh * t;
    float s = s1 + (s2 - s1) * t;
    float v = v1 + (v2 - v1) * t;
    
    return crystalline_color_hsv(h, s, v);
}

SDL_Color crystalline_color_golden_lerp(SDL_Color a, SDL_Color b, float t) {
    // Use golden ratio for non-linear interpolation
    float golden_t = t * CRYSTALLINE_PHI_INV;
    if (golden_t > 1.0f) golden_t = 1.0f;
    
    return crystalline_color_hsv_lerp(a, b, golden_t);
}

/*
 * Color Transformations
 */

SDL_Color crystalline_color_brightness(SDL_Color color, float factor) {
    float h, s, v;
    crystalline_color_rgb_to_hsv(color, &h, &s, &v);
    
    v *= factor;
    v = clamp_float(v, 0.0f, 1.0f);
    
    SDL_Color result = crystalline_color_hsv(h, s, v);
    result.a = color.a;
    return result;
}

SDL_Color crystalline_color_saturation(SDL_Color color, float factor) {
    float h, s, v;
    crystalline_color_rgb_to_hsv(color, &h, &s, &v);
    
    s *= factor;
    s = clamp_float(s, 0.0f, 1.0f);
    
    SDL_Color result = crystalline_color_hsv(h, s, v);
    result.a = color.a;
    return result;
}

SDL_Color crystalline_color_hue_shift(SDL_Color color, float degrees) {
    float h, s, v;
    crystalline_color_rgb_to_hsv(color, &h, &s, &v);
    
    h += degrees;
    while (h < 0.0f) h += 360.0f;
    while (h >= 360.0f) h -= 360.0f;
    
    SDL_Color result = crystalline_color_hsv(h, s, v);
    result.a = color.a;
    return result;
}

SDL_Color crystalline_color_alpha(SDL_Color color, Uint8 alpha) {
    color.a = alpha;
    return color;
}

SDL_Color crystalline_color_blend(SDL_Color a, SDL_Color b, float t) {
    return crystalline_color_lerp(a, b, t);
}

/*
 * Color Analysis
 */

float crystalline_color_get_hue(SDL_Color color) {
    float h, s, v;
    crystalline_color_rgb_to_hsv(color, &h, &s, &v);
    return h;
}

float crystalline_color_get_saturation(SDL_Color color) {
    float h, s, v;
    crystalline_color_rgb_to_hsv(color, &h, &s, &v);
    return s;
}

float crystalline_color_get_value(SDL_Color color) {
    float h, s, v;
    crystalline_color_rgb_to_hsv(color, &h, &s, &v);
    return v;
}

float crystalline_color_get_luminance(SDL_Color color) {
    // Relative luminance using ITU-R BT.709 coefficients
    float r = color.r / 255.0f;
    float g = color.g / 255.0f;
    float b = color.b / 255.0f;
    
    return 0.2126f * r + 0.7152f * g + 0.0722f * b;
}

bool crystalline_color_is_dark(SDL_Color color) {
    return crystalline_color_get_luminance(color) < 0.5f;
}

bool crystalline_color_is_light(SDL_Color color) {
    return crystalline_color_get_luminance(color) >= 0.5f;
}

/*
 * Predefined Color Palettes
 */

CrystallinePalette crystalline_palette_sacred(void) {
    // Based on flower of life - 7 colors
    CrystallinePalette palette;
    palette.count = 7;
    palette.harmony = CRYSTALLINE_HARMONY_GOLDEN;
    palette.base_hue = 0.0f;
    
    // Center + 6 petals
    palette.colors[0] = crystalline_color_hsv(0.0f, 0.0f, 1.0f);    // White center
    palette.colors[1] = crystalline_color_hsv(0.0f, 0.8f, 0.9f);    // Red
    palette.colors[2] = crystalline_color_hsv(60.0f, 0.8f, 0.9f);   // Yellow
    palette.colors[3] = crystalline_color_hsv(120.0f, 0.8f, 0.9f);  // Green
    palette.colors[4] = crystalline_color_hsv(180.0f, 0.8f, 0.9f);  // Cyan
    palette.colors[5] = crystalline_color_hsv(240.0f, 0.8f, 0.9f);  // Blue
    palette.colors[6] = crystalline_color_hsv(300.0f, 0.8f, 0.9f);  // Magenta
    
    return palette;
}

CrystallinePalette crystalline_palette_clock(void) {
    // 4 colors for 4 clock rings
    CrystallinePalette palette;
    palette.count = 4;
    palette.harmony = CRYSTALLINE_HARMONY_TETRADIC;
    palette.base_hue = 0.0f;
    
    palette.colors[0] = crystalline_color_hsv(0.0f, 0.7f, 0.9f);    // Ring 0 (hours)
    palette.colors[1] = crystalline_color_hsv(90.0f, 0.7f, 0.9f);   // Ring 1 (minutes)
    palette.colors[2] = crystalline_color_hsv(180.0f, 0.7f, 0.9f);  // Ring 2 (seconds)
    palette.colors[3] = crystalline_color_hsv(270.0f, 0.7f, 0.9f);  // Ring 3 (milliseconds)
    
    return palette;
}

CrystallinePalette crystalline_palette_activity(void) {
    // 5 colors for activity levels
    CrystallinePalette palette;
    palette.count = 5;
    palette.harmony = CRYSTALLINE_HARMONY_ANALOGOUS;
    palette.base_hue = 0.0f;
    
    palette.colors[0] = crystalline_color_activity_level(CRYSTALLINE_ACTIVITY_INACTIVE);
    palette.colors[1] = crystalline_color_activity_level(CRYSTALLINE_ACTIVITY_LOW);
    palette.colors[2] = crystalline_color_activity_level(CRYSTALLINE_ACTIVITY_MEDIUM);
    palette.colors[3] = crystalline_color_activity_level(CRYSTALLINE_ACTIVITY_HIGH);
    palette.colors[4] = crystalline_color_activity_level(CRYSTALLINE_ACTIVITY_VERY_HIGH);
    
    return palette;
}

CrystallinePalette crystalline_palette_frequency(void) {
    // 6 colors for cymatic frequencies
    CrystallinePalette palette;
    palette.count = 6;
    palette.harmony = CRYSTALLINE_HARMONY_GOLDEN;
    palette.base_hue = 0.0f;
    
    palette.colors[0] = crystalline_color_432hz();
    palette.colors[1] = crystalline_color_528hz();
    palette.colors[2] = crystalline_color_639hz();
    palette.colors[3] = crystalline_color_741hz();
    palette.colors[4] = crystalline_color_852hz();
    palette.colors[5] = crystalline_color_963hz();
    
    return palette;
}

/*
 * Color Utilities
 */

SDL_Color crystalline_color_clamp(SDL_Color color) {
    // Already clamped by Uint8 type
    return color;
}

bool crystalline_color_equals(SDL_Color a, SDL_Color b) {
    return a.r == b.r && a.g == b.g && a.b == b.b && a.a == b.a;
}

float crystalline_color_distance(SDL_Color a, SDL_Color b) {
    float dr = (float)(b.r - a.r);
    float dg = (float)(b.g - a.g);
    float db = (float)(b.b - a.b);
    
    return math_sqrt(dr * dr + dg * dg + db * db);
}

/*
 * Color Gradients
 */

void crystalline_color_gradient(SDL_Color start, SDL_Color end, 
                               int steps, SDL_Color* out_colors) {
    for (int i = 0; i < steps; i++) {
        float t = (float)i / (float)(steps - 1);
        out_colors[i] = crystalline_color_lerp(start, end, t);
    }
}

void crystalline_color_gradient_multi(SDL_Color* colors, int color_count,
                                     int steps, SDL_Color* out_colors) {
    if (color_count < 2 || steps < 2) return;
    
    int steps_per_segment = steps / (color_count - 1);
    int idx = 0;
    
    for (int seg = 0; seg < color_count - 1; seg++) {
        for (int i = 0; i < steps_per_segment && idx < steps; i++) {
            float t = (float)i / (float)steps_per_segment;
            out_colors[idx++] = crystalline_color_lerp(colors[seg], colors[seg + 1], t);
        }
    }
    
    // Fill remaining with last color
    while (idx < steps) {
        out_colors[idx++] = colors[color_count - 1];
    }
}

void crystalline_color_radial_gradient(SDL_Color inner, SDL_Color outer,
                                      int steps, SDL_Color* out_colors) {
    crystalline_color_gradient(inner, outer, steps, out_colors);
}