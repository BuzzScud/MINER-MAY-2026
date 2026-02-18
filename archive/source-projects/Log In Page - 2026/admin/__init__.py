"""Admin blueprint factory for modular admin portal."""

import os
import threading
import time
from glob import glob

from flask import Blueprint, jsonify, current_app, request, session
from sqlalchemy import text

SHOW_SYSTEM_STATUS_MODAL_FILENAME = ".show_system_status_modal"

from admin.decorators import admin_required
from admin.panels import ADMIN_PANELS, Panel, register_panel

__all__ = ["create_admin_blueprint", "register_panel", "Panel", "ADMIN_PANELS"]


_network_request_count = 0


def _db_test_view(db, user_model):
    """Test database connection and return JSON with connected status and latency."""

    def view():
        global _network_request_count
        _network_request_count += 1
        db_uri = current_app.config.get("SQLALCHEMY_DATABASE_URI", "")
        if "sqlite" in db_uri.lower():
            db_type = "SQLite"
        elif "postgresql" in db_uri.lower():
            db_type = "PostgreSQL"
        else:
            db_type = "Unknown"
        total_users = None
        pool_size = None
        pool_checkedout = None
        try:
            start = time.perf_counter()
            db.session.execute(text("SELECT 1"))
            db.session.commit()
            elapsed_ms = (time.perf_counter() - start) * 1000
            try:
                total_users = user_model.query.count()
            except Exception:
                pass
            try:
                pool = db.engine.pool
                pool_size = getattr(pool, "size", lambda: None)()
                pool_checkedout = getattr(pool, "checkedout", lambda: None)()
            except Exception:
                pass
            return jsonify(
                connected=True,
                latency_ms=round(elapsed_ms, 2),
                error=None,
                database_type=db_type,
                request_count=_network_request_count,
                total_users=total_users,
                pool_size=pool_size,
                pool_checkedout=pool_checkedout,
            )
        except Exception as e:
            db.session.rollback()
            return jsonify(
                connected=False,
                latency_ms=None,
                error=str(e),
                database_type=db_type,
                request_count=_network_request_count,
                total_users=total_users,
                pool_size=pool_size,
                pool_checkedout=pool_checkedout,
            )

    return view


def _activity_clear_view(db, activity_model, validate_csrf):
    """Clear all activity log entries. Requires CSRF token in form or JSON."""

    def view():
        token = request.form.get("csrf_token") or (request.get_json(silent=True) or {}).get("csrf_token")
        if not validate_csrf(token):
            return jsonify({"ok": False, "error": "Invalid CSRF token"}), 403
        try:
            activity_model.query.delete()
            db.session.commit()
            return jsonify({"ok": True})
        except Exception as e:
            db.session.rollback()
            return jsonify({"ok": False, "error": str(e)}), 500

    return view


def _emergency_logout_view(db, emergency_model, validate_csrf):
    """Increment emergency logout generation to invalidate all non-admin sessions."""

    def view():
        token = request.form.get("csrf_token") or (request.get_json(silent=True) or {}).get("csrf_token")
        if not validate_csrf(token):
            return jsonify({"ok": False, "error": "Invalid CSRF token"}), 403
        try:
            row = emergency_model.query.get(1)
            if row is None:
                row = emergency_model(id=1, generation=0)
                db.session.add(row)
            row.generation = (row.generation or 0) + 1
            db.session.commit()
            return jsonify({"ok": True})
        except Exception as e:
            db.session.rollback()
            return jsonify({"ok": False, "error": str(e)}), 500

    return view


def _emergency_restart_view(db, emergency_model, validate_csrf):
    """Log everyone out, set flag for system status modal, clear admin session, return redirect. Optional process exit if configured."""

    def view():
        token = request.form.get("csrf_token") or (request.get_json(silent=True) or {}).get("csrf_token")
        if not validate_csrf(token):
            return jsonify({"ok": False, "error": "Invalid CSRF token"}), 403
        try:
            row = emergency_model.query.get(1)
            if row is None:
                row = emergency_model(id=1, generation=0)
                db.session.add(row)
            row.generation = (row.generation or 0) + 1
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({"ok": False, "error": str(e)}), 500

        instance_path = current_app.instance_path
        try:
            os.makedirs(instance_path, exist_ok=True)
            flag_path = os.path.join(instance_path, SHOW_SYSTEM_STATUS_MODAL_FILENAME)
            with open(flag_path, "w", encoding="utf-8") as f:
                f.write("1")
        except Exception as e:
            return jsonify({"ok": False, "error": "Failed to set status modal flag: " + str(e)}), 500

        session.clear()

        if current_app.config.get("ENABLE_EMERGENCY_RESTART_EXIT", False):
            def _exit_later():
                time.sleep(2)
                os._exit(0)
            t = threading.Thread(target=_exit_later, daemon=True)
            t.start()

        return jsonify({"ok": True, "redirect": "/login"})

    return view


def _build_plans_list_view():
    """Return JSON list of Cursor plan files (.plan.md) in .cursor/plans."""

    def view():
        try:
            plans_dir = os.path.join(current_app.root_path, ".cursor", "plans")
            if not os.path.isdir(plans_dir):
                return jsonify({"files": []})
            pattern = os.path.join(plans_dir, "*.plan.md")
            paths = glob(pattern)
            files = []
            for p in sorted(paths):
                name = os.path.basename(p)
                mtime = os.path.getmtime(p) if os.path.exists(p) else 0
                files.append({"name": name, "path": p, "modified": mtime})
            return jsonify({"files": files})
        except Exception as e:
            return jsonify({"files": [], "error": str(e)})

    return view


