"""
Paper broker: in-memory positions, trade history, equity curve, slippage. Thread-safe.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from quantbot.backtest.engine import BacktestConfig, apply_slippage
from quantbot.config import DEFAULT_SYMBOLS
from quantbot.mathlib.math_engine import MathEngine


def _tick_size(symbol: str) -> float:
    inst = DEFAULT_SYMBOLS.get(symbol)
    return inst.tick_size if inst else 0.25


def _tick_value(symbol: str) -> float:
    inst = DEFAULT_SYMBOLS.get(symbol)
    return inst.tick_value if inst else 5.0


def _pnl_dollars(symbol: str, entry: float, exit_price: float, side: str) -> float:
    """PnL in dollars via crystalline Abacus."""
    engine = MathEngine()
    direction = engine._a(1) if side in ("long", "LONG") else engine._a(-1)
    points = (engine._a(exit_price) - engine._a(entry)) * direction
    ts, tv = _tick_size(symbol), _tick_value(symbol)
    if ts <= 0:
        return 0.0
    result = points / engine._a(ts) * engine._a(tv)
    return result.to_float()


def _equity_from_realized(initial_equity: float, trade_history: list) -> float:
    """Current equity = initial + sum(realized PnL) via Abacus."""
    engine = MathEngine()
    total = engine._a(initial_equity)
    for t in trade_history:
        total = total + engine._a(t.pnl)
    return total.to_float()


@dataclass
class _Position:
    symbol: str
    side: str
    entry_price: float
    quantity: float
    entry_time: datetime
    atr_at_entry: float


@dataclass
class _ClosedTrade:
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    quantity: float
    entry_time: datetime
    exit_time: datetime
    pnl: float
    exit_reason: str = ""
    atr_at_entry: float = 0.0
    regime_at_entry: str = ""
    signal_metadata: dict = field(default_factory=dict)


class PaperBroker:
    """Thread-safe paper broker: positions, trades, equity, slippage."""

    def __init__(
        self,
        initial_equity: float = 100_000.0,
        slippage_ticks: float = 0.25,
        slippage_bps: float = 0.5,
    ) -> None:
        self._initial_equity = initial_equity
        self._bt_config = BacktestConfig(
            initial_equity=initial_equity,
            slippage_ticks=slippage_ticks,
            slippage_bps=slippage_bps,
        )
        self._positions: dict[str, _Position] = {}
        self._trade_history: list[_ClosedTrade] = []
        self._equity_curve: list[dict[str, Any]] = []
        self._equity_curve.append({"time": datetime.now(timezone.utc).isoformat(), "equity": initial_equity})
        self._lock = threading.Lock()

    def _bt_config_for_symbol(self, symbol: str) -> BacktestConfig:
        ts = _tick_size(symbol)
        tv = _tick_value(symbol)
        return BacktestConfig(
            initial_equity=self._bt_config.initial_equity,
            slippage_ticks=self._bt_config.slippage_ticks,
            slippage_bps=self._bt_config.slippage_bps,
            tick_size=ts,
            tick_value=tv,
        )

    def open_position(
        self,
        symbol: str,
        side: str,
        price: float,
        quantity: float,
        atr: float,
    ) -> float:
        """Record entry with slippage. Returns fill price. Caller holds 1 position per symbol."""
        cfg = self._bt_config_for_symbol(symbol)
        fill = apply_slippage(price, side, cfg)
        with self._lock:
            self._positions[symbol] = _Position(
                symbol=symbol,
                side=side,
                entry_price=fill,
                quantity=quantity,
                entry_time=datetime.now(timezone.utc),
                atr_at_entry=atr,
            )
        return fill

    def close_position(
        self,
        symbol: str,
        price: float,
        exit_reason: str = "",
        regime_at_entry: str = "",
        signal_metadata: dict | None = None,
    ) -> float | None:
        """Close position; return realized PnL in dollars, or None if no position."""
        with self._lock:
            pos = self._positions.pop(symbol, None)
            if pos is None:
                return None
            pnl = _pnl_dollars(symbol, pos.entry_price, price, pos.side)
            trade = _ClosedTrade(
                symbol=symbol,
                side=pos.side,
                entry_price=pos.entry_price,
                exit_price=price,
                quantity=pos.quantity,
                entry_time=pos.entry_time,
                exit_time=datetime.now(timezone.utc),
                pnl=pnl,
                exit_reason=exit_reason,
                atr_at_entry=pos.atr_at_entry,
                regime_at_entry=regime_at_entry,
                signal_metadata=signal_metadata or {},
            )
            self._trade_history.append(trade)
            eq = _equity_from_realized(self._initial_equity, self._trade_history)
            self._equity_curve.append({"time": datetime.now(timezone.utc).isoformat(), "equity": eq})
            return pnl

    def get_equity(self) -> float:
        """Current equity = initial + sum(realized PnL) via Abacus. Unrealized needs current prices from outside."""
        with self._lock:
            return _equity_from_realized(self._initial_equity, self._trade_history)

    def get_open_positions(self, current_prices: dict[str, float] | None = None) -> list[dict[str, Any]]:
        """Open positions; if current_prices given, include current_price and unrealized_pnl."""
        current_prices = current_prices or {}
        with self._lock:
            out = []
            for sym, pos in self._positions.items():
                entry = {
                    "symbol": pos.symbol,
                    "side": pos.side,
                    "entry_price": pos.entry_price,
                    "quantity": pos.quantity,
                    "entry_time": pos.entry_time.isoformat(),
                    "atr_at_entry": pos.atr_at_entry,
                }
                price = current_prices.get(sym)
                if price is not None:
                    entry["current_price"] = price
                    entry["unrealized_pnl"] = _pnl_dollars(sym, pos.entry_price, price, pos.side)
                out.append(entry)
            return out

    def get_trade_history(self) -> list[dict[str, Any]]:
        """All closed trades."""
        with self._lock:
            return [
                {
                    "symbol": t.symbol,
                    "side": t.side,
                    "entry_price": t.entry_price,
                    "exit_price": t.exit_price,
                    "quantity": t.quantity,
                    "entry_time": t.entry_time.isoformat(),
                    "exit_time": t.exit_time.isoformat(),
                    "pnl": t.pnl,
                    "exit_reason": t.exit_reason,
                    "atr_at_entry": t.atr_at_entry,
                    "regime_at_entry": t.regime_at_entry,
                    "signal_metadata": t.signal_metadata,
                }
                for t in self._trade_history
            ]

    def append_equity_snapshot(self, equity: float) -> None:
        """Append a periodic equity snapshot (unrealized-inclusive). Skips if value unchanged and <10s elapsed."""
        now = datetime.now(timezone.utc)
        with self._lock:
            if self._equity_curve:
                last = self._equity_curve[-1]
                last_time = datetime.fromisoformat(last["time"])
                if last_time.tzinfo is None:
                    last_time = last_time.replace(tzinfo=timezone.utc)
                elapsed = (now - last_time).total_seconds()
                if abs(last["equity"] - equity) < 0.01 and elapsed < 10.0:
                    return
            self._equity_curve.append({"time": now.isoformat(), "equity": round(equity, 2)})
            if len(self._equity_curve) > 5000:
                self._equity_curve = self._equity_curve[-4000:]

    def get_equity_curve(self) -> list[dict[str, Any]]:
        """List of {time, equity} (includes unrealized only implicitly via get_equity)."""
        with self._lock:
            return list(self._equity_curve)

    def get_positions_for_context(self) -> dict[str, dict[str, Any]]:
        """Format expected by strategy context['open_positions']."""
        with self._lock:
            return {
                sym: {
                    "entry_price": p.entry_price,
                    "entry_time": p.entry_time,
                    "side": p.side,
                    "atr_at_entry": p.atr_at_entry,
                }
                for sym, p in self._positions.items()
            }
