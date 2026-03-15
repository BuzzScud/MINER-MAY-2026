"""Tests for VADER scoring and aggregation (no DB)."""
from datetime import datetime, timezone

import pytest

from backend.sentiment.analyzer import analyze, score_text
from backend.sentiment.gatherers import RawSignal
from backend.sentiment.strategies import default_strategy


def test_score_text_bounds():
    assert -1 <= score_text("This is terrible and awful.") <= 1
    assert -1 <= score_text("This is amazing and great!") <= 1
    assert -1 <= score_text("Neutral text.") <= 1


def test_score_text_empty():
    assert score_text("") == 0.0
    assert score_text("   ") == 0.0


def test_analyze_aggregate_entry_exit():
    now = datetime.now(timezone.utc)
    raw: list[RawSignal] = [
        {"asset_symbol": "AAPL", "source": "reddit", "text": "AAPL is going to the moon!", "timestamp": now, "url": None},
        {"asset_symbol": "AAPL", "source": "reddit", "text": "Love this stock.", "timestamp": now, "url": None},
    ] * 6  # 12 signals so above min_volume=10
    result = analyze(
        raw_signals=raw,
        source_weight=default_strategy.get_source_weight,
        entry_threshold=0.3,
        exit_threshold=-0.3,
        staleness_hours=24.0,
        min_volume=10,
    )
    assert len(result.scored_signals) == 12
    assert len(result.aggregates) == 1
    agg = result.aggregates[0]
    assert agg.asset_symbol == "AAPL"
    assert -1 <= agg.aggregated_score <= 1
    assert agg.signal_count == 12
    assert agg.entry_signal is True
    assert agg.exit_signal is False
