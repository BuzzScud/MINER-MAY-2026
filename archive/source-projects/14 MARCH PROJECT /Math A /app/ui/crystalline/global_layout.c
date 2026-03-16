/*
 * Crystalline Global Layout System - Implementation
 */

#include "global_layout.h"
#include "../../app_common.h"
#include <string.h>

// Global layout context instance
static CrystallineLayoutContext g_layout_context = {0};
static bool g_layout_initialized = false;

/*
 * Global Layout Context Functions
 */

void crystalline_layout_context_init(int window_w, int window_h,
                                      int sidebar_w, int submenu_h,
                                      int control_panel_w) {
    g_layout_context.window_width = window_w;
    g_layout_context.window_height = window_h;
    g_layout_context.sidebar_width = sidebar_w;
    g_layout_context.submenu_height = submenu_h;
    g_layout_context.control_panel_width = control_panel_w;
    
    // Calculate render area
    g_layout_context.render_area_x = sidebar_w;
    g_layout_context.render_area_y = submenu_h;
    g_layout_context.render_area_width = window_w - sidebar_w - control_panel_w;
    g_layout_context.render_area_height = window_h - submenu_h;
    
    // Calculate control panel area
    g_layout_context.control_panel_x = sidebar_w + g_layout_context.render_area_width;
    g_layout_context.control_panel_y = submenu_h;
    g_layout_context.control_panel_height = window_h - submenu_h;
    
    // Default state
    g_layout_context.control_panel_visible = true;
    g_layout_context.sidebar_visible = true;
    
    g_layout_initialized = true;
}

CrystallineLayoutContext* crystalline_layout_context_get(void) {
    if (!g_layout_initialized) {
        // Initialize with default values from app_common.h
        crystalline_layout_context_init(
            WINDOW_WIDTH,
            WINDOW_HEIGHT,
            SIDEBAR_WIDTH,
            SUBMENU_HEIGHT,
            CONTROL_PANEL_WIDTH
        );
    }
    return &g_layout_context;
}

void crystalline_layout_context_update_window(int window_w, int window_h) {
    g_layout_context.window_width = window_w;
    g_layout_context.window_height = window_h;
    
    // Recalculate areas
    g_layout_context.render_area_width = window_w - g_layout_context.sidebar_width - 
                                          g_layout_context.control_panel_width;
    g_layout_context.render_area_height = window_h - g_layout_context.submenu_height;
    
    g_layout_context.control_panel_x = g_layout_context.sidebar_width + 
                                        g_layout_context.render_area_width;
    g_layout_context.control_panel_height = window_h - g_layout_context.submenu_height;
}

void crystalline_layout_context_toggle_control_panel(bool visible) {
    g_layout_context.control_panel_visible = visible;
}

void crystalline_layout_context_toggle_sidebar(bool visible) {
    g_layout_context.sidebar_visible = visible;
}

CrystallineLayoutRect crystalline_layout_get_render_area(void) {
    CrystallineLayoutContext* ctx = crystalline_layout_context_get();
    
    return (CrystallineLayoutRect){
        .x = ctx->render_area_x,
        .y = ctx->render_area_y,
        .width = ctx->render_area_width,
        .height = ctx->render_area_height
    };
}

CrystallineLayoutRect crystalline_layout_get_control_panel_area(void) {
    CrystallineLayoutContext* ctx = crystalline_layout_context_get();
    
    return (CrystallineLayoutRect){
        .x = ctx->control_panel_x,
        .y = ctx->control_panel_y,
        .width = ctx->control_panel_width,
        .height = ctx->control_panel_height
    };
}

CrystallineLayoutRect crystalline_layout_get_sidebar_area(void) {
    CrystallineLayoutContext* ctx = crystalline_layout_context_get();
    
    return (CrystallineLayoutRect){
        .x = 0,
        .y = ctx->submenu_height,
        .width = ctx->sidebar_width,
        .height = ctx->window_height - ctx->submenu_height
    };
}

