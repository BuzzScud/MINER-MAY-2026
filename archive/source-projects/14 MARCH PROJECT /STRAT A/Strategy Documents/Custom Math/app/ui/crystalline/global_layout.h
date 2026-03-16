/*
 * Crystalline Global Layout System
 * 
 * Provides a unified layout system for all tabs in the application.
 * Eliminates inconsistent coordinate systems and provides reusable patterns.
 * 
 * Design Principles:
 * - Single source of truth for layout dimensions
 * - Consistent coordinate systems across all tabs
 * - Reusable layout patterns (golden ratio splits, etc.)
 * - Support for different tab layout modes
 */

#ifndef CRYSTALLINE_GLOBAL_LAYOUT_H
#define CRYSTALLINE_GLOBAL_LAYOUT_H

#include "geometry.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Layout Rectangle (TOP-LEFT coordinates)
 * 
 * This matches the training tab pattern:
 * - x, y are TOP-LEFT coordinates
 * - width, height are dimensions
 * - Convert to CENTER when creating Crystalline UI elements
 */
typedef struct {
    int x;       // TOP-LEFT X
    int y;       // TOP-LEFT Y
    int width;   // WIDTH
    int height;  // HEIGHT
} CrystallineLayoutRect;

/*
 * Global Layout Context
 * 
 * Single source of truth for all layout dimensions.
 * Initialized once at application startup.
 */
typedef struct {
    // Window dimensions
    int window_width;
    int window_height;
    
    // Fixed UI zones
    int sidebar_width;
    int submenu_height;
    int control_panel_width;
    
    // Render area (main content area)
    int render_area_x;
    int render_area_y;
    int render_area_width;
    int render_area_height;
    
    // Control panel zone
    int control_panel_x;
    int control_panel_y;
    int control_panel_height;
    
    // State
    bool control_panel_visible;
    bool sidebar_visible;
    
} CrystallineLayoutContext;

/*
 * Tab Layout Modes
 * 
 * Different tabs have different layout needs.
 * This enum defines the standard layout modes.
 */
typedef enum {
    // Use only render area (1080px width)
    // For tabs that don't need control panel space
    // Example: LLM tab, Research tab
    CRYSTALLINE_TAB_LAYOUT_RENDER_ONLY,
    
    // Use render area + control panel (1400px width)
    // For tabs that extend into control panel
    // Example: Training tab
    CRYSTALLINE_TAB_LAYOUT_FULL_WIDTH,
    
    // Centered in render area
    // For tabs with centered content
    CRYSTALLINE_TAB_LAYOUT_CENTERED,
    
    // Custom layout
    // Tab manages its own layout completely
    CRYSTALLINE_TAB_LAYOUT_CUSTOM
    
} CrystallineTabLayoutMode;

/*
 * Tab Layout Structure
 * 
 * Defines the layout for a specific tab.
 * Created based on the tab's layout mode.
 */
typedef struct {
    CrystallineTabLayoutMode mode;
    
    // Content area (calculated based on mode)
    CrystallineLayoutRect content_area;
    
    // Control panel area (if used)
    CrystallineLayoutRect control_area;
    bool uses_control_panel;
    
    // Split ratios (for dividing content area)
    float horizontal_split;  // 0.0-1.0 (left/right split)
    float vertical_split;    // 0.0-1.0 (top/bottom split)
    
    // Padding
    float padding_top;
    float padding_bottom;
    float padding_left;
    float padding_right;
    
} CrystallineTabLayout;

/*
 * Global Layout Context Functions
 */

// Initialize global layout context
// Call once at application startup
void crystalline_layout_context_init(int window_w, int window_h,
                                      int sidebar_w, int submenu_h,
                                      int control_panel_w);

// Get global layout context
CrystallineLayoutContext* crystalline_layout_context_get(void);

// Update window dimensions (on resize)
void crystalline_layout_context_update_window(int window_w, int window_h);

// Toggle control panel visibility
void crystalline_layout_context_toggle_control_panel(bool visible);

// Toggle sidebar visibility
void crystalline_layout_context_toggle_sidebar(bool visible);

// Get render area bounds (TOP-LEFT coordinates)
CrystallineLayoutRect crystalline_layout_get_render_area(void);

