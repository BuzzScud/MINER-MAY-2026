import os
from dotenv import load_dotenv

load_dotenv()

# Use SQLite by default for dev. For PostgreSQL, set:
# DATABASE_URL=postgresql://user:password@localhost:5432/login_db
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///login.db")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")


class Config:
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = SECRET_KEY
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = False  # Set True for HTTPS in production
