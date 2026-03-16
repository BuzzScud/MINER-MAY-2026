/*
 * Crystalline UI Elements - Header
 * 
 * Custom UI elements for the Crystalline UI system
 * Supports BOTH crystalline sacred geometry AND traditional rectangular layouts
 * 
 * Design Philosophy:
 * - Each element can be rendered in multiple styles:
 *   1. CRYSTALLINE: Circular, sacred geometry, 12-fold symmetry
 *   2. RECTANGULAR: Traditional square/rectangular UI
 *   3. HYBRID: Mix of both styles
 * - All elements use the same underlying structure
 * - Style can be changed at runtime
 * - All calculations still use prime_* functions
 */

#ifndef CRYSTALLINE_ELEMENTS_H
#define CRYSTALLINE_ELEMENTS_H

#include "geometry.h"
#include "layout.h"
#include "draw.h"
#include "color.h"
#include "animation.h"
#include <SDL2/SDL.h>
#include <SDL2/SDL_ttf.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Element Style Types
 */
typedef enum {
    CRYSTALLINE_STYLE_CIRCULAR,     // Circular/sacred geometry style
    CRYSTALLINE_STYLE_RECTANGULAR,  // Traditional rectangular style
    CRYSTALLINE_STYLE_HYBRID        // Mix of both
} CrystallineElementStyle;

/*
 * Element State
 */
typedef enum {
    CRYSTALLINE_STATE_NORMAL,       // Normal state
    CRYSTALLINE_STATE_HOVER,        // Mouse hovering
    CRYSTALLINE_STATE_ACTIVE,       // Being clicked/dragged
    CRYSTALLINE_STATE_DISABLED,     // Disabled
    CRYSTALLINE_STATE_FOCUSED       // Has keyboard focus
} CrystallineElementState;

/*
 * Standard Spacing and Sizing Constants
 */
// Spacing constants
#define SPACING_TINY 5.0f
#define SPACING_SMALL 10.0f
#define SPACING_MEDIUM 15.0f
#define SPACING_LARGE 20.0f
#define SPACING_XLARGE 30.0f

// Padding constants
#define PADDING_PANEL 15.0f
#define PADDING_ELEMENT 10.0f
#define PADDING_LIST_ITEM 5.0f

// Checkbox sizing
#define CHECKBOX_SIZE_SMALL 18.0f
#define CHECKBOX_SIZE_MEDIUM 24.0f  // Increased from 18px - must be clearly visible
#define CHECKBOX_SIZE_LARGE 28.0f
#define CHECKBOX_CLICK_TOLERANCE 12.0f  // Increased tolerance

// Dropdown sizing
#define DROPDOWN_OPTION_HEIGHT 30.0f
#define DROPDOWN_MAX_VISIBLE 5
#define DROPDOWN_CLICK_TOLERANCE 5.0f

/*
 * Common Element Properties
 */
typedef struct {
    CrystallineElementStyle style;  // Rendering style
    CrystallineElementState state;  // Current state
    CrystallinePoint position;      // Position (center for circular, top-left for rect)
    CrystallineRect bounds;         // Bounding area
    SDL_Color color;                // Primary color
    SDL_Color hover_color;          // Hover state color
    SDL_Color active_color;         // Active state color
    SDL_Color disabled_color;       // Disabled state color
    bool visible;                   // Visibility flag
    bool enabled;                   // Enabled flag
    void* user_data;                // User data pointer
} CrystallineElementBase;

/*
 * Button Element
 */
typedef struct {
    CrystallineElementBase base;    // Base properties
    char label[256];                // Button label
    TTF_Font* font;                 // Font for label
    float radius;                   // Radius (for circular style)
    float width;                    // Width (for rectangular style)
    float height;                   // Height (for rectangular style)
    CrystallinePulseAnim pulse;     // Pulse animation
    void (*on_click)(void* data);   // Click callback
} CrystallineButton;

/*
 * Slider Element
 */
