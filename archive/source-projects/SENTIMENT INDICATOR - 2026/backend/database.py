"""Database engine, session factory, and declarative base for Postgres."""
import os

from dotenv import load_dotenv

# Load .env from project root (parent of backend/) and cwd so it works regardless of how the app is started.
# In practice, this should share the same DATABASE_URL as the main app to avoid drift.
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(_project_root, ".env"))
if not os.getenv("DATABASE_URL"):
    load_dotenv(".env")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    # Fallback only; in local/dev we expect DATABASE_URL to be set so Sentiment
    # and the main app hit the same Postgres instance.
    "postgresql://localhost:5434/algonov26",
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that yields a DB session; close on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
