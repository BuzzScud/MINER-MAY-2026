---
name: Dashboard cards and button sizing
overview: Standardize all five overview metric cards to the same dimensions and make the Emergency Logout button (and Admin Status card content) the most prominent by sizing the button larger than other UI buttons.
todos: []
isProject: false
---

# Dashboard card uniformity and Emergency Logout prominence

## Current behavior

- **Cards:** All five metrics use [templates/admin/dashboard.html](templates/admin/dashboard.html) with class `admin-metric-card` inside `.admin-metrics-grid` (5-column grid, `align-items: start`). Cards have no fixed height, so they grow with content — cards with subtext or the Admin Status action block end up taller and visually inconsistent.
- **Emergency Logout button:** Uses `btn-emergency btn-sm` in [templates/admin/dashboard.html](templates/admin/dashboard.html) (line 17). In [static/css/admin.css](static/css/admin.css), `.btn-sm` (lines 428–434) keeps it small; `.btn-emergency` (lines 279–289) sets full width and red styling.

## Goal

1. **Same-size boxes:** All five overview cards (Total Users, New Users, User Active Time, Peak User Time, Admin Status) share the same width and height.
2. **Biggest button:** The Admin Status card and the Emergency Logout button are the most prominent: the Emergency Logout button is the largest button among the dashboard metric cards (and clearly larger than other small buttons like Refresh / Test Connection).

## Implementation

### 1. Uniform card dimensions — [static/css/admin.css](static/css/admin.css)

- **Grid:** Change `.admin-metrics-grid` from `align-items: start` to `align-items: stretch` so all cards stretch to the same height in each row.
- **Cards:** On `.admin-metric-card` (when it’s a direct child of the metrics grid), set a **min-height** (e.g. `min-height: 140px` or `160px`) so that even cards with little content (e.g. “Total Users” / “New Users”) match the height of cards with subtext and the Admin Status block. Use a value that fits the Admin Status card content (label + “Active” + “Logged in” + divider + button) without clipping.
- **Scoping:** Apply the min-height only to the top-row metric cards so it doesn’t affect other uses of `.admin-metric-card` (e.g. Status tab, DB chart). Use a selector like `.admin-metrics-grid > .admin-metric-card { min-height: ... }`.

Result: All five boxes will have equal width (from the grid) and equal height (stretch + same min-height).

### 2. Emergency Logout as the “biggest button” — template + CSS

- **Template:** In [templates/admin/dashboard.html](templates/admin/dashboard.html), remove the `btn-sm` class from the Emergency Logout button (line 17), so it uses only `btn-emergency`. Optionally add a distinct class for the dashboard emergency button if you want to scope size only there (e.g. `btn-emergency-lg`).
- **CSS:** In [static/css/admin.css](static/css/admin.css), either:
  - **Option A:** Define a larger variant for the dashboard emergency button (e.g. `.admin-metric-card-action .btn-emergency` or `.btn-emergency-lg`) with bigger padding (e.g. `padding: 0.75rem 1.25rem` or `1rem 1.5rem`) and font-size (e.g. `1rem` or `1.05rem`) so it’s clearly the biggest button in that row, or
  - **Option B:** Keep the existing `.btn-emergency` as the default “large” style and ensure it’s not reduced by `.btn-sm` (already achieved by removing `btn-sm`), and optionally bump padding/font-size once so it’s more prominent than other `.btn-sm` buttons on the page.

Recommendation: Remove `btn-sm` and add a single rule for the emergency button in the metric card (e.g. `.admin-metric-card-action .btn-emergency`) with increased padding and font-size so “Admin status and emergency log out button” read as the biggest/most prominent control.

### 3. Optional: Admin Status content emphasis

- If “admin status” should also feel like the “biggest” visually, the Admin Status card already has the same size as the others; the main differentiator is the large Emergency Logout button. No structural change needed unless you later add a dedicated “Admin Status” primary button — then it could share the same larger button style.

## Files to touch


| File                                                             | Changes                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [static/css/admin.css](static/css/admin.css)                     | `.admin-metrics-grid` use `align-items: stretch`. Add `.admin-metrics-grid > .admin-metric-card { min-height: ... }`. Add or adjust `.admin-metric-card-action .btn-emergency` (or `.btn-emergency-lg`) for larger padding and font-size. |
| [templates/admin/dashboard.html](templates/admin/dashboard.html) | Remove `btn-sm` from the Emergency Logout button (line 17).                                                                                                                                                                               |


## Testing

- Load the admin dashboard and confirm all five overview cards have the same width and height.
- Confirm the Emergency Logout button is visibly larger than the Refresh / Test Connection buttons in the Status tab.
- Check at 1024px and 640px breakpoints that the grid still stacks correctly and card sizing remains consistent.

