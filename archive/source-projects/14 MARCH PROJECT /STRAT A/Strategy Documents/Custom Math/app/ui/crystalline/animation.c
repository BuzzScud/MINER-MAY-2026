/*
 * Crystalline Animation - Implementation
 * 
 * Animation system for the Crystalline UI
 * ALL calculations use prime_* functions
 */

#include "animation.h"
#include <SDL2/SDL.h>
#include <string.h>

/*
 * Easing Functions
 */

float crystalline_ease(float t, CrystallineEaseType ease) {
    switch (ease) {
        case CRYSTALLINE_EASE_LINEAR:       return crystalline_ease_linear(t);
        case CRYSTALLINE_EASE_SMOOTH:       return crystalline_ease_smooth(t);
        case CRYSTALLINE_EASE_SMOOTHER:     return crystalline_ease_smoother(t);
        case CRYSTALLINE_EASE_IN_QUAD:      return crystalline_ease_in_quad(t);
        case CRYSTALLINE_EASE_OUT_QUAD:     return crystalline_ease_out_quad(t);
        case CRYSTALLINE_EASE_INOUT_QUAD:   return crystalline_ease_inout_quad(t);
        case CRYSTALLINE_EASE_IN_CUBIC:     return crystalline_ease_in_cubic(t);
        case CRYSTALLINE_EASE_OUT_CUBIC:    return crystalline_ease_out_cubic(t);
        case CRYSTALLINE_EASE_INOUT_CUBIC:  return crystalline_ease_inout_cubic(t);
        case CRYSTALLINE_EASE_IN_EXPO:      return crystalline_ease_in_expo(t);
        case CRYSTALLINE_EASE_OUT_EXPO:     return crystalline_ease_out_expo(t);
        case CRYSTALLINE_EASE_INOUT_EXPO:   return crystalline_ease_inout_expo(t);
        case CRYSTALLINE_EASE_IN_SINE:      return crystalline_ease_in_sine(t);
        case CRYSTALLINE_EASE_OUT_SINE:     return crystalline_ease_out_sine(t);
        case CRYSTALLINE_EASE_INOUT_SINE:   return crystalline_ease_inout_sine(t);
        case CRYSTALLINE_EASE_ELASTIC:      return crystalline_ease_elastic(t);
        case CRYSTALLINE_EASE_BOUNCE:       return crystalline_ease_bounce(t);
        case CRYSTALLINE_EASE_GOLDEN:       return crystalline_ease_golden(t);
        default:                            return t;
    }
}

float crystalline_ease_linear(float t) {
    return crystalline_clamp(t, 0.0f, 1.0f);
}

float crystalline_ease_smooth(float t) {
    return crystalline_smooth_step(t);
}

float crystalline_ease_smoother(float t) {
    return crystalline_smoother_step(t);
}

float crystalline_ease_in_quad(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    return t * t;
}

float crystalline_ease_out_quad(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    return t * (2.0f - t);
}

float crystalline_ease_inout_quad(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    if (t < 0.5f) {
        return 2.0f * t * t;
    } else {
        return -1.0f + (4.0f - 2.0f * t) * t;
    }
}

float crystalline_ease_in_cubic(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    return t * t * t;
}

float crystalline_ease_out_cubic(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    float f = t - 1.0f;
    return f * f * f + 1.0f;
}

float crystalline_ease_inout_cubic(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    if (t < 0.5f) {
        return 4.0f * t * t * t;
    } else {
        float f = (2.0f * t - 2.0f);
        return 0.5f * f * f * f + 1.0f;
    }
}

float crystalline_ease_in_expo(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    if (t == 0.0f) return 0.0f;
    return math_pow(2.0f, 10.0f * (t - 1.0f));
}

float crystalline_ease_out_expo(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    if (t == 1.0f) return 1.0f;
    return 1.0f - math_pow(2.0f, -10.0f * t);
}

float crystalline_ease_inout_expo(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    if (t == 0.0f) return 0.0f;
    if (t == 1.0f) return 1.0f;
    
    if (t < 0.5f) {
        return 0.5f * math_pow(2.0f, 20.0f * t - 10.0f);
    } else {
        return 1.0f - 0.5f * math_pow(2.0f, -20.0f * t + 10.0f);
    }
}

float crystalline_ease_in_sine(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    return 1.0f - math_cos(t * M_PI / 2.0f);
}

float crystalline_ease_out_sine(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    return math_sin(t * M_PI / 2.0f);
}

float crystalline_ease_inout_sine(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    return 0.5f * (1.0f - math_cos(t * M_PI));
}

float crystalline_ease_elastic(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    if (t == 0.0f) return 0.0f;
    if (t == 1.0f) return 1.0f;
    
    float p = 0.3f;
    float s = p / 4.0f;
    float post = math_pow(2.0f, -10.0f * t);
    return post * math_sin((t - s) * CRYSTALLINE_TWO_PI / p) + 1.0f;
}

