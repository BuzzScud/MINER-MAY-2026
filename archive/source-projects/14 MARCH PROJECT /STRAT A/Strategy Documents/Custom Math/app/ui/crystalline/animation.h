/*
 * Crystalline Animation - Header
 * 
 * Animation system for the Crystalline UI
 * Provides easing functions, animation states, and timing
 * 
 * Animation Philosophy:
 * - All easing functions use prime_* mathematics
 * - Pulse animations use prime_sinf
 * - Rotation animations use prime_cosf
 * - Exponential easing uses prime_expf, prime_logf
 * - Time-based animations with delta time support
 */

#ifndef CRYSTALLINE_ANIMATION_H
#define CRYSTALLINE_ANIMATION_H

#include "geometry.h"
#include "color.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Animation State
 */
typedef enum {
    CRYSTALLINE_ANIM_STOPPED,       // Not running
    CRYSTALLINE_ANIM_PLAYING,       // Currently playing
    CRYSTALLINE_ANIM_PAUSED,        // Paused
    CRYSTALLINE_ANIM_FINISHED       // Completed
} CrystallineAnimState;

/*
 * Easing Types
 */
typedef enum {
    CRYSTALLINE_EASE_LINEAR,        // Linear interpolation
    CRYSTALLINE_EASE_SMOOTH,        // Smooth step (3t² - 2t³)
    CRYSTALLINE_EASE_SMOOTHER,      // Smoother step (6t⁵ - 15t⁴ + 10t³)
    CRYSTALLINE_EASE_IN_QUAD,       // Quadratic ease in
    CRYSTALLINE_EASE_OUT_QUAD,      // Quadratic ease out
    CRYSTALLINE_EASE_INOUT_QUAD,    // Quadratic ease in-out
    CRYSTALLINE_EASE_IN_CUBIC,      // Cubic ease in
    CRYSTALLINE_EASE_OUT_CUBIC,     // Cubic ease out
    CRYSTALLINE_EASE_INOUT_CUBIC,   // Cubic ease in-out
    CRYSTALLINE_EASE_IN_EXPO,       // Exponential ease in (uses prime_expf)
    CRYSTALLINE_EASE_OUT_EXPO,      // Exponential ease out (uses prime_expf)
    CRYSTALLINE_EASE_INOUT_EXPO,    // Exponential ease in-out (uses prime_expf)
    CRYSTALLINE_EASE_IN_SINE,       // Sine ease in (uses prime_sinf)
    CRYSTALLINE_EASE_OUT_SINE,      // Sine ease out (uses prime_sinf)
    CRYSTALLINE_EASE_INOUT_SINE,    // Sine ease in-out (uses prime_sinf)
    CRYSTALLINE_EASE_ELASTIC,       // Elastic bounce (uses prime_sinf, prime_expf)
    CRYSTALLINE_EASE_BOUNCE,        // Bounce effect
    CRYSTALLINE_EASE_GOLDEN         // Golden ratio easing
} CrystallineEaseType;

/*
 * Animation Loop Mode
 */
typedef enum {
    CRYSTALLINE_LOOP_NONE,          // Play once
    CRYSTALLINE_LOOP_REPEAT,        // Repeat from start
    CRYSTALLINE_LOOP_PINGPONG,      // Reverse direction each time
    CRYSTALLINE_LOOP_INFINITE       // Loop forever
} CrystallineLoopMode;

/*
 * Animation Structure
 */
typedef struct {
    CrystallineAnimState state;     // Current state
    CrystallineEaseType ease;       // Easing function
    CrystallineLoopMode loop;       // Loop mode
    float duration;                 // Duration in seconds
    float elapsed;                  // Elapsed time in seconds
    float delay;                    // Delay before start
    float speed;                    // Speed multiplier (1.0 = normal)
    bool reverse;                   // Playing in reverse
    int loop_count;                 // Number of loops completed
    int max_loops;                  // Maximum loops (-1 = infinite)
} CrystallineAnimation;

/*
 * Pulse Animation
 */
typedef struct {
    CrystallineAnimation base;      // Base animation
    float frequency;                // Pulse frequency (Hz)
    float amplitude;                // Pulse amplitude (0-1)
    float phase;                    // Phase offset (radians)
    float base_value;               // Base value to pulse from
} CrystallinePulseAnim;

