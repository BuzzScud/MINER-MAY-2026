"""FastAPI routes: current sentiment and historical series per asset."""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.sentiment.analyzer import analyze
from backend.sentiment.models import Aggregate, Signal
from backend.sentiment.providers import VALID_PROVIDERS, fetch_raw_signals
from backend.sentiment.smoothing import smooth_scores
from backend.sentiment.strategies import default_strategy
from backend.sentiment.strategies.base import AggregationMode

VALID_AGGREGATION_MODES = ("mean", "trimmed_mean", "median")
PRIME_MODULAR_ENTRY = 0.29
PRIME_MODULAR_EXIT = -0.31
PRIME_MODULAR_STALENESS_HOURS = 29 * 24

router = APIRouter()
logger = logging.getLogger(__name__)


class SentimentCurrentResponse(BaseModel):
    asset_symbol: str
    aggregated_score: float
    signal_count: int
    entry_signal: bool
    exit_signal: bool
    stale: bool
    window_end: datetime
    score_std: Optional[float] = None
    confidence_lower: Optional[float] = None
    confidence_upper: Optional[float] = None

    class Config:
        from_attributes = True


class HistoricalPoint(BaseModel):
    window_end: datetime
    aggregated_score: float
    signal_count: int
    entry_signal: bool
    exit_signal: bool
    stale: bool

    class Config:
        from_attributes = True


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/historical/{asset}", response_model=List[HistoricalPoint])
def historical(
    asset: str,
    from_ts: Optional[datetime] = Query(None, alias="from"),
    to_ts: Optional[datetime] = Query(None, alias="to"),
    limit: int = Query(500, ge=1, le=2000),
    smooth: Optional[str] = Query(None, description="Apply smoothing: ema or ma"),
    db: Session = Depends(get_db),
):
    """Time series of aggregates for the asset. Default last 7 days. Optional smooth=ema|ma."""
    try:
        asset_upper = asset.upper()
        now = datetime.now(timezone.utc)
        if to_ts is None:
            to_ts = now
        if from_ts is None:
            from_ts = to_ts - timedelta(days=7)

        q = (
            db.query(Aggregate)
            .filter(
                Aggregate.asset_symbol == asset_upper,
                Aggregate.window_end >= from_ts,
                Aggregate.window_end <= to_ts,
            )
            .order_by(desc(Aggregate.window_end))
            .limit(limit)
        )
        rows = q.all()
        points = [
            HistoricalPoint(
                window_end=r.window_end,
                aggregated_score=r.aggregated_score,
                signal_count=r.signal_count,
                entry_signal=r.entry_signal,
                exit_signal=r.exit_signal,
                stale=r.stale,
            )
            for r in reversed(rows)
        ]
        if smooth is not None:
            smooth_lower = smooth.strip().lower()
            if smooth_lower in ("ema", "ma"):
                scores = np.array([p.aggregated_score for p in points], dtype=np.float64)
                smoothed = smooth_scores(scores, smooth_lower)
                points = [
                    HistoricalPoint(
                        window_end=p.window_end,
                        aggregated_score=float(smoothed[i]),
                        signal_count=p.signal_count,
                        entry_signal=p.entry_signal,
                        exit_signal=p.exit_signal,
                        stale=p.stale,
                    )
                    for i, p in enumerate(points)
                ]
        return points
    except HTTPException:
        raise
    except Exception:
        logger.exception("Historical sentiment data error")
        raise HTTPException(
            status_code=502,
            detail="Historical data error. Check server logs.",
        )


