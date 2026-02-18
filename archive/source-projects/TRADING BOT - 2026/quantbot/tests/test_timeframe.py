"""Tests for timeframe switching, 4h resampling, market overview, and equity snapshots."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from quantbot.webapp.bot_runner import BotRunner, TIMEFRAME_RESAMPLE, VALID_TIMEFRAMES
from quantbot.webapp.paper_broker import PaperBroker


def test_timeframe_resample_keys() -> None:
    """All five user-facing timeframes are defined."""
    assert "15m" in TIMEFRAME_RESAMPLE
    assert "30m" in TIMEFRAME_RESAMPLE
    assert "1h" in TIMEFRAME_RESAMPLE
    assert "4h" in TIMEFRAME_RESAMPLE
    assert "1d" in TIMEFRAME_RESAMPLE
    assert len(TIMEFRAME_RESAMPLE) == 5


def test_timeframe_resample_values_structure() -> None:
    """Each entry maps to a pandas resample frequency string."""
    for key, value in TIMEFRAME_RESAMPLE.items():
        assert isinstance(value, str)
        assert len(value) > 0


def test_timeframe_4h_resample_rule() -> None:
    """4h entry maps to the correct pandas resample rule."""
    assert TIMEFRAME_RESAMPLE["4h"] == "4h"


def test_set_chart_interval_valid() -> None:
    runner = BotRunner(initial_equity=50_000.0, symbols=["NQ"])
    for tf in VALID_TIMEFRAMES:
        ok = runner.set_chart_interval(tf)
        assert ok is True
        assert runner._chart_interval == tf


def test_set_chart_interval_invalid() -> None:
    runner = BotRunner(initial_equity=50_000.0, symbols=["NQ"])
    ok = runner.set_chart_interval("bad")
    assert ok is False
    assert runner._chart_interval == "1h"

    ok = runner.set_chart_interval("")
    assert ok is False


def _make_1h_dataframe(hours: int = 48) -> pd.DataFrame:
    """Create a mock 1h OHLCV DataFrame."""
    np.random.seed(42)
    index = pd.date_range("2026-01-01", periods=hours, freq="1h", tz="UTC")
    close = 100.0 + np.cumsum(np.random.randn(hours) * 0.5)
    return pd.DataFrame({
        "open": close - 0.1,
        "high": close + np.abs(np.random.randn(hours)),
        "low": close - np.abs(np.random.randn(hours)),
        "close": close,
        "volume": (np.random.rand(hours) * 1000 + 100).astype(int),
    }, index=index)


def test_resample_ohlcv_4h() -> None:
    """Resample 1h DataFrame to 4h via _resample_ohlcv and verify aggregation."""
    runner = BotRunner(initial_equity=50_000.0, symbols=["NQ"])
    df_1h = _make_1h_dataframe(48)
    df_4h = runner._resample_ohlcv(df_1h, "4h")

    assert not df_4h.empty
    assert len(df_4h) == 12
    assert "open" in df_4h.columns
    assert "high" in df_4h.columns
    assert "low" in df_4h.columns
    assert "close" in df_4h.columns
    assert "volume" in df_4h.columns

    first_4_rows = df_1h.iloc[:4]
    first_4h_bar = df_4h.iloc[0]
    assert first_4h_bar["open"] == first_4_rows["open"].iloc[0]
    assert first_4h_bar["high"] == first_4_rows["high"].max()
    assert first_4h_bar["low"] == first_4_rows["low"].min()
    assert first_4h_bar["close"] == first_4_rows["close"].iloc[-1]
    assert first_4h_bar["volume"] == first_4_rows["volume"].sum()


def test_resample_ohlcv_1h() -> None:
    """Resample 1m DataFrame to 1h via _resample_ohlcv."""
    runner = BotRunner(initial_equity=50_000.0, symbols=["NQ"])
    np.random.seed(42)
    index = pd.date_range("2026-01-01", periods=120, freq="1min", tz="UTC")
    close = 100.0 + np.cumsum(np.random.randn(120) * 0.1)
    df_1m = pd.DataFrame({
        "open": close - 0.05,
        "high": close + np.abs(np.random.randn(120)) * 0.1,
        "low": close - np.abs(np.random.randn(120)) * 0.1,
        "close": close,
        "volume": (np.random.rand(120) * 100 + 10).astype(int),
    }, index=index)
    df_1h = runner._resample_ohlcv(df_1m, "1h")
    assert not df_1h.empty
    assert len(df_1h) == 2


def test_resample_ohlcv_empty() -> None:
    runner = BotRunner(initial_equity=50_000.0, symbols=["NQ"])
    empty = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    result = runner._resample_ohlcv(empty, "4h")
    assert result.empty


def test_market_overview_structure() -> None:
    """Market overview returns correct keys and types for each symbol."""
    runner = BotRunner(initial_equity=50_000.0, symbols=["NQ", "ES"])
    df = _make_1h_dataframe(24)
    runner._ohlcv_cache["NQ"] = df
    runner._prices["NQ"] = float(df["close"].iloc[-1])
    runner._ohlcv_cache["ES"] = df.copy()
    runner._prices["ES"] = float(df["close"].iloc[-1])

    overview = runner._get_market_overview()
    assert isinstance(overview, list)
    assert len(overview) == 2

    for item in overview:
        assert "symbol" in item
        assert "price" in item
        assert "change_pct" in item
        assert "day_high" in item
        assert "day_low" in item
        assert "volume" in item
        assert isinstance(item["price"], float)
        assert isinstance(item["change_pct"], float)
        assert isinstance(item["volume"], int)


def test_market_overview_empty_cache() -> None:
    """Market overview handles missing data gracefully."""
    runner = BotRunner(initial_equity=50_000.0, symbols=["NQ"])
    overview = runner._get_market_overview()
    assert len(overview) == 1
    assert overview[0]["symbol"] == "NQ"
    assert overview[0]["price"] == 0.0


def test_equity_snapshot_appended() -> None:
    """append_equity_snapshot adds a point to the equity curve."""
    broker = PaperBroker(initial_equity=100_000.0)
    initial_curve = broker.get_equity_curve()
    initial_len = len(initial_curve)

    broker.append_equity_snapshot(100_050.0)
    curve = broker.get_equity_curve()
    assert len(curve) == initial_len + 1
    assert curve[-1]["equity"] == 100_050.0


def test_equity_snapshot_dedup() -> None:
    """append_equity_snapshot skips duplicate values within 10s."""
    broker = PaperBroker(initial_equity=100_000.0)
    broker.append_equity_snapshot(100_000.0)
    curve_len = len(broker.get_equity_curve())

    broker.append_equity_snapshot(100_000.0)
    assert len(broker.get_equity_curve()) == curve_len


def test_equity_snapshot_new_value_added() -> None:
    """append_equity_snapshot adds point even within 10s if value changed."""
    broker = PaperBroker(initial_equity=100_000.0)
    broker.append_equity_snapshot(100_100.0)
    curve_len = len(broker.get_equity_curve())

    broker.append_equity_snapshot(100_200.0)
    assert len(broker.get_equity_curve()) == curve_len + 1