// Get visualization area (left side, golden ratio split)
// This matches the training tab pattern exactly
CrystallineLayoutRect crystalline_layout_get_viz_area(void) {
    CrystallineLayoutContext* ctx = crystalline_layout_context_get();
    
    // Training tab pattern:
    int content_width = ctx->window_width - ctx->sidebar_width;  // 1400px
    int viz_width = (int)(content_width * 0.618f);               // 865px (61.8%)
    
    return (CrystallineLayoutRect){
        .x = ctx->render_area_x + 10,
        .y = ctx->render_area_y + 10,
        .width = viz_width - 20,
        .height = ctx->window_height - ctx->render_area_y - 150
    };
}

// Get control area (right side, golden ratio split)
// This matches the training tab pattern exactly
CrystallineLayoutRect crystalline_layout_get_control_area(void) {
    CrystallineLayoutContext* ctx = crystalline_layout_context_get();
    
    // Training tab pattern:
    int content_width = ctx->window_width - ctx->sidebar_width;  // 1400px
    int viz_width = (int)(content_width * 0.618f);               // 865px (61.8%)
    int control_width = content_width - viz_width;                // 535px (38.2%)
    
    return (CrystallineLayoutRect){
        .x = ctx->render_area_x + viz_width + 10,
        .y = ctx->render_area_y + 10,
        .width = control_width - 30,
        .height = ctx->window_height - ctx->render_area_y - 20
    };
}

// Helper: Convert TOP-LEFT rect to CENTER point for Crystalline UI
CrystallinePoint crystalline_layout_rect_to_center(CrystallineLayoutRect rect) {
    return (CrystallinePoint){
        .x = rect.x + rect.width / 2.0f,
        .y = rect.y + rect.height / 2.0f
    };
}

/*
 * Tab Layout Functions
 */

CrystallineTabLayout crystalline_tab_layout_create(CrystallineTabLayoutMode mode) {
    CrystallineTabLayout layout = {0};
    layout.mode = mode;
    
    CrystallineLayoutContext* ctx = crystalline_layout_context_get();
    
    switch (mode) {
        case CRYSTALLINE_TAB_LAYOUT_RENDER_ONLY:
            // Use only render area (1080px)
            layout.content_area = crystalline_layout_get_render_area();
            layout.uses_control_panel = false;
            break;
            
        case CRYSTALLINE_TAB_LAYOUT_FULL_WIDTH:
            // Use render area + control panel (1400px)
            layout.content_area = crystalline_layout_rect_from_topleft(
                ctx->render_area_x,
                ctx->render_area_y,
                ctx->render_area_width + ctx->control_panel_width,
                ctx->render_area_height
            );
            layout.uses_control_panel = true;
            break;
            
        case CRYSTALLINE_TAB_LAYOUT_CENTERED:
            // Centered in render area
            layout.content_area = crystalline_layout_get_render_area();
            layout.uses_control_panel = false;
            break;
            
        case CRYSTALLINE_TAB_LAYOUT_CUSTOM:
            // Custom - tab manages its own layout
            layout.content_area = crystalline_layout_get_render_area();
            layout.uses_control_panel = false;
            break;
    }
    
    // Default split ratios
    layout.horizontal_split = 0.5f;
    layout.vertical_split = 0.5f;
    
    // Default padding
    layout.padding_top = CRYSTALLINE_PADDING_MEDIUM;
    layout.padding_bottom = CRYSTALLINE_PADDING_MEDIUM;
    layout.padding_left = CRYSTALLINE_PADDING_MEDIUM;
    layout.padding_right = CRYSTALLINE_PADDING_MEDIUM;
    
    return layout;
}

CrystallineLayoutRect crystalline_tab_layout_get_content(CrystallineTabLayout* layout) {
    if (!layout) {
        return (CrystallineLayoutRect){0};
    }
    
    // Apply padding
    return crystalline_layout_rect_inset(
        layout->content_area,
        layout->padding_top,
        layout->padding_bottom,
        layout->padding_left,
        layout->padding_right
    );
}

CrystallineLayoutRect crystalline_tab_layout_get_control(CrystallineTabLayout* layout) {
    if (!layout || !layout->uses_control_panel) {
        return (CrystallineLayoutRect){0};
    }
    
    return layout->control_area;
}

void crystalline_tab_layout_set_padding(CrystallineTabLayout* layout,
                                         float top, float bottom,
                                         float left, float right) {
    if (!layout) return;
    
    layout->padding_top = top;
    layout->padding_bottom = bottom;
    layout->padding_left = left;
    layout->padding_right = right;
}