float crystalline_ease_bounce(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    
    if (t < 1.0f / 2.75f) {
        return 7.5625f * t * t;
    } else if (t < 2.0f / 2.75f) {
        t -= 1.5f / 2.75f;
        return 7.5625f * t * t + 0.75f;
    } else if (t < 2.5f / 2.75f) {
        t -= 2.25f / 2.75f;
        return 7.5625f * t * t + 0.9375f;
    } else {
        t -= 2.625f / 2.75f;
        return 7.5625f * t * t + 0.984375f;
    }
}

float crystalline_ease_golden(float t) {
    t = crystalline_clamp(t, 0.0f, 1.0f);
    // Use golden ratio for non-linear easing
    return math_pow(t, CRYSTALLINE_PHI_INV);
}

/*
 * Animation Creation Functions
 */

CrystallineAnimation crystalline_anim_create(float duration, CrystallineEaseType ease) {
    CrystallineAnimation anim;
    anim.state = CRYSTALLINE_ANIM_STOPPED;
    anim.ease = ease;
    anim.loop = CRYSTALLINE_LOOP_NONE;
    anim.duration = duration;
    anim.elapsed = 0.0f;
    anim.delay = 0.0f;
    anim.speed = 1.0f;
    anim.reverse = false;
    anim.loop_count = 0;
    anim.max_loops = 1;
    return anim;
}

CrystallinePulseAnim crystalline_anim_pulse(float frequency, float amplitude) {
    CrystallinePulseAnim anim;
    anim.base = crystalline_anim_create(0.0f, CRYSTALLINE_EASE_LINEAR);
    anim.base.loop = CRYSTALLINE_LOOP_INFINITE;
    anim.frequency = frequency;
    anim.amplitude = amplitude;
    anim.phase = 0.0f;
    anim.base_value = 0.0f;
    return anim;
}

CrystallineRotationAnim crystalline_anim_rotation(float start_angle, float end_angle, 
                                                   float duration) {
    CrystallineRotationAnim anim;
    anim.base = crystalline_anim_create(duration, CRYSTALLINE_EASE_LINEAR);
    anim.start_angle = start_angle;
    anim.end_angle = end_angle;
    anim.current_angle = start_angle;
    anim.clockwise = end_angle > start_angle;
    return anim;
}

CrystallineFadeAnim crystalline_anim_fade(float start_alpha, float end_alpha, float duration) {
    CrystallineFadeAnim anim;
    anim.base = crystalline_anim_create(duration, CRYSTALLINE_EASE_SMOOTH);
    anim.start_alpha = start_alpha;
    anim.end_alpha = end_alpha;
    anim.current_alpha = start_alpha;
    return anim;
}

CrystallineSpiralAnim crystalline_anim_spiral(float start_radius, float end_radius, 
                                               float rotations, float duration) {
    CrystallineSpiralAnim anim;
    anim.base = crystalline_anim_create(duration, CRYSTALLINE_EASE_LINEAR);
    anim.start_radius = start_radius;
    anim.end_radius = end_radius;
    anim.rotations = rotations;
    anim.current_angle = 0.0f;
    anim.current_radius = start_radius;
    return anim;
}

CrystallineColorAnim crystalline_anim_color(SDL_Color start, SDL_Color end, float duration) {
    CrystallineColorAnim anim;
    anim.base = crystalline_anim_create(duration, CRYSTALLINE_EASE_SMOOTH);
    anim.start_color = start;
    anim.end_color = end;
    anim.current_color = start;
    anim.use_hsv = false;
    return anim;
}

CrystallinePositionAnim crystalline_anim_position(CrystallinePoint start, CrystallinePoint end,
                                                   float duration) {
    CrystallinePositionAnim anim;
    anim.base = crystalline_anim_create(duration, CRYSTALLINE_EASE_SMOOTH);
    anim.start_pos = start;
    anim.end_pos = end;
    anim.current_pos = start;
    anim.use_spiral = false;
    return anim;
}

/*
 * Animation Control Functions
 */

void crystalline_anim_start(CrystallineAnimation* anim) {
    anim->state = CRYSTALLINE_ANIM_PLAYING;
    anim->elapsed = 0.0f;
    anim->loop_count = 0;
}

void crystalline_anim_stop(CrystallineAnimation* anim) {
    anim->state = CRYSTALLINE_ANIM_STOPPED;
    anim->elapsed = 0.0f;
}

void crystalline_anim_pause(CrystallineAnimation* anim) {
    if (anim->state == CRYSTALLINE_ANIM_PLAYING) {
        anim->state = CRYSTALLINE_ANIM_PAUSED;
    }
}

