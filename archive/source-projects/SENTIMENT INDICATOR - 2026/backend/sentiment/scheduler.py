"""APScheduler job: run gatherers -> analyzer -> persist to Postgres every 15 min."""
import os
import logging
from typing import List, Optional

from apscheduler.schedulers.background import BackgroundScheduler

from backend.database import SessionLocal
from backend.sentiment.analyzer import run_pipeline
from backend.sentiment.models import Aggregate, Signal
from backend.sentiment.strategies import default_strategy

logger = logging.getLogger(__name__)
_scheduler: Optional[BackgroundScheduler] = None

JOB_INTERVAL_MINUTES = 15


def _get_symbols() -> List[str]:
    raw = os.getenv("SENTIMENT_SYMBOLS", "AAPL,BTC")
    return [s.strip() for s in raw.split(",") if s.strip()]


def _run_sentiment_job() -> None:
    """Gather -> analyze -> persist signals and aggregates."""
    symbols = _get_symbols()
    try:
        result = run_pipeline(default_strategy, symbols=symbols)
    except Exception as e:
        logger.exception("Sentiment pipeline failed: %s", e)
        return

    db = SessionLocal()
    try:
        for s in result.scored_signals:
            rec = Signal(
                asset_symbol=s.asset_symbol,
                source=s.source,
                sentiment_score=s.sentiment_score,
                reason=s.reason,
                timestamp=s.timestamp,
            )
            db.add(rec)
        for a in result.aggregates:
            rec = Aggregate(
                asset_symbol=a.asset_symbol,
                aggregated_score=a.aggregated_score,
                signal_count=a.signal_count,
                entry_signal=a.entry_signal,
                exit_signal=a.exit_signal,
                stale=a.stale,
                window_start=a.window_start,
                window_end=a.window_end,
            )
            db.add(rec)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("DB write failed: %s", e)
    finally:
        db.close()


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    interval_minutes = int(os.getenv("SCHEDULER_INTERVAL_MINUTES", str(JOB_INTERVAL_MINUTES)))
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(_run_sentiment_job, "interval", minutes=interval_minutes, id="sentiment_job")
    try:
        from backend.composite.scheduler import add_composite_jobs
        add_composite_jobs(_scheduler)
    except Exception as e:
        logger.warning("Could not add composite jobs: %s", e)
    _scheduler.start()
    logger.info("Scheduler started (interval=%s min)", interval_minutes)
    # Run once on startup so there is data quickly
    _run_sentiment_job()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("Scheduler stopped")
