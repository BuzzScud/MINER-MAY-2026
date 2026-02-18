"""
Circuit breaker: max drawdown halt, daily loss shutdown.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerConfig:
    max_daily_loss_pct: float = 10.0
    max_drawdown_pct: float = 10.0
    cooldown_seconds: int = 300


class CircuitBreaker:
    """Global and daily loss / drawdown halts."""

    def __init__(self, config: CircuitBreakerConfig | None = None) -> None:
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitState.CLOSED
        self._peak_equity: float | None = None
        self._daily_start_equity: float | None = None
        self._daily_start_date: str | None = None
        self._opened_at: datetime | None = None

    def set_equity(self, equity: float) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self._daily_start_date != today:
            self._daily_start_date = today
            self._daily_start_equity = equity
        if self._peak_equity is None or equity > self._peak_equity:
            self._peak_equity = equity

    def check(self, current_equity: float) -> tuple[bool, str]:
        """
        Return (trading_allowed, reason).
        If False, engine should flatten and stop new orders.
        """
        self.set_equity(current_equity)
        if self._state == CircuitState.OPEN and self._opened_at:
            from datetime import timedelta
            if datetime.now(timezone.utc) - self._opened_at > timedelta(seconds=self.config.cooldown_seconds):
                self._state = CircuitState.HALF_OPEN
        if self._daily_start_equity is not None and self._daily_start_equity > 0:
            daily_pnl_pct = (current_equity - self._daily_start_equity) / self._daily_start_equity * 100.0
            if daily_pnl_pct <= -self.config.max_daily_loss_pct:
                self._state = CircuitState.OPEN
                self._opened_at = datetime.now(timezone.utc)
                return False, "daily_loss_limit"
        if self._peak_equity is not None and self._peak_equity > 0:
            dd_pct = (self._peak_equity - current_equity) / self._peak_equity * 100.0
            if dd_pct >= self.config.max_drawdown_pct:
                self._state = CircuitState.OPEN
                self._opened_at = datetime.now(timezone.utc)
                return False, "max_drawdown"
        if self._state == CircuitState.OPEN:
            return False, "circuit_open"
        return True, "ok"

    def reset(self) -> None:
        self._state = CircuitState.CLOSED
        self._opened_at = None