def _build_plan_content_view():
    """Return content of a plan file. Query param: file (basename, must end with .plan.md)."""

    def view():
        filename = request.args.get("file", "").strip()
        if not filename.endswith(".plan.md"):
            return jsonify({"error": "Invalid filename"}), 400
        if "/" in filename or "\\" in filename or filename.startswith("."):
            return jsonify({"error": "Invalid filename"}), 400
        try:
            plans_dir = os.path.join(current_app.root_path, ".cursor", "plans")
            filepath = os.path.join(plans_dir, filename)
            if not os.path.abspath(filepath).startswith(os.path.abspath(plans_dir)):
                return jsonify({"error": "Invalid path"}), 400
            if not os.path.isfile(filepath):
                return jsonify({"error": "File not found"}), 404
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            return jsonify({"content": content})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return view


def _activity_api_view(activity_model):
    """Return JSON list of recent user activity."""

    def view():
        activities = (
            activity_model.query.order_by(activity_model.timestamp.desc())
            .limit(100)
            .all()
        )
        return jsonify(
            [
                {
                    "id": a.id,
                    "user_id": a.user_id,
                    "username": a.username,
                    "route": a.route,
                    "method": a.method,
                    "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                    "ip_address": a.ip_address,
                }
                for a in activities
            ]
        )

    return view


def create_admin_blueprint(
    db, user_model, get_csrf_token, validate_csrf, activity_model=None, emergency_model=None
):
    """Create the admin blueprint with dashboard, users, and activity panels."""

    from admin.panels import activity as activity_module
    from admin.panels import dashboard as dashboard_module
    from admin.panels import users as users_module

    bp = Blueprint("admin", __name__, url_prefix="/admin")

    from datetime import timezone
    from zoneinfo import ZoneInfo
    _EST = ZoneInfo("America/New_York")

    @bp.app_template_filter("est_datetime")
    def est_datetime_filter(dt):
        if dt is None:
            return "-"
        if getattr(dt, "tzinfo", None) is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(_EST).strftime("%Y-%m-%d %I:%M %p EST")

    dashboard_module.create_dashboard_panel(user_model, activity_model)
    _, add_user_view, edit_user_view, delete_user_view, permissions_view = users_module.create_users_panel(
        db, user_model, validate_csrf
    )
    activity_module.create_activity_panel()

    index_panel = next(p for p in ADMIN_PANELS if p.id == "index")
    bp.add_url_rule("/", view_func=admin_required(index_panel.view_func), endpoint="index")
    users_panel = next(p for p in ADMIN_PANELS if p.id == "users")
    bp.add_url_rule(
        "/users",
        view_func=admin_required(users_panel.view_func),
        endpoint="users",
        methods=["GET"],
    )
    bp.add_url_rule(
        "/users/add",
        view_func=admin_required(add_user_view),
        endpoint="users_add",
        methods=["GET", "POST"],
    )
    bp.add_url_rule(
        "/users/<int:user_id>/edit",
        view_func=admin_required(edit_user_view),
        endpoint="users_edit",
        methods=["POST"],
    )
    bp.add_url_rule(
        "/users/<int:user_id>/delete",
        view_func=admin_required(delete_user_view),
        endpoint="users_delete",
        methods=["POST"],
    )
    bp.add_url_rule(
        "/users/<int:user_id>/permissions",
        view_func=admin_required(permissions_view),
        endpoint="users_permissions",
        methods=["POST"],
    )
    bp.add_url_rule(
        "/api/db-test",
        view_func=admin_required(_db_test_view(db, user_model)),
        endpoint="db_test",
        methods=["GET"],
    )
    if activity_model is not None:
        bp.add_url_rule(
            "/api/activity",
            view_func=admin_required(_activity_api_view(activity_model)),
            endpoint="activity_api",
            methods=["GET"],
        )
        bp.add_url_rule(
            "/api/activity/clear",
            view_func=admin_required(_activity_clear_view(db, activity_model, validate_csrf)),
            endpoint="activity_clear_api",
            methods=["POST"],
        )
    if emergency_model is not None:
        bp.add_url_rule(
            "/api/emergency-logout",
            view_func=admin_required(_emergency_logout_view(db, emergency_model, validate_csrf)),
            endpoint="emergency_logout_api",
            methods=["POST"],
        )
        bp.add_url_rule(
            "/api/emergency-restart",
            view_func=admin_required(_emergency_restart_view(db, emergency_model, validate_csrf)),
            endpoint="emergency_restart_api",
            methods=["POST"],
        )
    bp.add_url_rule(
        "/api/build-plans",
        view_func=admin_required(_build_plans_list_view()),
        endpoint="build_plans_api",
        methods=["GET"],
    )
    bp.add_url_rule(
        "/api/build-plans/content",
        view_func=admin_required(_build_plan_content_view()),
        endpoint="build_plan_content_api",
        methods=["GET"],
    )
    for panel in ADMIN_PANELS:
        if panel.id not in ("index", "users"):
            bp.add_url_rule(
                panel.route,
                view_func=admin_required(panel.view_func),
                endpoint=panel.id,
            )

    @bp.context_processor
    def admin_context():
        return {"admin_panels": ADMIN_PANELS}

    return bp
