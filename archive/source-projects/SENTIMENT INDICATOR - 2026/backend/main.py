"""FastAPI app: sentiment API, CORS, lifespan for scheduler."""
import logging
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError

from backend.sentiment.api import router as sentiment_router
from backend.sentiment.scheduler import start_scheduler, stop_scheduler
from backend.composite.api import router as composite_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Market Sentiment Indicator",
    lifespan=lifespan,
)


def _db_unavailable_handler(request, exc):
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database unavailable. Ensure Postgres is running, the database exists, and migrations are applied (see README).",
        },
    )


def _generic_exception_handler(request, exc: Exception):
    logger.exception("Unhandled exception in Sentiment API")
    return JSONResponse(
        status_code=502,
        content={
            "detail": "Sentiment service error. Check server logs.",
        },
    )


app.add_exception_handler(OperationalError, _db_unavailable_handler)
app.add_exception_handler(InterfaceError, _db_unavailable_handler)
app.add_exception_handler(Exception, _generic_exception_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sentiment_router, prefix="/api/sentiment", tags=["sentiment"])
app.include_router(composite_router, prefix="/api/composite", tags=["composite"])