typedef struct {
    CrystallineElementBase base;    // Base properties
    float value;                    // Current value (0.0 - 1.0)
    float min_value;                // Minimum value
    float max_value;                // Maximum value
    float step;                     // Step size (0 = continuous)
    char label[256];                // Slider label
    TTF_Font* font;                 // Font for label
    
    // Circular style properties
    float radius;                   // Arc radius
    float start_angle;              // Start angle (radians)
    float end_angle;                // End angle (radians)
    
    // Rectangular style properties
    float width;                    // Track width
    float height;                   // Track height
    float handle_size;              // Handle size
    
    bool dragging;                  // Currently being dragged
    void (*on_change)(float value, void* data);  // Value change callback
} CrystallineSlider;

/*
 * Input Field Element
 */
typedef struct {
    CrystallineElementBase base;    // Base properties
    char text[1024];                // Input text
    char placeholder[256];          // Placeholder text
    int cursor_pos;                 // Cursor position
    int selection_start;            // Selection start
    int selection_end;              // Selection end
    TTF_Font* font;                 // Font for text
    
    // Circular style properties
    float radius;                   // Border radius
    int sides;                      // Number of sides (6=hexagon, 12=dodecagon)
    
    // Rectangular style properties
    float width;                    // Input width
    float height;                   // Input height
    float padding;                  // Internal padding
    
    CrystallinePulseAnim cursor_anim;  // Cursor blink animation
    bool password_mode;             // Password mode (show dots)
    void (*on_change)(const char* text, void* data);  // Text change callback
    void (*on_submit)(const char* text, void* data);  // Submit callback
} CrystallineInput;

/*
 * Progress Bar Element
 */
typedef struct {
    CrystallineElementBase base;    // Base properties
    float progress;                 // Progress value (0.0 - 1.0)
    char label[256];                // Progress label
    TTF_Font* font;                 // Font for label
    bool show_percentage;           // Show percentage text
    
    // Circular style properties
    float radius;                   // Circle radius
    float thickness;                // Ring thickness
    float start_angle;              // Start angle (radians)
    
    // Rectangular style properties
    float width;                    // Bar width
    float height;                   // Bar height
    
    CrystallineColorAnim color_anim;  // Color animation based on progress
} CrystallineProgress;

/*
 * Panel Element
 */
typedef struct {
    CrystallineElementBase base;    // Base properties
    char title[256];                // Panel title
    TTF_Font* title_font;           // Font for title
    
    // Circular style properties
    float radius;                   // Panel radius
    bool show_flower_border;        // Show flower of life border
    bool show_metatron_bg;          // Show metatron's cube background
    
    // Rectangular style properties
    float width;                    // Panel width
    float height;                   // Panel height
    float border_width;             // Border width
    float corner_radius;            // Corner radius (0 = sharp corners)
    
    // Content area
    CrystallineRect content_area;   // Content area bounds
    float padding;                  // Content padding
    
    // Scrolling
    bool scrollable;                // Enable scrolling
    float scroll_offset;            // Current scroll offset
    float content_height;           // Total content height
} CrystallinePanel;

/*
 * List Element
 */
typedef struct {
    CrystallineElementBase base;    // Base properties
    char** items;                   // Array of item strings
    int item_count;                 // Number of items
    int selected_index;             // Selected item index (-1 = none)
    int hover_index;                // Hovered item index (-1 = none)
    TTF_Font* font;                 // Font for items
       
       // Checkbox support
       bool* item_checked;             // Array of checkbox states (NULL = no checkboxes)
       bool show_checkboxes;           // Show checkboxes for each item
       float checkbox_size;            // Size of checkboxes
       float checkbox_click_tolerance; // Click detection tolerance
    
    // Circular style properties
    float radius;                   // List radius
    bool use_clock_lattice;         // Position items on clock lattice
    int ring;                       // Clock ring to use
    
    // Rectangular style properties
    float width;                    // List width
    float item_height;              // Height per item
    int visible_items;              // Number of visible items
    
    // Scrolling
    float scroll_offset;            // Current scroll offset
    bool scrollable;                // Enable scrolling
    
       void (*on_select)(int index, void* data);  // Selection callback
       void (*on_check)(int index, bool checked, void* data);  // Checkbox callback
} CrystallineList;

/*
 * Toggle Element
 */