/*
 * Rotation Animation
 */
typedef struct {
    CrystallineAnimation base;      // Base animation
    float start_angle;              // Start angle (radians)
    float end_angle;                // End angle (radians)
    float current_angle;            // Current angle
    bool clockwise;                 // Rotation direction
} CrystallineRotationAnim;

/*
 * Fade Animation
 */
typedef struct {
    CrystallineAnimation base;      // Base animation
    float start_alpha;              // Start alpha (0-1)
    float end_alpha;                // End alpha (0-1)
    float current_alpha;            // Current alpha
} CrystallineFadeAnim;

/*
 * Spiral Animation
 */
typedef struct {
    CrystallineAnimation base;      // Base animation
    float start_radius;             // Start radius
    float end_radius;               // End radius
    float rotations;                // Number of rotations
    float current_angle;            // Current angle
    float current_radius;           // Current radius
} CrystallineSpiralAnim;

/*
 * Color Animation
 */
typedef struct {
    CrystallineAnimation base;      // Base animation
    SDL_Color start_color;          // Start color
    SDL_Color end_color;            // End color
    SDL_Color current_color;        // Current color
    bool use_hsv;                   // Interpolate in HSV space
} CrystallineColorAnim;

/*
 * Position Animation
 */
typedef struct {
    CrystallineAnimation base;      // Base animation
    CrystallinePoint start_pos;     // Start position
    CrystallinePoint end_pos;       // End position
    CrystallinePoint current_pos;   // Current position
    bool use_spiral;                // Use spiral interpolation
} CrystallinePositionAnim;

/*
 * Easing Functions (all use prime_* functions)
 */

// Apply easing function to t (0-1)
float crystalline_ease(float t, CrystallineEaseType ease);

// Linear easing
float crystalline_ease_linear(float t);

// Smooth step easing (3t² - 2t³)
float crystalline_ease_smooth(float t);

// Smoother step easing (6t⁵ - 15t⁴ + 10t³)
float crystalline_ease_smoother(float t);

// Quadratic easing
float crystalline_ease_in_quad(float t);
float crystalline_ease_out_quad(float t);
float crystalline_ease_inout_quad(float t);

// Cubic easing
float crystalline_ease_in_cubic(float t);
float crystalline_ease_out_cubic(float t);
float crystalline_ease_inout_cubic(float t);

// Exponential easing (uses prime_expf)
float crystalline_ease_in_expo(float t);
float crystalline_ease_out_expo(float t);
float crystalline_ease_inout_expo(float t);

// Sine easing (uses prime_sinf, prime_cosf)
float crystalline_ease_in_sine(float t);
float crystalline_ease_out_sine(float t);
float crystalline_ease_inout_sine(float t);

// Elastic easing (uses prime_sinf, prime_expf)
float crystalline_ease_elastic(float t);

// Bounce easing
float crystalline_ease_bounce(float t);

// Golden ratio easing
float crystalline_ease_golden(float t);

/*
 * Animation Creation Functions
 */

// Create base animation
CrystallineAnimation crystalline_anim_create(float duration, CrystallineEaseType ease);

// Create pulse animation
CrystallinePulseAnim crystalline_anim_pulse(float frequency, float amplitude);

// Create rotation animation
CrystallineRotationAnim crystalline_anim_rotation(float start_angle, float end_angle, 
                                                   float duration);

// Create fade animation
CrystallineFadeAnim crystalline_anim_fade(float start_alpha, float end_alpha, float duration);

// Create spiral animation
CrystallineSpiralAnim crystalline_anim_spiral(float start_radius, float end_radius, 
                                               float rotations, float duration);

// Create color animation
CrystallineColorAnim crystalline_anim_color(SDL_Color start, SDL_Color end, float duration);

// Create position animation
CrystallinePositionAnim crystalline_anim_position(CrystallinePoint start, CrystallinePoint end,
                                                   float duration);

/*
 * Animation Control Functions
 */

// Start animation
void crystalline_anim_start(CrystallineAnimation* anim);

// Stop animation
void crystalline_anim_stop(CrystallineAnimation* anim);

// Pause animation
void crystalline_anim_pause(CrystallineAnimation* anim);