void crystalline_anim_resume(CrystallineAnimation* anim) {
    if (anim->state == CRYSTALLINE_ANIM_PAUSED) {
        anim->state = CRYSTALLINE_ANIM_PLAYING;
    }
}

void crystalline_anim_reset(CrystallineAnimation* anim) {
    anim->elapsed = 0.0f;
    anim->loop_count = 0;
    anim->reverse = false;
}

void crystalline_anim_set_loop(CrystallineAnimation* anim, CrystallineLoopMode loop, 
                               int max_loops) {
    anim->loop = loop;
    anim->max_loops = max_loops;
}

void crystalline_anim_set_speed(CrystallineAnimation* anim, float speed) {
    anim->speed = speed;
}

void crystalline_anim_set_delay(CrystallineAnimation* anim, float delay) {
    anim->delay = delay;
}

/*
 * Animation Update Functions
 */

void crystalline_anim_update(CrystallineAnimation* anim, float delta_time) {
    if (anim->state != CRYSTALLINE_ANIM_PLAYING) return;
    
    // Handle delay
    if (anim->delay > 0.0f) {
        anim->delay -= delta_time;
        return;
    }
    
    // Update elapsed time
    anim->elapsed += delta_time * anim->speed;
    
    // Check if animation finished
    if (anim->duration > 0.0f && anim->elapsed >= anim->duration) {
        anim->loop_count++;
        
        // Handle looping
        switch (anim->loop) {
            case CRYSTALLINE_LOOP_NONE:
                anim->state = CRYSTALLINE_ANIM_FINISHED;
                anim->elapsed = anim->duration;
                break;
                
            case CRYSTALLINE_LOOP_REPEAT:
                if (anim->max_loops < 0 || anim->loop_count < anim->max_loops) {
                    anim->elapsed = 0.0f;
                } else {
                    anim->state = CRYSTALLINE_ANIM_FINISHED;
                }
                break;
                
            case CRYSTALLINE_LOOP_PINGPONG:
                if (anim->max_loops < 0 || anim->loop_count < anim->max_loops) {
                    anim->reverse = !anim->reverse;
                    anim->elapsed = 0.0f;
                } else {
                    anim->state = CRYSTALLINE_ANIM_FINISHED;
                }
                break;
                
            case CRYSTALLINE_LOOP_INFINITE:
                anim->elapsed = 0.0f;
                break;
        }
    }
}

void crystalline_anim_pulse_update(CrystallinePulseAnim* anim, float delta_time) {
    crystalline_anim_update(&anim->base, delta_time);
}

void crystalline_anim_rotation_update(CrystallineRotationAnim* anim, float delta_time) {
    crystalline_anim_update(&anim->base, delta_time);
    anim->current_angle = crystalline_rotation_current(anim);
}

void crystalline_anim_fade_update(CrystallineFadeAnim* anim, float delta_time) {
    crystalline_anim_update(&anim->base, delta_time);
    anim->current_alpha = crystalline_fade_current(anim);
}

void crystalline_anim_spiral_update(CrystallineSpiralAnim* anim, float delta_time) {
    crystalline_anim_update(&anim->base, delta_time);
    
    float t = crystalline_anim_get_eased_time(&anim->base);
    anim->current_angle = CRYSTALLINE_TWO_PI * anim->rotations * t;
    
    // Exponential growth for golden spiral
    if (anim->end_radius > 0.0f && anim->start_radius > 0.0f) {
        float growth = math_log(anim->end_radius / anim->start_radius);
        anim->current_radius = anim->start_radius * math_exp(growth * t);
    } else {
        anim->current_radius = anim->start_radius + (anim->end_radius - anim->start_radius) * t;
    }
}

void crystalline_anim_color_update(CrystallineColorAnim* anim, float delta_time) {
    crystalline_anim_update(&anim->base, delta_time);
    anim->current_color = crystalline_color_anim_current(anim);
}

void crystalline_anim_position_update(CrystallinePositionAnim* anim, float delta_time) {
    crystalline_anim_update(&anim->base, delta_time);
    anim->current_pos = crystalline_position_anim_current(anim);
}

/*
 * Animation Query Functions
 */

float crystalline_anim_get_time(CrystallineAnimation* anim) {
    if (anim->duration <= 0.0f) return 0.0f;
    
    float t = anim->elapsed / anim->duration;
    
    if (anim->reverse) {
        t = 1.0f - t;
    }
    
    return crystalline_clamp(t, 0.0f, 1.0f);
}

float crystalline_anim_get_eased_time(CrystallineAnimation* anim) {
    float t = crystalline_anim_get_time(anim);
    return crystalline_ease(t, anim->ease);
}

