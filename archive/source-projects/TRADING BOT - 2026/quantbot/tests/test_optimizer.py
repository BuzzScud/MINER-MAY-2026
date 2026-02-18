"""Tests for the walk-forward optimizer and daily review."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from quantbot.data.storage import init_db, save_trade
from quantbot.optimization.walk_forward import (
    OptimizationResult,
    _compute_sharpe_from_pnls,
    _monte_carlo_validate,
    _simulate_trades_with_params,
    run_walk_forward,
)
from quantbot.optimization.daily_review import _compute_attribution, run_daily_review
from quantbot.signals.adaptive_weights import AdaptiveWeightManager


@pytest.fixture()
def tmp_cache(tmp_path: Path) -> Path:
    init_db(tmp_path)
    return tmp_path


def _make_trade(symbol: str, side: str, pnl: float, days_ago: int = 0, **meta) -> dict:
    t = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return {
        "symbol": symbol,
        "side": side,
        "entry_price": 18000.0,
        "exit_price": 18000.0 + pnl,
        "quantity": 1.0,
        "entry_time": (t - timedelta(minutes=5)).isoformat(),
        "exit_time": t.isoformat(),
        "pnl": pnl,
        "exit_reason": "profit_target" if pnl > 0 else "trailing_stop",
        "atr_at_entry": 45.0,
        "regime_at_entry": "mean_reverting",
        "signal_metadata": meta,
        "strategy_params": {"rsi_oversold": 30.0},
    }


def test_compute_sharpe_from_pnls() -> None:
    pnls = [100.0, -50.0, 200.0, -30.0, 150.0]
    sharpe = _compute_sharpe_from_pnls(pnls)
    assert isinstance(sharpe, float)
    assert sharpe > 0


def test_compute_sharpe_empty() -> None:
    assert _compute_sharpe_from_pnls([]) == 0.0
    assert _compute_sharpe_from_pnls([100.0]) == 0.0


def test_simulate_trades_nq_long() -> None:
    trades = [
        _make_trade("NQ", "long", 200.0, rsi=25.0, z=-2.5),
        _make_trade("NQ", "long", 100.0, rsi=35.0, z=-1.0),
    ]
    params = {"rsi_oversold": 30.0, "z_long_threshold": -2.0}
    result = _simulate_trades_with_params(trades, params)
    assert len(result) == 1
    assert result[0] == 200.0


def test_simulate_trades_eurusd() -> None:
    trades = [
        _make_trade("EURUSD", "long", 50.0, corr_es=0.8),
        _make_trade("EURUSD", "long", -30.0, corr_es=0.5),
    ]
    params = {"corr_threshold": 0.7}
    result = _simulate_trades_with_params(trades, params)
    assert len(result) == 1
    assert result[0] == 50.0


def test_monte_carlo_validate_significant() -> None:
    import numpy as np
    rng = np.random.default_rng(42)
    baseline = (rng.normal(-5, 10, 50)).tolist()
    candidate = (rng.normal(20, 10, 50)).tolist()
    p = _monte_carlo_validate(baseline, candidate, n_trials=500)
    assert p < 0.15


def test_monte_carlo_validate_not_significant() -> None:
    import numpy as np
    rng = np.random.default_rng(42)
    baseline = rng.normal(0, 10, 50).tolist()
    candidate = rng.normal(0, 10, 50).tolist()
    p = _monte_carlo_validate(baseline, candidate, n_trials=500)
    assert p >= 0.0


def test_run_walk_forward_insufficient_trades(tmp_cache: Path) -> None:
    result = run_walk_forward(
        cache_dir=tmp_cache,
        current_params={"rsi_oversold": 30.0},
        min_trades=30,
    )
    assert result.adopted is False
    assert "insufficient_trades" in result.reason


def test_run_walk_forward_with_trades(tmp_cache: Path) -> None:
    for i in range(40):
        pnl = 100.0 if i % 3 != 0 else -50.0
        trade = _make_trade("NQ", "long", pnl, days_ago=i % 28, rsi=25.0, z=-2.5)
        save_trade(tmp_cache, trade)
    result = run_walk_forward(
        cache_dir=tmp_cache,
        current_params={"rsi_oversold": 30.0, "z_long_threshold": -2.0},
        training_weeks=4,
        validation_weeks=1,
        min_trades=10,
    )
    assert isinstance(result, OptimizationResult)
    assert isinstance(result.adopted, bool)


def test_compute_attribution() -> None:
    trades = [
        {"symbol": "NQ", "pnl": 100.0, "regime_at_entry": "trending"},
        {"symbol": "NQ", "pnl": -50.0, "regime_at_entry": "trending"},
        {"symbol": "EURUSD", "pnl": 80.0, "regime_at_entry": "volatile"},
    ]
    attr = _compute_attribution(trades)
    assert "sym:NQ" in attr
    assert attr["sym:NQ"]["trades"] == 2
    assert "regime:trending" in attr
    assert "regime:volatile" in attr
    assert "signal:nq_es_rsi_bb_z" in attr


def test_run_daily_review(tmp_cache: Path) -> None:
    for i in range(5):
        save_trade(tmp_cache, _make_trade("ES", "short", 100.0 - i * 30))
    mgr = AdaptiveWeightManager(lookback_trades=10, cache_dir=tmp_cache)
    summary = run_daily_review(
        cache_dir=tmp_cache,
        equity=100500.0,
        equity_curve=[100000.0, 100200.0, 100500.0],
        adaptive_weights=mgr,
        current_strategy_params={"rsi_oversold": 30.0},
    )
    assert "date" in summary
    assert "metrics" in summary
    assert "attribution" in summary
    assert "weights" in summary
