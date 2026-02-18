"""
Backtesting engine: event-driven replay with slippage model, dollar-denominated PnL.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

import pandas as pd

from quantbot.backtest.metrics import compute_all_metrics
from quantbot.config import DEFAULT_SYMBOLS
from quantbot.data.storage import read_ohlcv, replay_bars
from quantbot.mathlib.math_engine import MathEngine
from quantbot.signals.base import BaseStrategy
from quantbot.signals.multi_asset import MultiAssetStrategy


@dataclass
class BacktestConfig:
    """Backtest parameters."""
    initial_equity: float = 100_000.0
    slippage_ticks: float = 0.25
    slippage_bps: float = 0.5
    tick_size: float = 0.25
    tick_value: float = 5.0


def _resolve_tick_params(symbol: str, config: BacktestConfig) -> tuple[float, float]:
    """Resolve tick_size and tick_value: use DEFAULT_SYMBOLS if available, else config defaults."""
    inst = DEFAULT_SYMBOLS.get(symbol)
    if inst is not None:
        return inst.tick_size, inst.tick_value
    return config.tick_size, config.tick_value


def apply_slippage(price: float, side: str, config: BacktestConfig) -> float:
    """Apply slippage: ticks + bps via Abacus."""
    engine = MathEngine()
    p = engine._a(price)
    ticks = engine._a(config.slippage_ticks) * engine._a(config.tick_size)
    bps = p * engine._a(config.slippage_bps / 10000.0)
    if side == "long":
        return (p + ticks + bps).to_float()
    return (p - ticks - bps).to_float()


def _pnl_dollars(symbol: str, entry: float, exit_price: float, side: str, config: BacktestConfig) -> float:
    """PnL in dollars via Abacus, using tick_size/tick_value from DEFAULT_SYMBOLS or config."""
    engine = MathEngine()
    tick_size, tick_value = _resolve_tick_params(symbol, config)
    direction = engine._a(1) if side in ("long", "LONG") else engine._a(-1)
    points = (engine._a(exit_price) - engine._a(entry)) * direction
    ts_a = engine._a(tick_size)
    tv_a = engine._a(tick_value)
    if ts_a <= engine._a(0):
        return 0.0
    result = points / ts_a * tv_a
    return result.to_float()


class BacktestEngine:
    """Event-driven backtester with replay from cache. Dollar-denominated PnL."""

    def __init__(
        self,
        strategy: BaseStrategy,
        config: BacktestConfig | None = None,
    ) -> None:
        self.strategy = strategy
        self.config = config or BacktestConfig()
        self._equity_curve: list[float] = []
        self._returns: list[float] = []
        self._trades_pnl: list[float] = []
        self._trade_details: list[dict[str, Any]] = []

    def run(
        self,
        cache_dir: Path,
        symbol: str,
        timeframe: str,
    ) -> dict[str, Any]:
        """Run backtest on cached OHLCV; return metrics and trades."""
        df = read_ohlcv(cache_dir, symbol, timeframe)
        if df.empty or len(df) < 200:
            return {
                "equity_curve": [],
                "returns": [],
                "trades": [],
                "trade_details": [],
                "metrics": {},
            }

        tick_size, tick_value = _resolve_tick_params(symbol, self.config)
        bt_config = BacktestConfig(
            initial_equity=self.config.initial_equity,
            slippage_ticks=self.config.slippage_ticks,
            slippage_bps=self.config.slippage_bps,
            tick_size=tick_size,
            tick_value=tick_value,
        )

        equity = bt_config.initial_equity
        self._equity_curve = [equity]
        self._returns = []
        self._trades_pnl = []
        self._trade_details = []
        positions: dict[str, dict[str, Any]] = {}
        context: dict[str, Any] = {"open_positions": positions}

        for i in range(200, len(df)):
            bar = df.iloc[i]
            ohlcv = df.iloc[: i + 1]
            signals = self.strategy.generate_signals(symbol, ohlcv, context)
            for sig in signals:
                if self.strategy.should_enter(symbol, sig, context):
                    price = apply_slippage(float(bar["close"]), sig.side.value, bt_config)
                    positions[symbol] = {
                        "entry_price": price,
                        "entry_time": df.index[i],
                        "side": sig.side,
                        "atr_at_entry": 0.0,
                    }
                    break

            for sym, pos in list(positions.items()):
                exit_sig = self.strategy.should_exit(sym, pos, bar, context)
                if exit_sig:
                    exit_price = float(bar["close"])
                    pnl = _pnl_dollars(sym, pos["entry_price"], exit_price, pos["side"].value, bt_config)
                    equity += pnl
                    self._trades_pnl.append(pnl)
                    self._trade_details.append({
                        "symbol": sym,
                        "side": pos["side"].value,
                        "entry_price": pos["entry_price"],
                        "exit_price": exit_price,
                        "entry_time": str(pos["entry_time"]),
                        "exit_time": str(df.index[i]),
                        "exit_reason": exit_sig.reason,
                        "pnl": pnl,
                    })
                    del positions[sym]

            self._equity_curve.append(equity)
            if self._equity_curve[-2] > 0:
                engine = MathEngine()
                eq_cur = engine._a(equity)
                eq_prev = engine._a(self._equity_curve[-2])
                ret_a = (eq_cur - eq_prev) / eq_prev
                self._returns.append(ret_a.to_float())

        metrics = compute_all_metrics(self._returns, self._equity_curve, self._trades_pnl)
        return {
            "equity_curve": self._equity_curve,
            "returns": self._returns,
            "trades": self._trades_pnl,
            "trade_details": self._trade_details,
            "metrics": metrics,
        }