// Get control panel bounds (TOP-LEFT coordinates)
CrystallineLayoutRect crystalline_layout_get_control_panel_area(void);

// Get sidebar bounds (TOP-LEFT coordinates)
CrystallineLayoutRect crystalline_layout_get_sidebar_area(void);

// Get visualization area (left side, golden ratio split)
CrystallineLayoutRect crystalline_layout_get_viz_area(void);

// Get control area (right side, golden ratio split)
CrystallineLayoutRect crystalline_layout_get_control_area(void);

// Helper: Convert TOP-LEFT rect to CENTER point for Crystalline UI
CrystallinePoint crystalline_layout_rect_to_center(CrystallineLayoutRect rect);

/*
 * Tab Layout Functions
 */

// Create tab layout with specified mode
CrystallineTabLayout crystalline_tab_layout_create(CrystallineTabLayoutMode mode);

// Get content area for tab
CrystallineLayoutRect crystalline_tab_layout_get_content(CrystallineTabLayout* layout);

// Get control area for tab (if uses_control_panel is true)
CrystallineLayoutRect crystalline_tab_layout_get_control(CrystallineTabLayout* layout);

// Set padding for tab layout
void crystalline_tab_layout_set_padding(CrystallineTabLayout* layout,
                                         float top, float bottom,
                                         float left, float right);

/*
 * Content Area Splitting Functions
 */

// Split content area horizontally (left/right)
// ratio: 0.0-1.0, percentage for left side
// spacing: pixels between left and right
void crystalline_tab_layout_split_horizontal(CrystallineTabLayout* layout,
                                              float ratio,
                                              float spacing,
                                              CrystallineLayoutRect* left,
                                              CrystallineLayoutRect* right);

// Split content area vertically (top/bottom)
// ratio: 0.0-1.0, percentage for top side
// spacing: pixels between top and bottom
void crystalline_tab_layout_split_vertical(CrystallineTabLayout* layout,
                                            float ratio,
                                            float spacing,
                                            CrystallineLayoutRect* top,
                                            CrystallineLayoutRect* bottom);

// Split using golden ratio (0.618)
void crystalline_tab_layout_split_golden_horizontal(CrystallineTabLayout* layout,
                                                     float spacing,
                                                     CrystallineLayoutRect* left,
                                                     CrystallineLayoutRect* right);

void crystalline_tab_layout_split_golden_vertical(CrystallineTabLayout* layout,
                                                   float spacing,
                                                   CrystallineLayoutRect* top,
                                                   CrystallineLayoutRect* bottom);

/*
 * Helper Functions
 */

// Create rect from center point and dimensions
CrystallineLayoutRect crystalline_layout_rect_from_center(float center_x, float center_y,
                                                           float width, float height);

// Create rect from top-left point and dimensions
CrystallineLayoutRect crystalline_layout_rect_from_topleft(float x, float y,
                                                            float width, float height);

// Get center point of rect
CrystallinePoint crystalline_layout_rect_center(CrystallineLayoutRect rect);

// Inset rect by padding
CrystallineLayoutRect crystalline_layout_rect_inset(CrystallineLayoutRect rect,
                                                     float top, float bottom,
                                                     float left, float right);

// Check if point is inside rect
bool crystalline_layout_rect_contains(CrystallineLayoutRect rect, float x, float y);

/*
 * Layout Constants
 */

// Golden ratio
#define CRYSTALLINE_GOLDEN_RATIO 0.618033988749895f

// Standard spacing values
#define CRYSTALLINE_SPACING_TINY 5.0f
#define CRYSTALLINE_SPACING_SMALL 10.0f
#define CRYSTALLINE_SPACING_MEDIUM 15.0f
#define CRYSTALLINE_SPACING_LARGE 20.0f
#define CRYSTALLINE_SPACING_XLARGE 30.0f

// Standard padding values
#define CRYSTALLINE_PADDING_NONE 0.0f
#define CRYSTALLINE_PADDING_SMALL 5.0f
#define CRYSTALLINE_PADDING_MEDIUM 10.0f
#define CRYSTALLINE_PADDING_LARGE 15.0f
#define CRYSTALLINE_PADDING_XLARGE 20.0f

#ifdef __cplusplus
}
#endif

#endif /* CRYSTALLINE_GLOBAL_LAYOUT_H */