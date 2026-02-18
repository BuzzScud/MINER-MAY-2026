"""Tests for risk engine and circuit breaker."""
from __future__ import annotations

import pytest

from quantbot.risk.circuit_breaker import CircuitBreaker, CircuitBreakerConfig, CircuitState
from quantbot.risk.engine import RiskEngine


def test_risk_engine_check_allowed() -> None:
    r = RiskEngine(max_daily_loss_pct=10.0, max_vol_adjusted_exposure_pct=2.0)
    allowed, reason = r.check_trade("NQ", "long", 1.0, 100.0, 100_000.0, {}, 0.0)
    assert allowed is True
    assert reason == "ok"


def test_risk_engine_daily_loss() -> None:
    r = RiskEngine(max_daily_loss_pct=10.0)
    allowed, reason = r.check_trade("NQ", "long", 1.0, 100.0, 100_000.0, {}, -15.0)
    assert allowed is False
    assert reason == "daily_loss_limit"


def test_risk_engine_exposure_cap() -> None:
    r = RiskEngine(max_portfolio_pct_per_instrument=20.0)
    # 30% notional of equity
    allowed, reason = r.check_trade("NQ", "long", 300.0, 100.0, 100_000.0, {}, 0.0)
    assert allowed is False
    assert reason == "instrument_exposure_limit"


def test_circuit_breaker_closed() -> None:
    cb = CircuitBreaker(CircuitBreakerConfig(max_daily_loss_pct=10.0))
    cb.set_equity(100_000.0)
    allowed, reason = cb.check(99_000.0)
    assert allowed is True
    assert reason == "ok"


def test_circuit_breaker_daily_loss_trip() -> None:
    cb = CircuitBreaker(CircuitBreakerConfig(max_daily_loss_pct=10.0))
    cb.set_equity(100_000.0)
    allowed, reason = cb.check(84_000.0)  # -16%
    assert allowed is False
    assert "daily_loss" in reason or "circuit" in reason.lower()


def test_circuit_breaker_reset() -> None:
    cb = CircuitBreaker()
    cb.reset()
    assert cb._state == CircuitState.CLOSED
