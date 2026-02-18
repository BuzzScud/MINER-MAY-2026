"""
Adaptive signal weight manager.

Tracks rolling performance of each signal type and adjusts weights
so that consistently losing signal types are down-weighted or skipped.
Uses Kelly fraction (via MathEngine) for position scaling.
Persists weights to SQLite via quantbot.data.storage.
"""
from __future__ import annotations

import logging
from collections import deque
from pathlib import Path
from typing import Any

from quantbot.data.storage import load_adaptive_weights, save_adaptive_weights
from quantbot.mathlib.math_engine import MathEngine

logger = logging.getLogger(__name__)

SIGNAL_TYPE_NQ_ES = "nq_es_rsi_bb_z"
SIGNAL_TYPE_EURUSD = "eurusd_macd_atr_corr"
SIGNAL_TYPE_GBPUSD = "gbpusd_supertrend_rsi_z"
DEFAULT_SIGNAL_TYPE = "unknown"

SYMBOL_TO_SIGNAL_TYPE: dict[str, str] = {
    "NQ": SIGNAL_TYPE_NQ_ES,
    "ES": SIGNAL_TYPE_NQ_ES,
    "EURUSD": SIGNAL_TYPE_EURUSD,
    "GBPUSD": SIGNAL_TYPE_GBPUSD,
}


def signal_type_for_symbol(symbol: str) -> str:
    """Map a trading symbol to its signal type identifier."""
    return SYMBOL_TO_SIGNAL_TYPE.get(symbol.upper(), DEFAULT_SIGNAL_TYPE)


class AdaptiveWeightManager:
    """Track rolling performance per signal type and compute adaptive weights."""

    def __init__(
        self,
        lookback_trades: int = 50,
        min_weight: float = 0.2,
        cache_dir: Path | None = None,
    ) -> None:
        self._lookback = lookback_trades
        self._min_weight = min_weight
        self._math = MathEngine()
        self._cache_dir = cache_dir
        self._trade_buffers: dict[str, deque[float]] = {}
        self._weights: dict[str, dict[str, Any]] = {}
        if cache_dir is not None:
            self._load_from_disk()

    def _load_from_disk(self) -> None:
        """Restore persisted weights from SQLite."""
        if self._cache_dir is None:
            return
        try:
            self._weights = load_adaptive_weights(self._cache_dir)
            logger.info("Loaded adaptive weights for %d signal types", len(self._weights))
        except Exception as exc:
            logger.warning("Failed to load adaptive weights: %s", exc)

    def _save_to_disk(self) -> None:
        """Persist current weights to SQLite."""
        if self._cache_dir is None:
            return
        try:
            save_adaptive_weights(self._cache_dir, self._weights)
        except Exception as exc:
            logger.warning("Failed to save adaptive weights: %s", exc)

    def update(self, trade: dict[str, Any]) -> None:
        """Called after each closed trade to update rolling stats."""
        symbol = trade.get("symbol", "")
        pnl = trade.get("pnl", 0.0)
        sig_type = signal_type_for_symbol(symbol)
        if sig_type not in self._trade_buffers:
            self._trade_buffers[sig_type] = deque(maxlen=self._lookback)
        self._trade_buffers[sig_type].append(pnl)
        self._recompute(sig_type)
        self._save_to_disk()

    def _recompute(self, sig_type: str) -> None:
        """Recompute weight/stats for a signal type from its trade buffer."""
        buf = self._trade_buffers.get(sig_type)
        if not buf:
            return
        pnls = list(buf)
        total = len(pnls)
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p < 0]
        win_rate = len(wins) / total if total > 0 else 0.0
        avg_pnl = sum(pnls) / total if total > 0 else 0.0
        avg_win = sum(wins) / len(wins) if wins else 0.0
        avg_loss_abs = abs(sum(losses) / len(losses)) if losses else 0.0
        kelly = 0.0
        if avg_win > 0 and avg_loss_abs > 0:
            kelly_val = self._math.kelly_fraction(win_rate, avg_win, avg_loss_abs)
            kelly = max(0.0, kelly_val.to_float() if hasattr(kelly_val, "to_float") else float(kelly_val))
        weight = max(self._min_weight, min(1.0, win_rate + kelly * 0.5))
        if total >= 10 and win_rate < 0.3 and avg_pnl < 0:
            weight = self._min_weight
        self._weights[sig_type] = {
            "weight": round(weight, 4),
            "win_rate": round(win_rate, 4),
            "avg_pnl": round(avg_pnl, 2),
            "kelly": round(kelly, 4),
            "trade_count": total,
        }

    def get_weight(self, signal_type: str) -> float:
        """Return the current weight (0.0–1.0) for a signal type."""
        data = self._weights.get(signal_type)
        if data is None:
            return 1.0
        return data.get("weight", 1.0)

    def get_position_scale(self, signal_type: str) -> float:
        """Kelly-based position scaling factor (0.0–1.0)."""
        data = self._weights.get(signal_type)
        if data is None:
            return 1.0
        kelly = data.get("kelly", 0.0)
        return max(0.1, min(1.0, kelly * 2.0)) if kelly > 0 else 0.5

    def should_skip(self, signal_type: str) -> bool:
        """Return True if this signal type should be skipped entirely."""
        w = self.get_weight(signal_type)
        return w < self._min_weight + 0.01

    def get_all_weights(self) -> dict[str, dict[str, Any]]:
        """Return a copy of all current weights for inspection/logging."""
        return dict(self._weights)
