"""Tests for strategy signal generation."""
from __future__ import annotations

import pandas as pd
import pytest

from quantbot.signals.base import Side
from quantbot.signals.multi_asset import MultiAssetStrategy, MultiAssetStrategyConfig


@pytest.fixture
def strategy() -> MultiAssetStrategy:
    return MultiAssetStrategy()


@pytest.fixture
def ohlcv_200() -> pd.DataFrame:
    import numpy as np
    n = 250
    np.random.seed(42)
    close = 100 + np.cumsum(np.random.randn(n) * 0.5)
    high = close + np.abs(np.random.randn(n))
    low = close - np.abs(np.random.randn(n))
    return pd.DataFrame({
        "open": close - 0.1,
        "high": high,
        "low": low,
        "close": close,
        "volume": np.random.rand(n) * 1000 + 100,
    }, index=pd.date_range("2020-01-01", periods=n, freq="1min"))


def test_generate_signals_empty(strategy: MultiAssetStrategy) -> None:
    sigs = strategy.generate_signals("NQ", pd.DataFrame(), {})
    assert sigs == []


def test_generate_signals_short_series(strategy: MultiAssetStrategy) -> None:
    df = pd.DataFrame({"open": [1], "high": [2], "low": [0.5], "close": [1.5], "volume": [100]})
    sigs = strategy.generate_signals("NQ", df, {})
    assert len(sigs) == 0


def test_generate_signals_nq_shape(strategy: MultiAssetStrategy, ohlcv_200: pd.DataFrame) -> None:
    sigs = strategy.generate_signals("NQ", ohlcv_200, {})
    # May be 0 or more depending on conditions
    assert isinstance(sigs, list)
    for s in sigs:
        assert s.symbol == "NQ"
        assert s.side in (Side.LONG, Side.SHORT)


def test_should_enter_max_positions() -> None:
    cfg = MultiAssetStrategyConfig(max_positions=2)
    strategy = MultiAssetStrategy(cfg)
    from quantbot.signals.base import Signal
    context = {"open_positions": {"NQ": {}, "ES": {}, "EURUSD": {}}}
    assert strategy.should_enter("NQ", Signal("NQ", Side.LONG, 1.0), context) is False
    context["open_positions"] = {"NQ": {}}
    assert strategy.should_enter("ES", Signal("ES", Side.LONG, 1.0), context) is True


def test_registry_multi_asset_default() -> None:
    from quantbot.signals.registry import (
        create_strategy,
        get_strategy_class,
        get_strategy_options,
    )
    assert get_strategy_class("multi_asset") is not None
    strategy = create_strategy("multi_asset")
    assert isinstance(strategy, MultiAssetStrategy)
    assert hasattr(strategy, "config")
    options = get_strategy_options()
    multi_asset_option = next((o for o in options if o.get("id") == "multi_asset"), None)
    assert multi_asset_option is not None
    assert "Multi-Asset (default)" in (multi_asset_option.get("label") or "")