/*
 * Content Area Splitting Functions
 */

void crystalline_tab_layout_split_horizontal(CrystallineTabLayout* layout,
                                              float ratio,
                                              float spacing,
                                              CrystallineLayoutRect* left,
                                              CrystallineLayoutRect* right) {
    if (!layout || !left || !right) return;
    
    CrystallineLayoutRect content = crystalline_tab_layout_get_content(layout);
    
    // Calculate widths
    float total_width = content.width - spacing;
    float left_width = total_width * ratio;
    float right_width = total_width - left_width;
    
    // Create left rect (TOP-LEFT coordinates)
    *left = crystalline_layout_rect_from_topleft(
        content.x,
        content.y,
        left_width,
        content.height
    );
    
    // Create right rect (TOP-LEFT coordinates)
    *right = crystalline_layout_rect_from_topleft(
        content.x + left_width + spacing,
        content.y,
        right_width,
        content.height
    );
}

void crystalline_tab_layout_split_vertical(CrystallineTabLayout* layout,
                                            float ratio,
                                            float spacing,
                                            CrystallineLayoutRect* top,
                                            CrystallineLayoutRect* bottom) {
    if (!layout || !top || !bottom) return;
    
    CrystallineLayoutRect content = crystalline_tab_layout_get_content(layout);
    
    // Calculate heights
    float total_height = content.height - spacing;
    float top_height = total_height * ratio;
    float bottom_height = total_height - top_height;
    
    // Create top rect (TOP-LEFT coordinates)
    *top = crystalline_layout_rect_from_topleft(
        content.x,
        content.y,
        content.width,
        top_height
    );
    
    // Create bottom rect (TOP-LEFT coordinates)
    *bottom = crystalline_layout_rect_from_topleft(
        content.x,
        content.y + top_height + spacing,
        content.width,
        bottom_height
    );
}

void crystalline_tab_layout_split_golden_horizontal(CrystallineTabLayout* layout,
                                                     float spacing,
                                                     CrystallineLayoutRect* left,
                                                     CrystallineLayoutRect* right) {
    crystalline_tab_layout_split_horizontal(layout, CRYSTALLINE_GOLDEN_RATIO, 
                                             spacing, left, right);
}

void crystalline_tab_layout_split_golden_vertical(CrystallineTabLayout* layout,
                                                   float spacing,
                                                   CrystallineLayoutRect* top,
                                                   CrystallineLayoutRect* bottom) {
    crystalline_tab_layout_split_vertical(layout, CRYSTALLINE_GOLDEN_RATIO,
                                           spacing, top, bottom);
}

/*
 * Helper Functions
 */

CrystallineLayoutRect crystalline_layout_rect_from_center(float center_x, float center_y,
                                                           float width, float height) {
    CrystallineLayoutRect rect;
    rect.x = center_x - width / 2.0f;
    rect.y = center_y - height / 2.0f;
    rect.width = width;
    rect.height = height;
    return rect;
}

CrystallineLayoutRect crystalline_layout_rect_from_topleft(float x, float y,
                                                            float width, float height) {
    CrystallineLayoutRect rect;
    rect.x = x;
    rect.y = y;
    rect.width = width;
    rect.height = height;
    return rect;
}

CrystallinePoint crystalline_layout_rect_center(CrystallineLayoutRect rect) {
    CrystallinePoint center;
    center.x = rect.x + rect.width / 2.0f;
    center.y = rect.y + rect.height / 2.0f;
    return center;
}

CrystallineLayoutRect crystalline_layout_rect_inset(CrystallineLayoutRect rect,
                                                     float top, float bottom,
                                                     float left, float right) {
    CrystallineLayoutRect inset;
    inset.x = rect.x + left;
    inset.y = rect.y + top;
    inset.width = rect.width - left - right;
    inset.height = rect.height - top - bottom;
    return inset;
}

bool crystalline_layout_rect_contains(CrystallineLayoutRect rect, float x, float y) {
    float left = rect.x;
    float right = rect.x + rect.width;
    float top = rect.y;
    float bottom = rect.y + rect.height;
    
    return (x >= left && x <= right && y >= top && y <= bottom);
}