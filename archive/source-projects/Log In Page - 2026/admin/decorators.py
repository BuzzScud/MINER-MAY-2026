from functools import wraps

from flask import redirect, session, url_for


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        if session.get("username") != "admin":
            return redirect(url_for("dashboard"))
        return f(*args, **kwargs)

    return decorated_function
