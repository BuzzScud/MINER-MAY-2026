---
name: Emergency Restart and system status modal
overview: Add a yellow "Emergency Restart" button under Emergency Logout; implement an API that logs everyone out, clears admin session, and optionally exits the process for a real restart; after admin logs back in, show a one-time system status modal with DB and app health.
todos: []
isProject: false
---

# Emergency Restart and post-login system status modal

## Scope

- Add **Emergency Restart** button (yellow) below Emergency Logout in the Admin Status card.
- **Emergency Restart** flow: confirm → call API → API performs emergency logout (bump generation), clears admin session, sets a persistent “show status modal” flag, then returns; client redirects to login; optionally the server process exits so a process manager can restart it.
- After admin logs in and lands on the dashboard, if the flag is set, show a **system status modal** (DB connection, latency, debug mode, etc.) and clear the flag.

## 1. UI: Emergency Restart button and confirm modal

**Files:** [templates/admin/dashboard.html](templates/admin/dashboard.html), [static/css/admin.css](static/css/admin.css)

- In the Admin Status card, inside `.admin-metric-card-action`, add a second button below the existing Emergency Logout button:
  - Markup: `<button type="button" id="emergencyRestartBtn" class="btn-emergency-restart">Emergency Restart</button>`
- Add CSS class `.btn-emergency-restart` in [static/css/admin.css](static/css/admin.css): yellow/amber styling (e.g. background/border similar to `.btn-emergency` but with a yellow/amber color like `#eab308` or `#f59e0b`), same structure as the emergency button (full width, padding, etc.).
- Add a second modal `#emergencyRestartModal` (same structure as Emergency Logout modal): title “Emergency Restart”, body text explaining that this will log everyone out and restart the app and that the admin will need to log back in; buttons “Yes” and “No”. Include a loading state div for “Restarting…” (spinner + text) to show after confirm until redirect.

## 2. Backend: Emergency Restart API and “show status” flag

**Persistent flag:** Use a **file-based flag** in the Flask instance folder so no DB migration is required and the flag survives a real process restart. File path: `os.path.join(current_app.instance_path, ".show_system_status_modal")`. When the Emergency Restart API runs, create this file (e.g. write `"1"`). When the dashboard view runs for an admin, check for the file; if present, pass `show_system_status_modal=True` to the template and delete the file.

