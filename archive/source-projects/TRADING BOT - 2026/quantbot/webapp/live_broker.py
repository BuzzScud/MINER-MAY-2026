"""
Live broker adapter: synchronous wrapper around IBBroker with the same interface
as PaperBroker, so BotRunner can swap between them transparently.
Runs an internal asyncio event loop in a dedicated thread for IB async calls.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from quantbot.config import DEFAULT_SYMBOLS
from quantbot.execution.broker import IBBroker, OrderRequest, OrderType
from quantbot.mathlib.math_engine import MathEngine
from quantbot.signals.base import Side

logger = logging.getLogger(__name__)


def _tick_size(symbol: str) -> float:
    inst = DEFAULT_SYMBOLS.get(symbol)
    return inst.tick_size if inst else 0.25


def _tick_value(symbol: str) -> float:
    inst = DEFAULT_SYMBOLS.get(symbol)
    return inst.tick_value if inst else 5.0


def _pnl_dollars(symbol: str, entry: float, exit_price: float, side: str) -> float:
    engine = MathEngine()
    direction = engine._a(1) if side in ("long", "LONG") else engine._a(-1)
    points = (engine._a(exit_price) - engine._a(entry)) * direction
    ts, tv = _tick_size(symbol), _tick_value(symbol)
    if ts <= 0:
        return 0.0
    result = points / engine._a(ts) * engine._a(tv)
    return result.to_float()


@dataclass
class _LivePosition:
    symbol: str
    side: str
    entry_price: float
    quantity: float
    entry_time: datetime
    atr_at_entry: float
    ib_order_id: str = ""


@dataclass
class _LiveClosedTrade:
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


class LiveBrokerAdapter:
    """Synchronous adapter wrapping IBBroker, matching PaperBroker's interface."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 7496,
        client_id: int = 1,
        account: str = "",
        initial_equity: float = 100_000.0,
    ) -> None:
        self._host = host
        self._port = port
        self._client_id = client_id
        self._account = account
        self._initial_equity = initial_equity
        self._ib_broker = IBBroker(host=host, port=port, client_id=client_id, account=account)
        self._positions: dict[str, _LivePosition] = {}
        self._trade_history: list[_LiveClosedTrade] = []
        self._equity_curve: list[dict[str, Any]] = []
        self._equity_curve.append({"time": datetime.now(timezone.utc).isoformat(), "equity": initial_equity})
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._loop_thread: threading.Thread | None = None
        self._connected = False

    def _ensure_loop(self) -> asyncio.AbstractEventLoop:
        """Get or create the asyncio event loop running in a background thread."""
        if self._loop is not None and self._loop.is_running():
            return self._loop
        self._loop = asyncio.new_event_loop()
        self._loop_thread = threading.Thread(target=self._loop.run_forever, daemon=True)
        self._loop_thread.start()
        return self._loop

    def _run_async(self, coro: Any) -> Any:
        """Run an async coroutine synchronously via the background event loop."""
        loop = self._ensure_loop()
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        return future.result(timeout=30)

    def connect(self) -> None:
        """Connect to IB Gateway/TWS."""
        self._run_async(self._ib_broker.connect())
        self._connected = True
        logger.info("LiveBrokerAdapter connected to IB")

    def disconnect(self) -> None:
        """Disconnect from IB Gateway/TWS."""
        try:
            self._run_async(self._ib_broker.disconnect())
        except Exception as exc:
            logger.warning("Disconnect error: %s", exc)
        self._connected = False
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._loop.stop)
            self._loop = None

    def is_connected(self) -> bool:
        return self._connected and self._ib_broker.is_connected()

    def open_position(
        self,
        symbol: str,
        side: str,
        price: float,
        quantity: float,
        atr: float,
    ) -> float:
        """Place a real market order via IB and record the position. Returns fill price."""
        if not self.is_connected():
            raise RuntimeError("LiveBrokerAdapter not connected to IB")

        order_side = Side.LONG if side.lower() == "long" else Side.SHORT
        req = OrderRequest(
            symbol=symbol,
            side=order_side,
            quantity=quantity,
            order_type=OrderType.MARKET,
        )

        result = self._run_async(self._ib_broker.place_order(req))

        fill_price = result.average_price if result.average_price > 0 else price
        with self._lock:
            self._positions[symbol] = _LivePosition(
                symbol=symbol,
                side=side,
                entry_price=fill_price,
                quantity=result.filled_quantity if result.filled_quantity > 0 else quantity,
                entry_time=datetime.now(timezone.utc),
                atr_at_entry=atr,
                ib_order_id=result.order_id,
            )

        logger.info("Live ENTRY %s %s @ %.5f (IB order %s, status=%s)",
                     side.upper(), symbol, fill_price, result.order_id, result.status)
        return fill_price

    def close_position(
        self,
        symbol: str,
        price: float,
        exit_reason: str = "",
        regime_at_entry: str = "",
        signal_metadata: dict | None = None,
    ) -> float | None:
        """Close a position by placing a market order in the opposite direction. Returns PnL."""
        with self._lock:
            pos = self._positions.get(symbol)
            if pos is None:
                return None

        if not self.is_connected():
            logger.error("Cannot close %s: not connected", symbol)
            return None

        close_side = Side.SHORT if pos.side.lower() == "long" else Side.LONG
        req = OrderRequest(
            symbol=symbol,
            side=close_side,
            quantity=pos.quantity,
            order_type=OrderType.MARKET,
        )

        result = self._run_async(self._ib_broker.place_order(req))

        exit_price = result.average_price if result.average_price > 0 else price
        pnl = _pnl_dollars(symbol, pos.entry_price, exit_price, pos.side)

        with self._lock:
            self._positions.pop(symbol, None)
            trade = _LiveClosedTrade(
                symbol=symbol,
                side=pos.side,
                entry_price=pos.entry_price,
                exit_price=exit_price,
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
            eq = self._compute_equity()
            self._equity_curve.append({"time": datetime.now(timezone.utc).isoformat(), "equity": eq})

        logger.info("Live EXIT %s (%s) @ %.5f PnL=$%.2f (IB order %s)",
                     symbol, exit_reason, exit_price, pnl, result.order_id)
        return pnl

    def _compute_equity(self) -> float:
        engine = MathEngine()
        total = engine._a(self._initial_equity)
        for t in self._trade_history:
            total = total + engine._a(t.pnl)
        return total.to_float()

    def get_equity(self) -> float:
        with self._lock:
            return self._compute_equity()

    def get_open_positions(self, current_prices: dict[str, float] | None = None) -> list[dict[str, Any]]:
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
                cp = current_prices.get(sym)
                if cp is not None:
                    entry["current_price"] = cp
                    entry["unrealized_pnl"] = _pnl_dollars(sym, pos.entry_price, cp, pos.side)
                out.append(entry)
            return out

    def get_trade_history(self) -> list[dict[str, Any]]:
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
        with self._lock:
            return list(self._equity_curve)

    def get_positions_for_context(self) -> dict[str, dict[str, Any]]:
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