// Resume animation
void crystalline_anim_resume(CrystallineAnimation* anim);

// Reset animation to start
void crystalline_anim_reset(CrystallineAnimation* anim);

// Set loop mode
void crystalline_anim_set_loop(CrystallineAnimation* anim, CrystallineLoopMode loop, 
                               int max_loops);

// Set speed multiplier
void crystalline_anim_set_speed(CrystallineAnimation* anim, float speed);

// Set delay before start
void crystalline_anim_set_delay(CrystallineAnimation* anim, float delay);

/*
 * Animation Update Functions
 */

// Update animation with delta time
void crystalline_anim_update(CrystallineAnimation* anim, float delta_time);

// Update pulse animation
void crystalline_anim_pulse_update(CrystallinePulseAnim* anim, float delta_time);

// Update rotation animation
void crystalline_anim_rotation_update(CrystallineRotationAnim* anim, float delta_time);

// Update fade animation
void crystalline_anim_fade_update(CrystallineFadeAnim* anim, float delta_time);

// Update spiral animation
void crystalline_anim_spiral_update(CrystallineSpiralAnim* anim, float delta_time);

// Update color animation
void crystalline_anim_color_update(CrystallineColorAnim* anim, float delta_time);

// Update position animation
void crystalline_anim_position_update(CrystallinePositionAnim* anim, float delta_time);

/*
 * Animation Query Functions
 */

// Get normalized time (0-1)
float crystalline_anim_get_time(CrystallineAnimation* anim);

// Get eased time (0-1 with easing applied)
float crystalline_anim_get_eased_time(CrystallineAnimation* anim);

// Check if animation is playing
bool crystalline_anim_is_playing(CrystallineAnimation* anim);

// Check if animation is finished
bool crystalline_anim_is_finished(CrystallineAnimation* anim);

// Get progress percentage (0-100)
float crystalline_anim_get_progress(CrystallineAnimation* anim);

/*
 * Pulse Animation Functions (uses prime_sinf)
 */

// Get pulse value at time
float crystalline_pulse_value(CrystallinePulseAnim* anim, float time);

// Get pulse value for current time
float crystalline_pulse_current(CrystallinePulseAnim* anim);

/*
 * Rotation Animation Functions (uses prime_sinf, prime_cosf)
 */

// Get rotation angle at time
float crystalline_rotation_angle(CrystallineRotationAnim* anim, float time);

// Get current rotation angle
float crystalline_rotation_current(CrystallineRotationAnim* anim);

/*
 * Fade Animation Functions
 */

// Get fade alpha at time
float crystalline_fade_alpha(CrystallineFadeAnim* anim, float time);

// Get current fade alpha
float crystalline_fade_current(CrystallineFadeAnim* anim);

/*
 * Spiral Animation Functions (uses prime_expf, prime_sinf, prime_cosf)
 */

// Get spiral position at time
CrystallinePoint crystalline_spiral_position(CrystallineSpiralAnim* anim, float time);

// Get current spiral position
CrystallinePoint crystalline_spiral_current(CrystallineSpiralAnim* anim);

/*
 * Color Animation Functions
 */

// Get color at time
SDL_Color crystalline_color_anim_at(CrystallineColorAnim* anim, float time);

// Get current color
SDL_Color crystalline_color_anim_current(CrystallineColorAnim* anim);

/*
 * Position Animation Functions
 */

// Get position at time
CrystallinePoint crystalline_position_anim_at(CrystallinePositionAnim* anim, float time);

// Get current position
CrystallinePoint crystalline_position_anim_current(CrystallinePositionAnim* anim);

/*
 * Animation Sequencing
 */

// Chain animations (start second when first finishes)
void crystalline_anim_chain(CrystallineAnimation* first, CrystallineAnimation* second);

// Run animations in parallel
void crystalline_anim_parallel_update(CrystallineAnimation** anims, int count, float delta_time);

/*
 * Utility Functions
 */

// Get time in seconds (for animation timing)
float crystalline_anim_get_current_time(void);

// Calculate delta time between frames
float crystalline_anim_calculate_delta(float last_time, float current_time);

#ifdef __cplusplus
}
#endif

#endif /* CRYSTALLINE_ANIMATION_H */