typedef struct {
    CrystallineElementBase base;    // Base properties
    bool value;                     // Toggle state (on/off)
    char label[256];                // Toggle label
    TTF_Font* font;                 // Font for label
    
    // Circular style properties
    float radius;                   // Toggle radius
    bool use_yinyang;               // Use yin-yang style
    CrystallineRotationAnim rotation;  // Rotation animation
    
    // Rectangular style properties
    float width;                    // Toggle width
    float height;                   // Toggle height
    float handle_size;              // Handle size
    
    CrystallinePositionAnim handle_anim;  // Handle position animation
    void (*on_change)(bool value, void* data);  // Value change callback
} CrystallineToggle;

/*
 * Dropdown Element
 */
typedef struct {
    CrystallineElementBase base;    // Base properties
    char** options;                 // Array of option strings
    int option_count;               // Number of options
    int selected_index;             // Selected option index
    int hover_index;                // Hovered option index
    TTF_Font* font;                 // Font for options
    bool expanded;                  // Dropdown expanded state
    
    // Circular style properties
    float radius;                   // Menu radius
    bool use_radial_menu;           // Use radial menu (12-fold)
    
    // Rectangular style properties
    float width;                    // Dropdown width
    float item_height;              // Height per item
    float max_height;               // Maximum dropdown height
    
    // Interaction improvements
    bool show_hover_highlight;      // Highlight hovered option
    SDL_Color hover_color;          // Color for hover state
    float option_click_tolerance;   // Extra pixels for easier clicking
    
    CrystallineSpiralAnim expand_anim;  // Expand/collapse animation
    void (*on_select)(int index, void* data);  // Selection callback
} CrystallineDropdown;

/*
 * Element Creation Functions
 */

// Create button (style determines if circular or rectangular)
CrystallineButton* crystalline_button_create(CrystallineElementStyle style,
                                              float x, float y,
                                              float size_param1,  // radius or width
                                              float size_param2,  // unused or height
                                              const char* label,
                                              TTF_Font* font);

// Create slider
CrystallineSlider* crystalline_slider_create(CrystallineElementStyle style,
                                              float x, float y,
                                              float size_param1,
                                              float size_param2,
                                              float min_value,
                                              float max_value);

// Create input field
CrystallineInput* crystalline_input_create(CrystallineElementStyle style,
                                            float x, float y,
                                            float size_param1,
                                            float size_param2,
                                            const char* placeholder,
                                            TTF_Font* font);

// Create progress bar
CrystallineProgress* crystalline_progress_create(CrystallineElementStyle style,
                                                  float x, float y,
                                                  float size_param1,
                                                  float size_param2);

// Create panel
CrystallinePanel* crystalline_panel_create(CrystallineElementStyle style,
                                            float x, float y,
                                            float size_param1,
                                            float size_param2,
                                            const char* title,
                                            TTF_Font* title_font);

// Create list
CrystallineList* crystalline_list_create(CrystallineElementStyle style,
                                          float x, float y,
                                          float size_param1,
                                          float size_param2,
                                          TTF_Font* font);

// Create toggle
CrystallineToggle* crystalline_toggle_create(CrystallineElementStyle style,
                                              float x, float y,
                                              float size_param1,
                                              float size_param2,
                                              const char* label,
                                              TTF_Font* font);

// Create dropdown
CrystallineDropdown* crystalline_dropdown_create(CrystallineElementStyle style,
                                                  float x, float y,
                                                  float size_param1,
                                                  float size_param2,
                                                  TTF_Font* font);

/*
 * Element Destruction Functions
 */

void crystalline_button_destroy(CrystallineButton* button);
void crystalline_slider_destroy(CrystallineSlider* slider);
void crystalline_input_destroy(CrystallineInput* input);
void crystalline_progress_destroy(CrystallineProgress* progress);
void crystalline_panel_destroy(CrystallinePanel* panel);
void crystalline_list_destroy(CrystallineList* list);
void crystalline_toggle_destroy(CrystallineToggle* toggle);
void crystalline_dropdown_destroy(CrystallineDropdown* dropdown);

/*
 * Element Rendering Functions
 */

void crystalline_button_render(CrystallineButton* button, SDL_Renderer* renderer);
void crystalline_slider_render(CrystallineSlider* slider, SDL_Renderer* renderer);
void crystalline_input_render(CrystallineInput* input, SDL_Renderer* renderer);
void crystalline_progress_render(CrystallineProgress* progress, SDL_Renderer* renderer);
void crystalline_panel_render(CrystallinePanel* panel, SDL_Renderer* renderer);
void crystalline_list_render(CrystallineList* list, SDL_Renderer* renderer);
void crystalline_toggle_render(CrystallineToggle* toggle, SDL_Renderer* renderer);
void crystalline_dropdown_render(CrystallineDropdown* dropdown, SDL_Renderer* renderer);

