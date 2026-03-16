#include "elements.h"
#include "draw.h"
#include "color.h"
#include <stdlib.h>
#include <string.h>

#define MESSAGE_SPACING 10.0f
#define MESSAGE_PADDING 8.0f
#define SCROLL_SPEED 30.0f

typedef struct {
    CrystallineMessageType type;
    char* text;
    char* timestamp;
    int height;
} Message;

struct CrystallineTextArea {
    CrystallineElementBase base;
    
    Message* messages;
    int message_count;
    int message_capacity;
    
    float scroll_offset;
    float scroll_max;
    bool auto_scroll;
    
    float width;
    float height;
    
    TTF_Font* font;
    SDL_Color user_color;
    SDL_Color assistant_color;
    SDL_Color system_color;
};

static void calculate_message_heights(CrystallineTextArea* area) {
    if (!area || !area->font) return;
    
    int content_width = (int)(area->width - MESSAGE_PADDING * 4);
    
    for (int i = 0; i < area->message_count; i++) {
        Message* msg = &area->messages[i];
        
        int text_len = strlen(msg->text);
        int chars_per_line = content_width / 7;
        int num_lines = (text_len + chars_per_line - 1) / chars_per_line;
        if (num_lines < 1) num_lines = 1;
        
        int line_height = 16;
        msg->height = num_lines * line_height + MESSAGE_PADDING * 2;
        
        if (msg->timestamp) {
            msg->height += 14;
        }
    }
}

static void update_scroll_max(CrystallineTextArea* area) {
    if (!area) return;
    
    float total_height = 0.0f;
    for (int i = 0; i < area->message_count; i++) {
        total_height += area->messages[i].height + MESSAGE_SPACING;
    }
    
    float visible_height = area->height;
    area->scroll_max = (total_height > visible_height) ? (total_height - visible_height) : 0.0f;
}

CrystallineTextArea* crystalline_textarea_create(CrystallineElementStyle style,
                                                   float x, float y,
                                                   float width, float height,
                                                   TTF_Font* font) {
    CrystallineTextArea* area = calloc(1, sizeof(CrystallineTextArea));
    if (!area) return NULL;
    
    area->base.style = style;
    area->base.position.x = x;
    area->base.position.y = y;
    area->base.position.cart_valid = true;
    area->base.position.polar_valid = false;
    area->base.bounds.center = area->base.position;
    area->base.bounds.width = width;
    area->base.bounds.height = height;
    area->base.state = CRYSTALLINE_STATE_NORMAL;
    area->base.visible = true;
    area->base.enabled = true;
    
    area->width = width;
    area->height = height;
    
    area->message_capacity = 100;
    area->messages = calloc(area->message_capacity, sizeof(Message));
    if (!area->messages) {
        free(area);
        return NULL;
    }
    
    area->message_count = 0;
    area->scroll_offset = 0.0f;
    area->scroll_max = 0.0f;
    area->auto_scroll = true;
    area->font = font;
    
    area->user_color = (SDL_Color){100, 150, 255, 255};
    area->assistant_color = (SDL_Color){150, 255, 150, 255};
    area->system_color = (SDL_Color){200, 200, 100, 255};
    
    return area;
}

void crystalline_textarea_destroy(CrystallineTextArea* area) {
    if (!area) return;
    
    for (int i = 0; i < area->message_count; i++) {
        if (area->messages[i].text) free(area->messages[i].text);
        if (area->messages[i].timestamp) free(area->messages[i].timestamp);
    }
    
    if (area->messages) free(area->messages);
    free(area);
}

void crystalline_textarea_add_message(CrystallineTextArea* area,
                                      CrystallineMessageType type,
                                      const char* text,
                                      const char* timestamp) {
    if (!area || !text) return;
    
    if (area->message_count >= area->message_capacity) {
        int new_capacity = area->message_capacity * 2;
        Message* new_messages = realloc(area->messages, new_capacity * sizeof(Message));
        if (!new_messages) return;
        
        area->messages = new_messages;
        area->message_capacity = new_capacity;
    }
    
    Message* msg = &area->messages[area->message_count];
    msg->type = type;
    msg->text = strdup(text);
    msg->timestamp = timestamp ? strdup(timestamp) : NULL;
    msg->height = 0;
    
    area->message_count++;
    
    calculate_message_heights(area);
    update_scroll_max(area);
    
    if (area->auto_scroll) {
        area->scroll_offset = area->scroll_max;
    }
}