@router.get("/{asset}", response_model=SentimentCurrentResponse)
def current(
    asset: str,
    provider: Optional[str] = Query(None, description="On-demand provider: massive, finnhub, alphavantage, yfinance"),
    use_time_decay: Optional[bool] = Query(None, description="Weight signals by time decay"),
    decay_half_life_hours: Optional[float] = Query(None, ge=0.1, le=168, description="Half-life in hours for time decay"),
    aggregation_mode: Optional[str] = Query(None, description="mean, trimmed_mean, or median"),
    include_uncertainty: Optional[bool] = Query(None, description="Include score_std and 95% CI"),
    use_prime_modular: Optional[bool] = Query(None, description="Use 0.29/-0.31 thresholds and 29-day window"),
    db: Session = Depends(get_db),
):
    """Latest aggregate for the asset. If provider is set, fetch on demand from that API; else read from DB. 404 if no data."""
    asset_upper = asset.strip().upper()
    if not asset_upper:
        raise HTTPException(status_code=400, detail="Asset symbol is required")

    if provider is not None:
        provider_lower = provider.strip().lower()
        if provider_lower not in VALID_PROVIDERS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid provider. Use one of: {', '.join(VALID_PROVIDERS)}",
            )
        if aggregation_mode is not None and aggregation_mode.strip().lower() not in VALID_AGGREGATION_MODES:
            raise HTTPException(
                status_code=400,
                detail=f"aggregation_mode must be one of: {', '.join(VALID_AGGREGATION_MODES)}",
            )
        try:
            raw_signals = fetch_raw_signals(provider_lower, asset_upper)
        except ValueError as e:
            raise HTTPException(status_code=503, detail=str(e))
        except RuntimeError as e:
            msg = str(e)
            if "rate limit" in msg.lower() or "429" in msg:
                raise HTTPException(status_code=429, detail=msg)
            raise HTTPException(status_code=502, detail=msg)

        try:
            use_td = use_time_decay if use_time_decay is not None else default_strategy.get_use_time_decay()
            half_life = decay_half_life_hours if decay_half_life_hours is not None else default_strategy.get_decay_half_life_hours()
            agg_mode: AggregationMode = (
                aggregation_mode.strip().lower() if aggregation_mode else default_strategy.get_aggregation_mode()
            )
            inc_unc = include_uncertainty if include_uncertainty is not None else default_strategy.get_include_uncertainty()
            use_pm = use_prime_modular if use_prime_modular is not None else default_strategy.get_use_prime_modular_thresholds()

            if use_pm:
                entry_threshold = PRIME_MODULAR_ENTRY
                exit_threshold = PRIME_MODULAR_EXIT
                staleness_hours = PRIME_MODULAR_STALENESS_HOURS
            else:
                entry_threshold = default_strategy.get_entry_threshold()
                exit_threshold = default_strategy.get_exit_threshold()
                staleness_hours = default_strategy.get_staleness_hours()

            def _source_weight(s: str) -> float:
                return 1.0
            result = analyze(
                raw_signals=raw_signals,
                source_weight=_source_weight,
                entry_threshold=entry_threshold,
                exit_threshold=exit_threshold,
                staleness_hours=staleness_hours,
                min_volume=1,
                use_time_decay=use_td,
                decay_half_life_hours=half_life,
                aggregation_mode=agg_mode,
                include_uncertainty=inc_unc,
            )
            aggs = [a for a in result.aggregates if a.asset_symbol == asset_upper]
            if not aggs:
                # No articles or all filtered: return neutral "no data" response so UI shows message, not error
                now = datetime.now(timezone.utc)
                return SentimentCurrentResponse(
                    asset_symbol=asset_upper,
                    aggregated_score=0.0,
                    signal_count=0,
                    entry_signal=False,
                    exit_signal=False,
                    stale=True,
                    window_end=now,
                )
            row_agg = aggs[0]
            return SentimentCurrentResponse(
                asset_symbol=row_agg.asset_symbol,
                aggregated_score=row_agg.aggregated_score,
                signal_count=row_agg.signal_count,
                entry_signal=row_agg.entry_signal,
                exit_signal=row_agg.exit_signal,
                stale=row_agg.stale,
                window_end=row_agg.window_end,
                score_std=row_agg.score_std,
                confidence_lower=row_agg.confidence_lower,
                confidence_upper=row_agg.confidence_upper,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Sentiment provider/analyzer error")
            msg = str(e) if len(str(e)) < 200 else "Sentiment analysis failed. Check server logs."
            raise HTTPException(status_code=502, detail=msg)

    row = (
        db.query(Aggregate)
        .filter(Aggregate.asset_symbol == asset_upper)
        .order_by(desc(Aggregate.window_end))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No sentiment data for this asset")
    return SentimentCurrentResponse(
        asset_symbol=row.asset_symbol,
        aggregated_score=row.aggregated_score,
        signal_count=row.signal_count,
        entry_signal=row.entry_signal,
        exit_signal=row.exit_signal,
        stale=row.stale,
        window_end=row.window_end,
        score_std=getattr(row, "score_std", None),
        confidence_lower=getattr(row, "confidence_lower", None),
        confidence_upper=getattr(row, "confidence_upper", None),
    )
