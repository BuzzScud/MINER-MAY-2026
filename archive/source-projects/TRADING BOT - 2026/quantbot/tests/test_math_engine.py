"""Tests for MathEngine indicators."""
from __future__ import annotations

import pytest

from quantbot.mathlib.math_engine import MathEngine


@pytest.fixture
def engine() -> MathEngine:
    return MathEngine()


@pytest.fixture
def series_10() -> list[float]:
    return [float(i) for i in range(1, 11)]


def test_ema_length(engine: MathEngine, series_10: list[float]) -> None:
    out = engine.ema(series_10, 3)
    assert len(out) == len(series_10)
    assert out[0].to_float() == 1.0


def test_sma_length(engine: MathEngine, series_10: list[float]) -> None:
    out = engine.sma(series_10, 3)
    assert len(out) == len(series_10)
    # First two are zero-padded or partial
    assert out[2].to_float() == (1 + 2 + 3) / 3


def test_rsi_bounds(engine: MathEngine) -> None:
    # Constant series -> RSI 50-ish; big drop -> low RSI
    flat = [100.0] * 20
    rsi = engine.rsi(flat, 14)
    assert len(rsi) >= 1
    assert 0 <= rsi[-1].to_float() <= 100


def test_macd_shape(engine: MathEngine, series_10: list[float]) -> None:
    macd_line, signal_line, hist = engine.macd(series_10, 2, 4, 2)
    assert len(macd_line) == len(series_10)
    assert len(signal_line) == len(series_10)
    assert len(hist) == len(series_10)


def test_bollinger_shape(engine: MathEngine, series_10: list[float]) -> None:
    mid, upper, lower = engine.bollinger(series_10, 3, 2.0)
    assert len(mid) == len(series_10)
    assert len(upper) == len(series_10)
    assert len(lower) == len(series_10)
    # Upper >= mid >= lower typically
    assert upper[-1].to_float() >= mid[-1].to_float()
    assert lower[-1].to_float() <= mid[-1].to_float()


def test_zscore_center(engine: MathEngine, series_10: list[float]) -> None:
    z = engine.zscore(series_10, 5)
    assert len(z) == len(series_10)


def test_kelly_fraction(engine: MathEngine) -> None:
    k = engine.kelly_fraction(0.5, 1.0, 1.0)
    assert abs(k.to_float()) < 1.0
    # Kelly = w - (1-w)/win_loss_ratio; 0.6, 2, 1 -> win_loss=2, k = 0.6 - 0.4/2 = 0.4
    k2 = engine.kelly_fraction(0.6, 2.0, 1.0)
    assert k2.to_float() >= 0.0
