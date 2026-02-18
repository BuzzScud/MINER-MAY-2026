"""Tests for the persistence layer: trades, signals, daily_metrics, adaptive_weights."""
from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest

from quantbot.data.storage import (
    init_db,
    load_adaptive_weights,
    load_daily_metrics,
    load_signals,
    load_trades,
    save_adaptive_weights,
    save_daily_metrics,
    save_signal,
    save_trade,
)


@pytest.fixture()
def tmp_cache(tmp_path: Path) -> Path:
    init_db(tmp_path)
    return tmp_path


def _make_trade(**overrides) -> dict:
    base = {
        "symbol": "NQ",
        "side": "long",
        "entry_price": 18000.0,
        "exit_price": 18050.0,
        "quantity": 1.0,
        "entry_time": datetime.now(timezone.utc).isoformat(),
        "exit_time": datetime.now(timezone.utc).isoformat(),
        "pnl": 250.0,
        "exit_reason": "profit_target",
        "atr_at_entry": 45.0,
        "regime_at_entry": "trending",
        "signal_metadata": {"rsi": 28.5, "z": -2.1},
        "strategy_params": {"rsi_oversold": 30.0},
    }
    base.update(overrides)
    return base


def test_save_and_load_trade(tmp_cache: Path) -> None:
    trade = _make_trade()
    save_trade(tmp_cache, trade)
    trades = load_trades(tmp_cache, days_back=1)
    assert len(trades) == 1
    t = trades[0]
    assert t["symbol"] == "NQ"
    assert t["pnl"] == 250.0
    assert t["exit_reason"] == "profit_target"
    assert t["signal_metadata"]["rsi"] == 28.5
    assert t["strategy_params"]["rsi_oversold"] == 30.0


def test_load_trades_respects_days_back(tmp_cache: Path) -> None:
    save_trade(tmp_cache, _make_trade())
    trades_recent = load_trades(tmp_cache, days_back=1)
    assert len(trades_recent) == 1
    trades_old = load_trades(tmp_cache, days_back=0)
    assert len(trades_old) <= 1


def test_save_and_load_signal(tmp_cache: Path) -> None:
    sig = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "symbol": "ES",
        "side": "short",
        "strength": 0.85,
        "acted_on": True,
        "skip_reason": "",
        "metadata": {"rsi": 72.0},
        "regime": "mean_reverting",
    }
    save_signal(tmp_cache, sig)
    signals = load_signals(tmp_cache, days_back=1)
    assert len(signals) == 1
    s = signals[0]
    assert s["symbol"] == "ES"
    assert s["acted_on"] is True
    assert s["metadata"]["rsi"] == 72.0


def test_save_and_load_daily_metrics(tmp_cache: Path) -> None:
    metrics = {
        "date": "2026-02-16",
        "equity": 102500.0,
        "sharpe": 1.45,
        "sortino": 2.1,
        "max_drawdown": 0.03,
        "win_rate": 0.62,
        "expectancy": 125.0,
        "profit_factor": 2.3,
        "total_pnl": 2500.0,
        "trade_count": 12,
        "regime_summary": {"trending": 7, "volatile": 5},
    }
    save_daily_metrics(tmp_cache, metrics)
    loaded = load_daily_metrics(tmp_cache, days_back=30)
    assert len(loaded) == 1
    m = loaded[0]
    assert m["equity"] == 102500.0
    assert m["sharpe"] == 1.45
    assert m["regime_summary"]["trending"] == 7


def test_save_and_load_adaptive_weights(tmp_cache: Path) -> None:
    weights = {
        "nq_es_rsi_bb_z": {
            "weight": 0.85,
            "win_rate": 0.55,
            "avg_pnl": 120.0,
            "kelly": 0.12,
            "trade_count": 30,
        },
    }
    save_adaptive_weights(tmp_cache, weights)
    loaded = load_adaptive_weights(tmp_cache)
    assert "nq_es_rsi_bb_z" in loaded
    assert loaded["nq_es_rsi_bb_z"]["weight"] == 0.85
    assert loaded["nq_es_rsi_bb_z"]["trade_count"] == 30


def test_multiple_trades_persist(tmp_cache: Path) -> None:
    for i in range(5):
        save_trade(tmp_cache, _make_trade(pnl=float(i * 100)))
    trades = load_trades(tmp_cache, days_back=1)
    assert len(trades) == 5
    assert trades[0]["pnl"] == 0.0
    assert trades[4]["pnl"] == 400.0