/*
 * Element Update Functions (for animations)
 */

void crystalline_button_update(CrystallineButton* button, float delta_time);
void crystalline_slider_update(CrystallineSlider* slider, float delta_time);
void crystalline_input_update(CrystallineInput* input, float delta_time);
void crystalline_progress_update(CrystallineProgress* progress, float delta_time);
void crystalline_toggle_update(CrystallineToggle* toggle, float delta_time);
void crystalline_dropdown_update(CrystallineDropdown* dropdown, float delta_time);

/*
 * Element Event Handling Functions
 */

// Mouse events
bool crystalline_button_handle_mouse(CrystallineButton* button, SDL_Event* event);
bool crystalline_slider_handle_mouse(CrystallineSlider* slider, SDL_Event* event);
bool crystalline_input_handle_mouse(CrystallineInput* input, SDL_Event* event);
bool crystalline_list_handle_mouse(CrystallineList* list, SDL_Event* event);
bool crystalline_toggle_handle_mouse(CrystallineToggle* toggle, SDL_Event* event);
bool crystalline_dropdown_handle_mouse(CrystallineDropdown* dropdown, SDL_Event* event);

// Keyboard events
bool crystalline_input_handle_keyboard(CrystallineInput* input, SDL_Event* event);
bool crystalline_list_handle_keyboard(CrystallineList* list, SDL_Event* event);
bool crystalline_dropdown_handle_keyboard(CrystallineDropdown* dropdown, SDL_Event* event);

/*
 * Element Property Setters
 */

// Button
void crystalline_button_set_label(CrystallineButton* button, const char* label);
void crystalline_button_set_callback(CrystallineButton* button, 
                                     void (*callback)(void* data), void* data);

// Slider
void crystalline_slider_set_value(CrystallineSlider* slider, float value);
void crystalline_slider_set_range(CrystallineSlider* slider, float min, float max);
void crystalline_slider_set_callback(CrystallineSlider* slider,
                                     void (*callback)(float value, void* data), void* data);

// Input
void crystalline_input_set_text(CrystallineInput* input, const char* text);
void crystalline_input_set_placeholder(CrystallineInput* input, const char* placeholder);
void crystalline_input_set_password_mode(CrystallineInput* input, bool enabled);
void crystalline_input_set_callbacks(CrystallineInput* input,
                                     void (*on_change)(const char* text, void* data),
                                     void (*on_submit)(const char* text, void* data),
                                     void* data);

// Progress
void crystalline_progress_set_value(CrystallineProgress* progress, float value);
void crystalline_progress_set_label(CrystallineProgress* progress, const char* label);

// List
void crystalline_list_set_items(CrystallineList* list, char** items, int count);
void crystalline_list_add_item(CrystallineList* list, const char* item);
void crystalline_list_remove_item(CrystallineList* list, int index);
void crystalline_list_clear(CrystallineList* list);
void crystalline_list_set_selected(CrystallineList* list, int index);
void crystalline_list_set_callback(CrystallineList* list,
                                   void (*callback)(int index, void* data), void* data);
   
// List checkbox functions
void crystalline_list_enable_checkboxes(CrystallineList* list, float checkbox_size);
void crystalline_list_set_item_checked(CrystallineList* list, int index, bool checked);
bool crystalline_list_get_item_checked(CrystallineList* list, int index);
void crystalline_list_set_check_callback(CrystallineList* list,
                                         void (*callback)(int index, bool checked, void* data), void* data);

// Toggle
void crystalline_toggle_set_value(CrystallineToggle* toggle, bool value);
void crystalline_toggle_set_callback(CrystallineToggle* toggle,
                                     void (*callback)(bool value, void* data), void* data);

// Dropdown
void crystalline_dropdown_set_options(CrystallineDropdown* dropdown, char** options, int count);
void crystalline_dropdown_set_selected(CrystallineDropdown* dropdown, int index);
void crystalline_dropdown_set_callback(CrystallineDropdown* dropdown,
                                       void (*callback)(int index, void* data), void* data);

