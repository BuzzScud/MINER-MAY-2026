"""API routes for composite score and indices (Tab 2)."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.composite.models import CompositeScore, IndexSnapshot

router = APIRouter()


class CompositeCurrentResponse(BaseModel):
    composite: Optional[float] = None
    timestamp: Optional[datetime] = None
    indices: Dict[str, float]
    composite_components: Optional[Dict[str, float]] = None

    class Config:
        from_attributes = True


class CompositeHistoryPoint(BaseModel):
    timestamp: datetime
    score: float

    class Config:
        from_attributes = True


@router.get("/current", response_model=CompositeCurrentResponse)
def current(db: Session = Depends(get_db)):
    """Latest composite score and latest per-source index values for Tab 2."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)
    indices: Dict[str, float] = {}
    rows = (
        db.query(IndexSnapshot)
        .filter(IndexSnapshot.timestamp >= cutoff)
        .order_by(desc(IndexSnapshot.timestamp))
        .all()
    )
    for r in rows:
        if r.source not in indices:
            indices[r.source] = r.value

    comp_row = (
        db.query(CompositeScore)
        .order_by(desc(CompositeScore.timestamp))
        .first()
    )
    composite = comp_row.score if comp_row else None
    timestamp = comp_row.timestamp if comp_row else None
    components = comp_row.components if comp_row and comp_row.components else None
    return CompositeCurrentResponse(
        composite=composite,
        timestamp=timestamp,
        indices=indices,
        composite_components=components,
    )


@router.get("/history", response_model=List[CompositeHistoryPoint])
def history(
    from_ts: Optional[datetime] = Query(None, alias="from"),
    to_ts: Optional[datetime] = Query(None, alias="to"),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    """Time series of composite scores for the chart."""
    now = datetime.now(timezone.utc)
    if to_ts is None:
        to_ts = now
    if from_ts is None:
        from_ts = to_ts - timedelta(days=30)
    rows = (
        db.query(CompositeScore)
        .filter(
            CompositeScore.timestamp >= from_ts,
            CompositeScore.timestamp <= to_ts,
        )
        .order_by(desc(CompositeScore.timestamp))
        .limit(limit)
        .all()
    )
    return [
        CompositeHistoryPoint(timestamp=r.timestamp, score=r.score)
        for r in reversed(rows)
    ]
