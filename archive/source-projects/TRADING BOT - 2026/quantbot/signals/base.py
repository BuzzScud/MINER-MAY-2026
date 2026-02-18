"""
Base strategy ABC: on_bar, generate_signals, should_enter, should_exit.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

import pandas as pd


class Side(str, Enum):
    LONG = "long"
    SHORT = "short"


@dataclass
class Signal:
    """Trading signal."""
    symbol: str
    side: Side
    strength: float
    metadata: dict[str, Any] | None = None


@dataclass
class ExitSignal:
    """Exit recommendation."""
    symbol: str
    reason: str
    metadata: dict[str, Any] | None = None


class BaseStrategy(ABC):
    """Abstract base strategy."""

    @abstractmethod
    def on_bar(self, symbol: str, bar: pd.Series, context: dict[str, Any]) -> None:
        """Process one bar (update internal state)."""
        ...

    @abstractmethod
    def generate_signals(
        self,
        symbol: str,
        ohlcv: pd.DataFrame,
        context: dict[str, Any],
    ) -> list[Signal]:
        """Generate entry signals from OHLCV and context."""
        ...

    def should_enter(
        self,
        symbol: str,
        signal: Signal,
        context: dict[str, Any],
    ) -> bool:
        """Filter: return True if entry allowed."""
        return True

    def should_exit(
        self,
        symbol: str,
        position: dict[str, Any],
        bar: pd.Series,
        context: dict[str, Any],
    ) -> ExitSignal | None:
        """Return ExitSignal if position should be closed, else None."""
        return None
