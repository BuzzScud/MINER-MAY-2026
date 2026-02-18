"""Settings panel - config display and connection integration."""

from flask import current_app, render_template

from admin.panels import Panel, register_panel

INTEGRATION_CODE = """# Add to your main Flask app (e.g., app.py or main.py)

from admin import create_admin_blueprint, register_panel

# Create admin blueprint (pass your db, User model, and CSRF helpers)
admin_bp = create_admin_blueprint(db, User, get_csrf_token, validate_csrf)
app.register_blueprint(admin_bp)

# Optional: add custom panels
# from admin import Panel
# def my_custom_view():
#     return render_template("admin/custom.html")
# register_panel(Panel(id="reports", name="Reports", route="/reports", view_func=my_custom_view, order=30))
"""


def create_settings_panel():
    """Create and register the settings panel with tabs."""

    def view():
        db_uri = current_app.config.get("SQLALCHEMY_DATABASE_URI", "")
        if "sqlite" in db_uri.lower():
            db_type = "SQLite"
        elif "postgresql" in db_uri.lower():
            db_type = "PostgreSQL"
        else:
            db_type = "Unknown"
        config_items = [
            {"label": "Database", "value": db_type},
            {"label": "Debug Mode", "value": "On" if current_app.debug else "Off"},
        ]
        return render_template(
            "admin/settings.html",
            config_items=config_items,
            integration_code=INTEGRATION_CODE,
        )

    panel = Panel(
        id="settings",
        name="Settings",
        route="/settings",
        view_func=view,
        icon="",
        order=20,
    )
    register_panel(panel)
    return panel
