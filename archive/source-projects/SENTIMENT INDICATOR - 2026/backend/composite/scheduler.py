"""Register composite fetcher and compute jobs with the app scheduler."""
import logging
from typing import Any

from backend.database import SessionLocal

logger = logging.getLogger(__name__)

COMPOSITE_JOB_INTERVAL_MINUTES = 60


def _run_composite_job() -> None:
    """Run all fetchers, persist snapshots, compute composite, persist score."""
    from backend.composite.fetchers import run_all_fetchers
    from backend.composite.compute import compute_composite

    db = SessionLocal()
    try:
        run_all_fetchers(db)
        compute_composite(db)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("Composite job failed: %s", e)
    finally:
        db.close()


def add_composite_jobs(scheduler: Any) -> None:
    """Add composite jobs to an existing APScheduler instance."""
    interval = int(__import__("os").environ.get("COMPOSITE_JOB_INTERVAL_MINUTES", str(COMPOSITE_JOB_INTERVAL_MINUTES)))
    scheduler.add_job(_run_composite_job, "interval", minutes=interval, id="composite_job")
    logger.info("Composite job scheduled (interval=%s min)", interval)
    try:
        _run_composite_job()
    except Exception as e:
        logger.warning("Initial composite job failed: %s", e)
