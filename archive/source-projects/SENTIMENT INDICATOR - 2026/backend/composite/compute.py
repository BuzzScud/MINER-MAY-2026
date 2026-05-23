"""Compute composite score from latest index snapshots and optional text sentiment."""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# Weights from plan: 30% text, 20% Fear & Greed, 20% funding, 15% Google Trends, 15% on-chain
WEIGHT_TEXT = 0.30
WEIGHT_FEAR_GREED = 0.20
WEIGHT_FUNDING = 0.20
WEIGHT_GOOGLE_TRENDS = 0.15
WEIGHT_ON_CHAIN = 0.15

# Map IndexSnapshot.source to weight bucket
SOURCE_TO_WEIGHT = {
    "news_polarity": WEIGHT_TEXT,
    "cnn_fear_greed": WEIGHT_FEAR_GREED,
    "crypto_fear_greed": WEIGHT_FEAR_GREED,
    "aaii_sentiment": WEIGHT_FEAR_GREED,
    "funding_rate_btc": WEIGHT_FUNDING,
    "vix": WEIGHT_FUNDING,  # treat as fear signal
    "put_call_ratio": WEIGHT_FUNDING,
    "google_trends_btc": WEIGHT_GOOGLE_TRENDS,
    "on_chain_volume": WEIGHT_ON_CHAIN,
}


def compute_composite(db: Any) -> None:
    """Read latest per-source values from IndexSnapshot, compute weighted score, write CompositeScore. Does not commit."""
    from datetime import timedelta
    from sqlalchemy import desc
    from backend.composite.models import CompositeScore, IndexSnapshot

    # Latest snapshot per source (from last 7 days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (
        db.query(IndexSnapshot)
        .filter(IndexSnapshot.timestamp >= cutoff)
        .order_by(desc(IndexSnapshot.timestamp))
        .all()
    )
    by_source: dict[str, float] = {}
    for r in rows:
        if r.source not in by_source:
            by_source[r.source] = r.value

    text_val = by_source.get("news_polarity")
    fg_vals = [
        by_source.get("cnn_fear_greed"),
        by_source.get("crypto_fear_greed"),
        by_source.get("aaii_sentiment"),
    ]
    funding_vals = [
        by_source.get("funding_rate_btc"),
        by_source.get("vix"),
        by_source.get("put_call_ratio"),
    ]
    gt_val = by_source.get("google_trends_btc")
    on_chain_val = by_source.get("on_chain_volume")

    def _avg(vals: list[float | None]) -> float:
        usable = [v for v in vals if v is not None]
        return sum(usable) / len(usable) if usable else 0.0

    text = text_val if text_val is not None else 0.0
    fear_greed = _avg(fg_vals)
    funding = _avg(funding_vals)
    google_trends = gt_val if gt_val is not None else 0.0
    on_chain = on_chain_val if on_chain_val is not None else 0.0

    # Weighted sum; all components already in [-1, 1]
    score = (
        WEIGHT_TEXT * text
        + WEIGHT_FEAR_GREED * fear_greed
        + WEIGHT_FUNDING * funding
        + WEIGHT_GOOGLE_TRENDS * google_trends
        + WEIGHT_ON_CHAIN * on_chain
    )
    score = max(-1.0, min(1.0, score))
    now = datetime.now(timezone.utc)
    components = {
        "text": text,
        "fear_greed": fear_greed,
        "funding": funding,
        "google_trends": google_trends,
        "on_chain": on_chain,
    }
    rec = CompositeScore(score=score, timestamp=now, components=components)
    db.add(rec)