bool crystalline_anim_is_playing(CrystallineAnimation* anim) {
    return anim->state == CRYSTALLINE_ANIM_PLAYING;
}

bool crystalline_anim_is_finished(CrystallineAnimation* anim) {
    return anim->state == CRYSTALLINE_ANIM_FINISHED;
}

float crystalline_anim_get_progress(CrystallineAnimation* anim) {
    return crystalline_anim_get_time(anim) * 100.0f;
}

/*
 * Pulse Animation Functions
 */

float crystalline_pulse_value(CrystallinePulseAnim* anim, float time) {
    // Pulse using sine wave: base + amplitude * sin(2πft + phase)
    float value = anim->base_value + anim->amplitude * 
                  math_sin(CRYSTALLINE_TWO_PI * anim->frequency * time + anim->phase);
    return value;
}

float crystalline_pulse_current(CrystallinePulseAnim* anim) {
    return crystalline_pulse_value(anim, anim->base.elapsed);
}

/*
 * Rotation Animation Functions
 */

float crystalline_rotation_angle(CrystallineRotationAnim* anim, float time __attribute__((unused))) {
    float t = crystalline_anim_get_eased_time(&anim->base);
    return anim->start_angle + (anim->end_angle - anim->start_angle) * t;
}

float crystalline_rotation_current(CrystallineRotationAnim* anim) {
    return crystalline_rotation_angle(anim, anim->base.elapsed);
}

/*
 * Fade Animation Functions
 */

float crystalline_fade_alpha(CrystallineFadeAnim* anim, float time __attribute__((unused))) {
    float t = crystalline_anim_get_eased_time(&anim->base);
    return anim->start_alpha + (anim->end_alpha - anim->start_alpha) * t;
}

float crystalline_fade_current(CrystallineFadeAnim* anim) {
    return crystalline_fade_alpha(anim, anim->base.elapsed);
}

/*
 * Spiral Animation Functions
 */

CrystallinePoint crystalline_spiral_position(CrystallineSpiralAnim* anim, float time __attribute__((unused))) {
    float t = crystalline_anim_get_eased_time(&anim->base);
    float angle = CRYSTALLINE_TWO_PI * anim->rotations * t;
    
    float radius;
    if (anim->end_radius > 0.0f && anim->start_radius > 0.0f) {
        float growth = math_log(anim->end_radius / anim->start_radius);
        radius = anim->start_radius * math_exp(growth * t);
    } else {
        radius = anim->start_radius + (anim->end_radius - anim->start_radius) * t;
    }
    
    return crystalline_point_polar(angle, radius);
}

CrystallinePoint crystalline_spiral_current(CrystallineSpiralAnim* anim) {
    return crystalline_point_polar(anim->current_angle, anim->current_radius);
}

/*
 * Color Animation Functions
 */

SDL_Color crystalline_color_anim_at(CrystallineColorAnim* anim, float time __attribute__((unused))) {
    float t = crystalline_anim_get_eased_time(&anim->base);
    
    if (anim->use_hsv) {
        return crystalline_color_hsv_lerp(anim->start_color, anim->end_color, t);
    } else {
        return crystalline_color_lerp(anim->start_color, anim->end_color, t);
    }
}

SDL_Color crystalline_color_anim_current(CrystallineColorAnim* anim) {
    return crystalline_color_anim_at(anim, anim->base.elapsed);
}

/*
 * Position Animation Functions
 */

CrystallinePoint crystalline_position_anim_at(CrystallinePositionAnim* anim, float time __attribute__((unused))) {
    float t = crystalline_anim_get_eased_time(&anim->base);
    
    if (anim->use_spiral) {
        return crystalline_point_spiral_lerp(anim->start_pos, anim->end_pos, t);
    } else {
        return crystalline_point_lerp(anim->start_pos, anim->end_pos, t);
    }
}

CrystallinePoint crystalline_position_anim_current(CrystallinePositionAnim* anim) {
    return crystalline_position_anim_at(anim, anim->base.elapsed);
}

/*
 * Animation Sequencing
 */

void crystalline_anim_chain(CrystallineAnimation* first, CrystallineAnimation* second) {
    if (crystalline_anim_is_finished(first) && second->state == CRYSTALLINE_ANIM_STOPPED) {
        crystalline_anim_start(second);
    }
}

void crystalline_anim_parallel_update(CrystallineAnimation** anims, int count, float delta_time) {
    for (int i = 0; i < count; i++) {
        if (anims[i]) {
            crystalline_anim_update(anims[i], delta_time);
        }
    }
}

/*
 * Utility Functions
 */

float crystalline_anim_get_current_time(void) {
    return SDL_GetTicks() / 1000.0f;
}

float crystalline_anim_calculate_delta(float last_time, float current_time) {
    return current_time - last_time;
}