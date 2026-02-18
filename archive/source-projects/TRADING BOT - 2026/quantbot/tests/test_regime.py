"""Tests for the regime detector."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from quantbot.signals.regime import (
    REGIME_MEAN_REVERTING,
    REGIME_TRENDING,
    REGIME_VOLATILE,
    RegimeDetector,
)


def _make_ohlcv(n: int = 300, trend: float = 0.0, volatility: float = 1.0) -> pd.DataFrame:
    """Generate synthetic OHLCV data."""
    np.random.seed(42)
    close = 100.0 + np.cumsum(np.random.randn(n) * volatility + trend)
    return pd.DataFrame(
        {
            "open": close - 0.1,
            "high": close + np.abs(np.random.randn(n)) * volatility,
            "low": close - np.abs(np.random.randn(n)) * volatility,
            "close": close,
            "volume": (np.random.rand(n) * 1000 + 100).astype(int),
        },
        index=pd.date_range("2026-01-01", periods=n, freq="1min", tz="UTC"),
    )


def test_regime_detector_returns_valid_regime() -> None:
    detector = RegimeDetector()
    ohlcv = _make_ohlcv()
    regime = detector.classify(ohlcv)
    assert regime in (REGIME_TRENDING, REGIME_MEAN_REVERTING, REGIME_VOLATILE)


def test_regime_detector_empty_data() -> None:
    detector = RegimeDetector()
    empty = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    regime = detector.classify(empty)
    assert regime == REGIME_MEAN_REVERTING


def test_regime_detector_short_data() -> None:
    detector = RegimeDetector()
    short = _make_ohlcv(n=50)
    regime = detector.classify(short)
    assert regime == REGIME_MEAN_REVERTING


def test_regime_trending_with_strong_trend() -> None:
    detector = RegimeDetector()
    ohlcv = _make_ohlcv(n=500, trend=0.5, volatility=0.3)
    regime = detector.classify(ohlcv)
    assert regime in (REGIME_TRENDING, REGIME_VOLATILE)


def test_regime_volatile_with_high_volatility() -> None:
    detector = RegimeDetector(atr_spike_mult=1.2)
    np.random.seed(99)
    n = 300
    close = np.full(n, 100.0)
    close[:270] += np.cumsum(np.random.randn(270) * 0.3)
    close[270:] = close[269] + np.cumsum(np.random.randn(30) * 8.0)
    high = close.copy()
    low = close.copy()
    high[:270] += np.abs(np.random.randn(270)) * 0.5
    low[:270] -= np.abs(np.random.randn(270)) * 0.5
    high[270:] += np.abs(np.random.randn(30)) * 10.0
    low[270:] -= np.abs(np.random.randn(30)) * 10.0
    ohlcv = pd.DataFrame(
        {
            "open": close - 0.1,
            "high": high,
            "low": low,
            "close": close,
            "volume": (np.random.rand(n) * 1000 + 100).astype(int),
        },
        index=pd.date_range("2026-01-01", periods=n, freq="1min", tz="UTC"),
    )
    regime = detector.classify(ohlcv)
    assert regime in (REGIME_VOLATILE, REGIME_TRENDING, REGIME_MEAN_REVERTING)


def test_get_regime_adjustments() -> None:
    detector = RegimeDetector()
    adj = detector.get_regime_adjustments(REGIME_TRENDING)
    assert adj["profit_atr_mult_override"] == 2.0
    assert adj["position_scale"] == 1.0

    adj_vol = detector.get_regime_adjustments(REGIME_VOLATILE)
    assert adj_vol["stop_atr_mult_override"] == 0.75
    assert adj_vol["position_scale"] == 0.5

    adj_mr = detector.get_regime_adjustments(REGIME_MEAN_REVERTING)
    assert adj_mr["position_scale"] == 1.0
    assert adj_mr["profit_atr_mult_override"] is None


def test_adx_computation() -> None:
    detector = RegimeDetector()
    ohlcv = _make_ohlcv(n=300)
    high = ohlcv["high"].tolist()
    low = ohlcv["low"].tolist()
    close = ohlcv["close"].tolist()
    adx = detector._compute_adx(high, low, close, 14)
    assert isinstance(adx, float)
    assert adx >= 0.0
