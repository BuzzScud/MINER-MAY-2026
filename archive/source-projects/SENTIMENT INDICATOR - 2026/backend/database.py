"""Database engine, session factory, and declarative base for Postgres."""
import os

from dotenv import load_dotenv

# Load .env from project root (parent of backend/) and cwd so it works regardless of how the app is started
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(_project_root, ".env"))
if not os.getenv("DATABASE_URL"):
    load_dotenv(".env")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://localhost:5432/sentiment_db",
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
