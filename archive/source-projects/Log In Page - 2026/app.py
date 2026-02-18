import secrets
from datetime import datetime
from functools import wraps

import bcrypt
from flask import Flask, flash, redirect, render_template, request, session, url_for
from flask_sqlalchemy import SQLAlchemy

from config import Config

app = Flask(__name__)
app.config.from_object(Config)
db = SQLAlchemy(app)

BCRYPT_ROUNDS = 12


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    can_access_dashboard = db.Column(db.Boolean, default=True, nullable=False)
    can_register = db.Column(db.Boolean, default=True, nullable=False)
    can_edit_own_profile = db.Column(db.Boolean, default=False, nullable=False)

    @staticmethod
    def generate_password_hash(password: str) -> str:
        return bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
        ).decode("utf-8")

    @staticmethod
    def check_password_hash(plain_password: str, password_hash: str) -> bool:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), password_hash.encode("utf-8")
        )


class EmergencyLogout(db.Model):
    __tablename__ = "emergency_logout"

    id = db.Column(db.Integer, primary_key=True, default=1)
    generation = db.Column(db.Integer, nullable=False, default=0)


class UserActivity(db.Model):
    __tablename__ = "user_activity"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    username = db.Column(db.String(255), nullable=False)
    route = db.Column(db.String(512), nullable=False)
    method = db.Column(db.String(10), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return decorated_function


def get_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(32)
    return session["csrf_token"]


def validate_csrf(token: str) -> bool:
    return token and token == session.get("csrf_token")


def get_current_logout_generation():
    """Return current emergency logout generation from DB (0 if missing)."""
    try:
        row = EmergencyLogout.query.get(1)
        return row.generation if row else 0
    except Exception:
        return 0


@app.before_request
def inject_csrf():
    from flask import g

    g.csrf_token = get_csrf_token()


@app.before_request
def check_emergency_logout():
    """If non-admin user has stale logout generation, clear session and redirect to login."""
    if request.endpoint in (None, "static"):
        return None
    if not session.get("user_id"):
        return None
    if session.get("username") == "admin":
        return None
    try:
        current_gen = get_current_logout_generation()
        if session.get("logout_generation", 0) < current_gen:
            session.clear()
            return redirect(url_for("login"))
    except Exception:
        pass
    return None


@app.after_request
def log_user_activity(response):
    if session.get("user_id") and request.endpoint and not request.endpoint.startswith("static"):
        try:
            activity = UserActivity(
                user_id=session["user_id"],
                username=session.get("username", "unknown"),
                route=request.path or "",
                method=request.method or "GET",
                ip_address=request.remote_addr,
            )
            db.session.add(activity)
            db.session.commit()
        except Exception:
            db.session.rollback()
    return response


@app.context_processor
def inject_csrf_processor():
    return {"csrf_token": get_csrf_token()}


@app.route("/", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        if session.get("username") == "admin":
            return redirect(url_for("admin.index"))
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        if not validate_csrf(request.form.get("csrf_token")):
            flash("Invalid request. Please try again.", "error")
            return render_template("login.html", is_register=False)

        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        if not username or not password:
            flash("Username and password are required.", "error")
            return render_template("login.html", is_register=False)

        try:
            user = User.query.filter_by(username=username).first()
            if user and User.check_password_hash(password, user.password_hash):
                if not getattr(user, "is_active", True) and user.username != "admin":
                    flash("Account is disabled.", "error")
                    return render_template("login.html", is_register=False)
                session["user_id"] = user.id
                session["username"] = user.username
                session["logout_generation"] = get_current_logout_generation()
                if user.username == "admin":
                    return redirect(url_for("admin.index"))
                if not getattr(user, "can_access_dashboard", True):
                    flash("You do not have access to the dashboard.", "error")
                    return render_template("login.html", is_register=False)
                return redirect(url_for("dashboard"))
        except Exception:
            db.session.rollback()
            flash("Database error. Please try again later.", "error")
            return render_template("login.html", is_register=False)

        flash("Invalid username or password.", "error")
        return render_template("login.html", is_register=False)

    return render_template("login.html", is_register=False)


@app.route("/register", methods=["GET", "POST"])
def register():
    if "user_id" in session:
        if session.get("username") == "admin":
            return redirect(url_for("admin.index"))
        user = User.query.get(session["user_id"])
        if user and not getattr(user, "can_register", True):
            flash("You do not have permission to access registration.", "error")
            return redirect(url_for("dashboard"))
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        if not validate_csrf(request.form.get("csrf_token")):
            flash("Invalid request. Please try again.", "error")
            return render_template("login.html", is_register=True)

        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        if not username or not password:
            flash("Username and password are required.", "error")
            return render_template("login.html", is_register=True)

        if len(username) < 3:
            flash("Username must be at least 3 characters.", "error")
            return render_template("login.html", is_register=True)

        if len(password) < 6:
            flash("Password must be at least 6 characters.", "error")
            return render_template("login.html", is_register=True)

        try:
            existing = User.query.filter_by(username=username).first()
            if existing:
                flash("Username already exists.", "error")
                return render_template("login.html", is_register=True)

            user = User(
                username=username,
                password_hash=User.generate_password_hash(password),
            )
            db.session.add(user)
            db.session.commit()
            flash("Registration successful. You can now log in.", "success")
            return redirect(url_for("login"))
        except Exception:
            db.session.rollback()
            flash("Database error. Please try again later.", "error")
            return render_template("login.html", is_register=True)

    return render_template("login.html", is_register=True)


from admin import create_admin_blueprint

admin_bp = create_admin_blueprint(
    db, User, get_csrf_token, validate_csrf, UserActivity, EmergencyLogout
)
app.register_blueprint(admin_bp)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    user = User.query.get(session["user_id"])
    if user and user.username != "admin" and not getattr(user, "can_access_dashboard", True):
        flash("You do not have access to the dashboard.", "error")
        session.clear()
        return redirect(url_for("login"))
    return render_template(
        "dashboard.html", username=session.get("username", "User")
    )


ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "3edc6yhn#EDC^YHN"


def init_db():
    with app.app_context():
        db.create_all()
        if EmergencyLogout.query.get(1) is None:
            db.session.add(EmergencyLogout(id=1, generation=0))
            db.session.commit()
        admin = User.query.filter_by(username=ADMIN_USERNAME).first()
        if not admin:
            admin = User(
                username=ADMIN_USERNAME,
                password_hash=User.generate_password_hash(ADMIN_PASSWORD),
            )
            db.session.add(admin)
            db.session.commit()


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