**New view in** [admin/**init**.py](admin/__init__.py):

- Implement `_emergency_restart_view(db, emergency_model, validate_csrf)` that:
  1. Validates CSRF (same pattern as `_emergency_logout_view`).
  2. Performs **emergency logout**: get or create `emergency_model.query.get(1)`, increment `generation`, commit (same logic as existing emergency logout).
  3. Sets the **persistent flag**: ensure `current_app.instance_path` exists, then open and write the flag file (e.g. `".show_system_status_modal"`) in that directory.
  4. **Clears the current (admin) session**: `session.clear()` so the admin is logged out.
  5. Returns JSON: `{ "ok": true, "redirect": "/login" }` (login URL from the main app; use `url_for("login")` if available in blueprint context, or hardcode `"/login"` to avoid cross-blueprint dependency).
  6. **Optional process exit (configurable):** If an env var or config like `ENABLE_EMERGENCY_RESTART_EXIT` is set (or a sensible default for production), start a **daemon thread** that sleeps 2 seconds then calls `os._exit(0)` so the process exits after the response is sent; when run under a process manager (systemd, supervisor, or a wrapper script), the app will restart. If not set, only the “soft” restart (logout + redirect) happens. Document this in the plan and in code comments.

**Blueprint registration:** In `create_admin_blueprint`, add a new route, e.g. `POST /api/emergency-restart`, registered with `_emergency_restart_view(db, emergency_model, validate_csrf)` and the same `admin_required` wrapper.

## 3. Dashboard view: pass “show status modal” to template

**File:** [admin/panels/dashboard.py](admin/panels/dashboard.py)

- In the dashboard `view()` (before `render_template`), check for the flag file in `current_app.instance_path` (e.g. path `.show_system_status_modal`). If the file exists:
  - Pass `show_system_status_modal=True` into `render_template`.
  - Delete the flag file so the modal is shown only once.
- If the file does not exist, pass `show_system_status_modal=False` (or omit; template will treat as falsy).

## 4. System status modal (markup and behavior)

**File:** [templates/admin/dashboard.html](templates/admin/dashboard.html)

- Add a new modal `#systemStatusModal` (same structure as existing modals): header “System Status Report”, close button, and a body section that will be filled with status (e.g. database connection, latency, total users, debug mode, “Everything running correctly” or error messages). Include a “Close” button in the footer.
- On **page load**, if the template variable `show_system_status_modal` is True, open this modal and **fetch** system status from the existing DB test API (`url_for("admin.db_test")` or the same URL used by the Status tab). Use the same JSON shape the dashboard already uses: `connected`, `latency_ms`, `database_type`, `total_users`, `error`, etc. Populate the modal body with:
  - Database: Connected / Not connected; if connected, show latency and database type; if error, show the error message.
  - Optional: total users, pool info if present.
  - A single line like “All systems operational” when `connected === true`, or “Issues detected” and details when not.
- Ensure the modal can be closed (backdrop, X, Close button) and does not auto-open again on refresh unless the flag was set (already handled by deleting the file).

## 5. Client-side: Emergency Restart button and redirect

**File:** [templates/admin/dashboard.html](templates/admin/dashboard.html) (inline script)

- Add JS for the Emergency Restart button:
  - Click opens `#emergencyRestartModal` (same open/close pattern as Emergency Logout modal).
  - On “Yes” in the modal: show loading state (“Restarting…”), disable buttons, then `POST` to the new emergency-restart API with `csrf_token` in the body (same as emergency logout). On success (200 and `response.ok === true`): set `window.location = response.redirect` (e.g. `"/login"`) so the browser navigates to login. On error: hide loading state, re-enable buttons, show a toast or message that the request failed.
- Ensure CSRF token is sent in the request body (form or JSON) as in the existing emergency logout call.

## 6. Testing

- **Manual test – soft restart (no exit):** With `ENABLE_EMERGENCY_RESTART_EXIT` unset (or False), click Emergency Restart, confirm, verify redirect to login, log in as admin, verify dashboard loads and the system status modal appears once with correct DB/status info; verify modal does not appear on next dashboard load.
- **Manual test – button and modal:** Verify Emergency Restart button is yellow and below Emergency Logout; confirm modal text and Yes/No behavior; verify Emergency Logout still works.
- **Optional – hard restart:** If possible, run the app under a simple restarter (e.g. `while true; do python app.py; done`) and set the exit option; trigger Emergency Restart and confirm the process restarts and that after login the status modal appears.

## 7. Files to touch (summary)


| File                                                             | Changes                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [templates/admin/dashboard.html](templates/admin/dashboard.html) | Add Emergency Restart button; Emergency Restart modal; System Status modal; JS for both modals and API call; on load open system status modal when `show_system_status_modal` is True and fetch db_test. |
| [static/css/admin.css](static/css/admin.css)                     | Add `.btn-emergency-restart` (yellow/amber).                                                                                                                                                             |
| [admin/**init**.py](admin/__init__.py)                           | Add `_emergency_restart_view`; register `POST /api/emergency-restart`; optional `os._exit(0)` in a daemon thread when configured.                                                                        |
| [admin/panels/dashboard.py](admin/panels/dashboard.py)           | Check instance path flag file; pass `show_system_status_modal` and delete file if set.                                                                                                                   |


## 8. Security and edge cases

- Emergency Restart API must be protected by `admin_required` and CSRF so only the logged-in admin can call it.
- Ensure `instance_path` exists before writing the flag file (e.g. `os.makedirs(current_app.instance_path, exist_ok=True)`).
- If the dashboard is loaded by a non-admin (e.g. direct URL), do not delete the flag file; only delete when the dashboard view is actually rendering for the admin (the dashboard is already admin-only, so this is inherent).

## 9. Optional process exit (implementation detail)

- Use a module-level or closure variable to avoid restarting multiple times in one request. In the view, after committing and writing the flag and clearing session, start a thread: `def _exit_later(): time.sleep(2); os._exit(0)`. Start it as a daemon thread only if `current_app.config.get("ENABLE_EMERGENCY_RESTART_EXIT", False)` is True. This keeps default behavior safe (no exit) and allows production to enable real restarts when run under a process manager.

