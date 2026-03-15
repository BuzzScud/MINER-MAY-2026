"""Tests for composite compute. Uses mock DB session."""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from backend.composite.compute import compute_composite


def _mock_row(source: str, value: float, timestamp: datetime):
    row = MagicMock()
    row.source = source
    row.value = value
    row.timestamp = timestamp
    return row


def test_compute_composite_score_in_range():
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)
    rows = [
        _mock_row("news_polarity", 0.2, now),
        _mock_row("crypto_fear_greed", -0.5, now),
        _mock_row("vix", -0.2, now),
    ]
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = rows
    mock_db.add = MagicMock()

    compute_composite(mock_db)

    assert mock_db.add.called
    call_arg = mock_db.add.call_args[0][0]
    assert hasattr(call_arg, "score")
    assert hasattr(call_arg, "components")
    assert -1.0 <= call_arg.score <= 1.0
    comp = call_arg.components
    assert "text" in comp
    assert "fear_greed" in comp
    assert "funding" in comp
    assert "google_trends" in comp
    assert "on_chain" in comp
    for v in comp.values():
        assert -1.0 <= v <= 1.0