void crystalline_textarea_clear(CrystallineTextArea* area) {
    if (!area) return;
    
    for (int i = 0; i < area->message_count; i++) {
        if (area->messages[i].text) free(area->messages[i].text);
        if (area->messages[i].timestamp) free(area->messages[i].timestamp);
    }
    
    area->message_count = 0;
    area->scroll_offset = 0.0f;
    area->scroll_max = 0.0f;
}

void crystalline_textarea_scroll(CrystallineTextArea* area, float delta) {
    if (!area) return;
    
    area->scroll_offset += delta;
    
    if (area->scroll_offset < 0.0f) {
        area->scroll_offset = 0.0f;
    }
    if (area->scroll_offset > area->scroll_max) {
        area->scroll_offset = area->scroll_max;
    }
}

void crystalline_textarea_render(CrystallineTextArea* area, SDL_Renderer* renderer) {
    if (!area || !renderer || !area->base.visible) return;
    
    int center_x = (int)area->base.position.x;
    int center_y = (int)area->base.position.y;
    int width = (int)area->width;
    int height = (int)area->height;
    
    // Convert CENTER coordinates to TOP-LEFT for SDL_Rect
    int x = center_x - width / 2;
    int y = center_y - height / 2;
    
    SDL_Rect rect = {x, y, width, height};
    
    // Draw background
    SDL_SetRenderDrawColor(renderer, 25, 25, 35, 255);
    SDL_RenderFillRect(renderer, &rect);
    
    // Draw border
    SDL_SetRenderDrawColor(renderer, 60, 60, 70, 255);
    SDL_RenderDrawRect(renderer, &rect);
    
    if (!area->font || area->message_count == 0) return;
    
    // Set clipping region
    SDL_Rect clip_rect = {x + 5, y + 5, width - 10, height - 10};
    SDL_RenderSetClipRect(renderer, &clip_rect);
    
    // Render messages from bottom to top
    int msg_y = y + height - 5 - (int)area->scroll_offset;
    
    for (int i = area->message_count - 1; i >= 0; i--) {
        Message* msg = &area->messages[i];
        
        msg_y -= msg->height;
        
        if (msg_y + msg->height < clip_rect.y) break;
        if (msg_y > clip_rect.y + clip_rect.h) continue;
        
        SDL_Color msg_color;
        switch (msg->type) {
            case CRYSTALLINE_MESSAGE_USER:
                msg_color = area->user_color;
                break;
            case CRYSTALLINE_MESSAGE_ASSISTANT:
                msg_color = area->assistant_color;
                break;
            case CRYSTALLINE_MESSAGE_SYSTEM:
                msg_color = area->system_color;
                break;
            default:
                msg_color = area->user_color;
        }
        
        // Draw message bubble background
        SDL_Rect bubble_rect = {
            x + 10,
            msg_y,
            width - 20,
            msg->height
        };
        
        SDL_SetRenderDrawColor(renderer, msg_color.r / 3, msg_color.g / 3, msg_color.b / 3, 100);
        SDL_RenderFillRect(renderer, &bubble_rect);
        
        // Draw message text
        extern void draw_text(SDL_Renderer* renderer, const char* text, int x, int y, SDL_Color color);
        draw_text(renderer, msg->text, bubble_rect.x + 8, bubble_rect.y + 8, msg_color);
        
        // Draw timestamp if present
        if (msg->timestamp) {
            SDL_Color timestamp_color = {150, 150, 150, 255};
            draw_text(renderer, msg->timestamp, 
                     bubble_rect.x + bubble_rect.w - 60, 
                     bubble_rect.y + bubble_rect.h - 14, 
                     timestamp_color);
        }
        
        msg_y -= (int)MESSAGE_SPACING;
    }
    
    SDL_RenderSetClipRect(renderer, NULL);
}

bool crystalline_textarea_handle_event(CrystallineTextArea* area, SDL_Event* event) {
    if (!area || !event || !area->base.enabled) return false;
    
    if (event->type == SDL_MOUSEWHEEL) {
        int mouse_x, mouse_y;
        SDL_GetMouseState(&mouse_x, &mouse_y);
        
        int x = (int)area->base.position.x;
        int y = (int)area->base.position.y;
        int width = (int)area->width;
        int height = (int)area->height;
        
        if (mouse_x >= x && mouse_x < x + width &&
            mouse_y >= y && mouse_y < y + height) {
            
            float delta = -event->wheel.y * SCROLL_SPEED;
            crystalline_textarea_scroll(area, delta);
            return true;
        }
    }
    
    return false;
}