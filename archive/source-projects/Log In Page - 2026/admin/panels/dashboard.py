"""Dashboard overview panel with metrics and settings."""

import os
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from flask import current_app, render_template
from sqlalchemy import text

from admin.panels import Panel, register_panel
from admin.utils import get_new_users_count, get_peak_user_time, get_user_active_time

DEGRADED_LATENCY_MS = 500

EST = ZoneInfo("America/New_York")

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


def create_dashboard_panel(user_model, activity_model=None):
    """Create and register the dashboard panel with combined metrics and settings."""

    def view():
        admin_status_indicator = "inactive"
        try:
            db = current_app.extensions.get("sqlalchemy")
            if db is not None:
                start = time.perf_counter()
                db.session.execute(text("SELECT 1"))
                db.session.commit()
                elapsed_ms = (time.perf_counter() - start) * 1000
                admin_status_indicator = "degraded" if elapsed_ms > DEGRADED_LATENCY_MS else "active"
        except Exception:
            try:
                db = current_app.extensions.get("sqlalchemy")
                if db is not None:
                    db.session.rollback()
            except Exception:
                pass
            admin_status_indicator = "inactive"

        total_users = user_model.query.count()
        new_users_7d = get_new_users_count(user_model, days=7)
        user_active_time = get_user_active_time(activity_model) if activity_model else "—"
        peak_user_time = get_peak_user_time(activity_model) if activity_model else "—"
        metrics = [
            {
                "combined": True,
                "datetime_in_right_box": True,
                "metrics": [
                    {"label": "Total Users", "value": total_users},
                    {"label": "New Users (7 days)", "value": new_users_7d},
                    {"label": "Current Date", "value": datetime.now(EST).strftime("%b %d, %Y"), "key": "current_date"},
                    {"label": "Current Time", "value": datetime.now(EST).strftime("%I:%M:%S %p EST"), "key": "current_time"},
                ],
            },
            {
                "combined": True,
                "metrics": [
                    {"label": "User Active Time", "value": user_active_time, "subtext": "Total time across all users"},
                    {"label": "Peak User Time", "value": peak_user_time, "subtext": "Most active hour (EST)"},
                ],
            },
            {"label": "Admin Status", "value": "Active", "subtext": "Logged in"},
        ]
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
        show_system_status_modal = False
        flag_path = os.path.join(current_app.instance_path, ".show_system_status_modal")
        if os.path.isfile(flag_path):
            try:
                show_system_status_modal = True
                os.remove(flag_path)
            except OSError:
                pass
        return render_template(
            "admin/dashboard.html",
            metrics=metrics,
            config_items=config_items,
            integration_code=INTEGRATION_CODE,
            show_system_status_modal=show_system_status_modal,
            admin_status_indicator=admin_status_indicator,
        )

    panel = Panel(
        id="index",
        name="Dashboard",
        route="/",
        view_func=view,
        icon="",
        order=0,
    )
    register_panel(panel)
    return panel