// TextArea - Scrollable multi-line text display for chat messages
typedef enum {
    CRYSTALLINE_MESSAGE_USER,
    CRYSTALLINE_MESSAGE_ASSISTANT,
    CRYSTALLINE_MESSAGE_SYSTEM
} CrystallineMessageType;

typedef struct CrystallineTextArea CrystallineTextArea;

CrystallineTextArea* crystalline_textarea_create(CrystallineElementStyle style,
                                                   float x, float y,
                                                   float width, float height,
                                                   TTF_Font* font);
void crystalline_textarea_destroy(CrystallineTextArea* area);
void crystalline_textarea_add_message(CrystallineTextArea* area,
                                      CrystallineMessageType type,
                                      const char* text,
                                      const char* timestamp);
void crystalline_textarea_clear(CrystallineTextArea* area);
void crystalline_textarea_scroll(CrystallineTextArea* area, float delta);
void crystalline_textarea_render(CrystallineTextArea* area, SDL_Renderer* renderer);
bool crystalline_textarea_handle_event(CrystallineTextArea* area, SDL_Event* event);

/*
 * Element Property Getters
 */

float crystalline_slider_get_value(CrystallineSlider* slider);
const char* crystalline_input_get_text(CrystallineInput* input);
float crystalline_progress_get_value(CrystallineProgress* progress);
int crystalline_list_get_selected(CrystallineList* list);
bool crystalline_toggle_get_value(CrystallineToggle* toggle);
int crystalline_dropdown_get_selected(CrystallineDropdown* dropdown);

/*
 * Element Style Functions
 */

// Change element style at runtime
void crystalline_button_set_style(CrystallineButton* button, CrystallineElementStyle style);
void crystalline_slider_set_style(CrystallineSlider* slider, CrystallineElementStyle style);
void crystalline_input_set_style(CrystallineInput* input, CrystallineElementStyle style);
void crystalline_progress_set_style(CrystallineProgress* progress, CrystallineElementStyle style);
void crystalline_panel_set_style(CrystallinePanel* panel, CrystallineElementStyle style);
void crystalline_list_set_style(CrystallineList* list, CrystallineElementStyle style);
void crystalline_toggle_set_style(CrystallineToggle* toggle, CrystallineElementStyle style);
void crystalline_dropdown_set_style(CrystallineDropdown* dropdown, CrystallineElementStyle style);

/*
 * Utility Functions
 */

// Check if point is inside element bounds
bool crystalline_element_contains_point(CrystallineElementBase* base, float x, float y);

// Set element state
void crystalline_element_set_state(CrystallineElementBase* base, CrystallineElementState state);

// Enable/disable element
void crystalline_element_set_enabled(CrystallineElementBase* base, bool enabled);

// Show/hide element
void crystalline_element_set_visible(CrystallineElementBase* base, bool visible);

// Set element colors
void crystalline_element_set_colors(CrystallineElementBase* base,
                                    SDL_Color normal,
                                    SDL_Color hover,
                                    SDL_Color active,
                                    SDL_Color disabled);

/*
 * Layout Helper Functions
 */

// Split a rectangle horizontally (left/right)
CrystallineRect crystalline_layout_split_horizontal(
    CrystallineRect parent, 
    float left_ratio,  // 0.0 to 1.0, ratio for left side
    float spacing      // spacing between left and right
);

// Split a rectangle vertically (top/bottom)
CrystallineRect crystalline_layout_split_vertical(
    CrystallineRect parent,
    float top_ratio,   // 0.0 to 1.0, ratio for top side
    float spacing      // spacing between top and bottom
);

// Get center point of a rectangle
CrystallinePoint crystalline_layout_center_in_rect(CrystallineRect rect);

// Calculate visualization area (accounting for metrics panel)
SDL_Rect crystalline_layout_viz_area(
    int panel_x, int panel_y,
    int panel_width, int panel_height,
    int metrics_width, int spacing
);

// Helper to convert TOP-LEFT coordinates to CENTER coordinates
CrystallinePoint crystalline_layout_topleft_to_center(
    float x, float y,
    float width, float height
);

#ifdef __cplusplus
}
#endif

#endif /* CRYSTALLINE_ELEMENTS_H */