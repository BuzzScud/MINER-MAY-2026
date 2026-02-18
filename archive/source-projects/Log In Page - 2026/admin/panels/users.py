"""User management panel."""

from flask import flash, redirect, render_template, request, url_for

from admin.panels import Panel, register_panel

USERS_PER_PAGE = 10
ADMIN_USERNAME = "admin"


def create_users_panel(db, user_model, validate_csrf):
    """Create and register the users panel. Returns (panel, add_view, edit_view, delete_view)."""

    def view():
        page = request.args.get("page", 1, type=int)
        show_add = request.args.get("show_add") == "1"
        pagination = user_model.query.order_by(user_model.created_at.desc()).paginate(
            page=page, per_page=USERS_PER_PAGE
        )
        return render_template(
            "admin/users.html",
            users=pagination.items,
            pagination=pagination,
            admin_username=ADMIN_USERNAME,
            show_add_modal=show_add,
        )

    def add_user():
        if request.method == "GET":
            return redirect(url_for("admin.users"))
        if not validate_csrf(request.form.get("csrf_token")):
            flash("Invalid request. Please try again.", "error")
            return redirect(url_for("admin.users", show_add=1))
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if not username or not password:
            flash("Username and password are required.", "error")
            return redirect(url_for("admin.users", show_add=1))
        if len(username) < 3:
            flash("Username must be at least 3 characters.", "error")
            return redirect(url_for("admin.users", show_add=1))
        if len(password) < 6:
            flash("Password must be at least 6 characters.", "error")
            return redirect(url_for("admin.users", show_add=1))
        try:
            existing = user_model.query.filter_by(username=username).first()
            if existing:
                flash("Username already exists.", "error")
                return redirect(url_for("admin.users", show_add=1))
            user = user_model(
                username=username,
                password_hash=user_model.generate_password_hash(password),
            )
            db.session.add(user)
            db.session.commit()
            flash("User created successfully.", "success")
            return redirect(url_for("admin.users"))
        except Exception:
            db.session.rollback()
            flash("Database error. Please try again later.", "error")
            return redirect(url_for("admin.users", show_add=1))

    def edit_user(user_id):
        if not validate_csrf(request.form.get("csrf_token")):
            flash("Invalid request. Please try again.", "error")
            return redirect(url_for("admin.users"))
        user = user_model.query.get_or_404(user_id)
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if not username:
            flash("Username is required.", "error")
            return redirect(url_for("admin.users"))
        if len(username) < 3:
            flash("Username must be at least 3 characters.", "error")
            return redirect(url_for("admin.users"))
        if password and len(password) < 6:
            flash("Password must be at least 6 characters if provided.", "error")
            return redirect(url_for("admin.users"))
        try:
            if username != user.username:
                existing = user_model.query.filter_by(username=username).first()
                if existing:
                    flash("Username already exists.", "error")
                    return redirect(url_for("admin.users"))
                user.username = username
            if password:
                user.password_hash = user_model.generate_password_hash(password)
            db.session.commit()
            flash("User updated successfully.", "success")
        except Exception:
            db.session.rollback()
            flash("Database error. Please try again later.", "error")
        return redirect(url_for("admin.users"))

    def delete_user(user_id):
        if not validate_csrf(request.form.get("csrf_token")):
            flash("Invalid request. Please try again.", "error")
            return redirect(url_for("admin.users"))
        user = user_model.query.get_or_404(user_id)
        if user.username == ADMIN_USERNAME:
            flash("Cannot delete the admin user.", "error")
            return redirect(url_for("admin.users"))
        try:
            db.session.delete(user)
            db.session.commit()
            flash("User deleted successfully.", "success")
        except Exception:
            db.session.rollback()
            flash("Database error. Please try again later.", "error")
        return redirect(url_for("admin.users"))

    def permissions(user_id):
        if not validate_csrf(request.form.get("csrf_token")):
            flash("Invalid request. Please try again.", "error")
            return redirect(url_for("admin.users"))
        user = user_model.query.get_or_404(user_id)
        if user.username == ADMIN_USERNAME:
            flash("Cannot change admin permissions.", "error")
            return redirect(url_for("admin.users"))
        try:
            user.is_active = "is_active" in request.form
            user.can_access_dashboard = "can_access_dashboard" in request.form
            user.can_register = "can_register" in request.form
            user.can_edit_own_profile = "can_edit_own_profile" in request.form
            db.session.commit()
            flash("Permissions updated successfully.", "success")
        except Exception:
            db.session.rollback()
            flash("Database error. Please try again later.", "error")
        return redirect(url_for("admin.users"))

    panel = Panel(
        id="users",
        name="Users",
        route="/users",
        view_func=view,
        icon="",
        order=10,
    )
    register_panel(panel)
    return panel, add_user, edit_user, delete_user, permissions
