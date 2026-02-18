"""Tests for adaptive signal weighting."""
from __future__ import annotations

from pathlib import Path

import pytest

from quantbot.signals.adaptive_weights import (
    AdaptiveWeightManager,
    signal_type_for_symbol,
    SIGNAL_TYPE_NQ_ES,
    SIGNAL_TYPE_EURUSD,
    SIGNAL_TYPE_GBPUSD,
)


def test_signal_type_mapping() -> None:
    assert signal_type_for_symbol("NQ") == SIGNAL_TYPE_NQ_ES
    assert signal_type_for_symbol("ES") == SIGNAL_TYPE_NQ_ES
    assert signal_type_for_symbol("EURUSD") == SIGNAL_TYPE_EURUSD
    assert signal_type_for_symbol("GBPUSD") == SIGNAL_TYPE_GBPUSD
    assert signal_type_for_symbol("AAPL") == "unknown"


def test_default_weight_is_one() -> None:
    mgr = AdaptiveWeightManager()
    assert mgr.get_weight("nq_es_rsi_bb_z") == 1.0
    assert mgr.get_weight("nonexistent") == 1.0


def test_update_with_winning_trades() -> None:
    mgr = AdaptiveWeightManager(lookback_trades=10)
    for _ in range(10):
        mgr.update({"symbol": "NQ", "pnl": 100.0})
    w = mgr.get_weight(SIGNAL_TYPE_NQ_ES)
    assert w > 0.5


def test_update_with_losing_trades() -> None:
    mgr = AdaptiveWeightManager(lookback_trades=10, min_weight=0.2)
    for _ in range(10):
        mgr.update({"symbol": "NQ", "pnl": -100.0})
    w = mgr.get_weight(SIGNAL_TYPE_NQ_ES)
    assert w == 0.2


def test_should_skip_low_weight() -> None:
    mgr = AdaptiveWeightManager(lookback_trades=10, min_weight=0.2)
    for _ in range(15):
        mgr.update({"symbol": "ES", "pnl": -200.0})
    assert mgr.should_skip(SIGNAL_TYPE_NQ_ES) is True


def test_should_not_skip_unknown() -> None:
    mgr = AdaptiveWeightManager()
    assert mgr.should_skip("nonexistent") is False


def test_position_scale_default() -> None:
    mgr = AdaptiveWeightManager()
    scale = mgr.get_position_scale("nq_es_rsi_bb_z")
    assert scale == 1.0


def test_position_scale_after_trades() -> None:
    mgr = AdaptiveWeightManager(lookback_trades=20)
    for _ in range(10):
        mgr.update({"symbol": "EURUSD", "pnl": 50.0})
    for _ in range(5):
        mgr.update({"symbol": "EURUSD", "pnl": -30.0})
    scale = mgr.get_position_scale(SIGNAL_TYPE_EURUSD)
    assert 0.0 < scale <= 1.0


def test_persistence_roundtrip(tmp_path: Path) -> None:
    mgr = AdaptiveWeightManager(lookback_trades=10, cache_dir=tmp_path)
    for _ in range(10):
        mgr.update({"symbol": "GBPUSD", "pnl": 80.0})
    saved_weights = mgr.get_all_weights()
    assert SIGNAL_TYPE_GBPUSD in saved_weights

    mgr2 = AdaptiveWeightManager(lookback_trades=10, cache_dir=tmp_path)
    loaded = mgr2.get_all_weights()
    assert SIGNAL_TYPE_GBPUSD in loaded
    assert loaded[SIGNAL_TYPE_GBPUSD]["weight"] == saved_weights[SIGNAL_TYPE_GBPUSD]["weight"]


def test_get_all_weights_empty() -> None:
    mgr = AdaptiveWeightManager()
    assert mgr.get_all_weights() == {}


def test_mixed_pnl_updates() -> None:
    mgr = AdaptiveWeightManager(lookback_trades=20)
    for i in range(20):
        pnl = 100.0 if i % 2 == 0 else -80.0
        mgr.update({"symbol": "NQ", "pnl": pnl})
    w = mgr.get_weight(SIGNAL_TYPE_NQ_ES)
    assert 0.2 <= w <= 1.0
    all_w = mgr.get_all_weights()
    assert all_w[SIGNAL_TYPE_NQ_ES]["trade_count"] == 20
    assert all_w[SIGNAL_TYPE_NQ_ES]["win_rate"] == 0.5
