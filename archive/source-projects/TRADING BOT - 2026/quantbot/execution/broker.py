"""
Broker abstraction: IB primary (limit, OCO, bracket, iceberg, TWAP).
Real IBBroker implementation with contract mapping for NQ, ES, EURUSD, GBPUSD.
"""
from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

from quantbot.signals.base import Side

logger = logging.getLogger(__name__)

CONTRACT_TIMEOUT_SEC = 30
ORDER_FILL_TIMEOUT_SEC = 60


class OrderType(str, Enum):
    LIMIT = "limit"
    MARKET = "market"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


@dataclass
class OrderRequest:
    """Order request."""
    symbol: str
    side: Side
    quantity: float
    order_type: OrderType
    limit_price: float | None = None
    stop_price: float | None = None
    client_order_id: str | None = None
    oco_group: str | None = None
    parent_order_id: str | None = None


@dataclass
class OrderResult:
    """Order result."""
    order_id: str
    client_order_id: str
    filled_quantity: float
    average_price: float
    status: str
    message: str | None = None


class BrokerInterface(ABC):
    """Abstract broker."""

    @abstractmethod
    async def connect(self) -> None:
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        ...

    @abstractmethod
    async def place_order(self, req: OrderRequest) -> OrderResult:
        ...

    @abstractmethod
    async def cancel_order(self, order_id: str) -> bool:
        ...

    @abstractmethod
    async def get_positions(self) -> dict[str, float]:
        """Symbol -> net quantity."""
        ...


def _make_contract(symbol: str) -> Any:
    """Create an ib_insync Contract for the given symbol."""
    from ib_insync import Future, Forex

    symbol_upper = symbol.upper().strip()
    if symbol_upper in ("NQ", "MNQ"):
        return Future(symbol_upper, exchange="CME", currency="USD")
    if symbol_upper in ("ES", "MES"):
        return Future(symbol_upper, exchange="CME", currency="USD")
    if symbol_upper in ("YM", "MYM"):
        return Future(symbol_upper, exchange="CBOT", currency="USD")
    if symbol_upper in ("RTY", "M2K"):
        return Future(symbol_upper, exchange="CME", currency="USD")
    if symbol_upper == "EURUSD":
        return Forex("EURUSD")
    if symbol_upper == "GBPUSD":
        return Forex("GBPUSD")
    if symbol_upper == "USDJPY":
        return Forex("USDJPY")
    if symbol_upper == "AUDUSD":
        return Forex("AUDUSD")
    raise ValueError(f"Unknown symbol for IB contract mapping: {symbol_upper}")


def _make_ib_order(req: OrderRequest) -> Any:
    """Create an ib_insync Order from an OrderRequest."""
    from ib_insync import MarketOrder, LimitOrder, StopOrder, StopLimitOrder

    action = "BUY" if req.side == Side.LONG else "SELL"
    quantity = abs(req.quantity)

    if req.order_type == OrderType.MARKET:
        order = MarketOrder(action, quantity)
    elif req.order_type == OrderType.LIMIT:
        if req.limit_price is None:
            raise ValueError("limit_price required for LIMIT order")
        order = LimitOrder(action, quantity, req.limit_price)
    elif req.order_type == OrderType.STOP:
        if req.stop_price is None:
            raise ValueError("stop_price required for STOP order")
        order = StopOrder(action, quantity, req.stop_price)
    elif req.order_type == OrderType.STOP_LIMIT:
        if req.stop_price is None or req.limit_price is None:
            raise ValueError("stop_price and limit_price required for STOP_LIMIT order")
        order = StopLimitOrder(action, quantity, req.limit_price, req.stop_price)
    else:
        raise ValueError(f"Unsupported order type: {req.order_type}")

    if req.oco_group:
        order.ocaGroup = req.oco_group
        order.ocaType = 1
    if req.parent_order_id:
        order.parentId = int(req.parent_order_id)

    return order


class IBBroker(BrokerInterface):
    """Interactive Brokers via ib_insync with real order execution."""

    def __init__(self, host: str = "127.0.0.1", port: int = 7497, client_id: int = 1, account: str = "") -> None:
        self._host = host
        self._port = port
        self._client_id = client_id
        self._account = account
        self._ib: Any = None
        self._trade_log: list[dict[str, Any]] = []

    def is_connected(self) -> bool:
        return self._ib is not None and self._ib.isConnected()

    async def connect(self) -> None:
        try:
            from ib_insync import IB
        except ImportError:
            raise RuntimeError("ib_insync not installed; pip install ib_insync")
        self._ib = IB()
        await self._ib.connectAsync(self._host, self._port, clientId=self._client_id)
        logger.info("IB connected: host=%s port=%d client_id=%d", self._host, self._port, self._client_id)

    async def disconnect(self) -> None:
        if self._ib and self._ib.isConnected():
            self._ib.disconnect()
            logger.info("IB disconnected")
        self._ib = None

    async def place_order(self, req: OrderRequest) -> OrderResult:
        """Place a real order via IB. Qualifies the contract, places the order, and waits for initial fill."""
        if not self.is_connected():
            raise RuntimeError("IBBroker not connected")

        contract = _make_contract(req.symbol)
        qualified = await self._ib.qualifyContractsAsync(contract)
        if not qualified:
            raise RuntimeError(f"Failed to qualify contract for {req.symbol}")
        contract = qualified[0]

        ib_order = _make_ib_order(req)
        trade = self._ib.placeOrder(contract, ib_order)
        logger.info("Order placed: %s %s %s qty=%.2f order_id=%s",
                     req.side.value, req.symbol, req.order_type.value, req.quantity, trade.order.orderId)

        filled_qty = 0.0
        avg_price = 0.0
        status = "submitted"

        try:
            while not trade.isDone():
                await asyncio.sleep(0.1)
                self._ib.sleep(0)
                if trade.orderStatus.status in ("Filled", "Cancelled", "Inactive"):
                    break

            status = trade.orderStatus.status.lower()
            filled_qty = float(trade.orderStatus.filled)
            avg_price = float(trade.orderStatus.avgFillPrice)
        except Exception as exc:
            logger.error("Order fill wait error: %s", exc)
            status = "error"

        result = OrderResult(
            order_id=str(trade.order.orderId),
            client_order_id=req.client_order_id or str(trade.order.orderId),
            filled_quantity=filled_qty,
            average_price=avg_price,
            status=status,
            message=trade.orderStatus.whyHeld if hasattr(trade.orderStatus, "whyHeld") else None,
        )

        self._trade_log.append({
            "order_id": result.order_id,
            "symbol": req.symbol,
            "side": req.side.value,
            "quantity": req.quantity,
            "filled_quantity": filled_qty,
            "average_price": avg_price,
            "status": status,
            "order_type": req.order_type.value,
        })

        return result

    async def cancel_order(self, order_id: str) -> bool:
        """Cancel an open order by its order ID."""
        if not self.is_connected():
            return False
        try:
            open_orders = self._ib.openOrders()
            for order in open_orders:
                if str(order.orderId) == str(order_id):
                    self._ib.cancelOrder(order)
                    logger.info("Order cancelled: %s", order_id)
                    return True
            logger.warning("Order not found for cancellation: %s", order_id)
            return False
        except Exception as exc:
            logger.error("Cancel order error: %s", exc)
            return False

    async def get_positions(self) -> dict[str, float]:
        if self._ib is None:
            return {}
        positions = self._ib.positions(self._account) if self._account else self._ib.positions()
        out: dict[str, float] = {}
        for p in positions:
            sym = getattr(p.contract, "symbol", str(p.contract))
            out[sym] = out.get(sym, 0) + float(p.position)
        return out

    async def get_account_summary(self) -> dict[str, Any]:
        """Return account summary (equity, buying power, etc.)."""
        if not self.is_connected():
            return {}
        try:
            account_values = self._ib.accountSummary(self._account) if self._account else self._ib.accountSummary()
            summary: dict[str, Any] = {}
            for av in account_values:
                summary[av.tag] = av.value
            return summary
        except Exception as exc:
            logger.error("Account summary error: %s", exc)
            return {}

    def get_trade_log(self) -> list[dict[str, Any]]:
        """Return log of all orders placed this session."""
        return list(self._trade_log)

    @staticmethod
    async def test_connection(host: str, port: int, client_id: int, account: str = "") -> dict[str, Any]:
        """Test IB Gateway/TWS connection. Returns dict with ok, message, and account info."""
        try:
            from ib_insync import IB
        except ImportError:
            return {"ok": False, "message": "ib_insync not installed. Run: pip install ib_insync"}

        ib = IB()
        try:
            await asyncio.wait_for(
                ib.connectAsync(host, port, clientId=client_id),
                timeout=10.0,
            )
        except asyncio.TimeoutError:
            return {"ok": False, "message": f"Connection timed out ({host}:{port}). Is IB Gateway/TWS running?"}
        except ConnectionRefusedError:
            return {"ok": False, "message": f"Connection refused at {host}:{port}. Start IB Gateway/TWS first."}
        except Exception as exc:
            return {"ok": False, "message": f"Connection failed: {exc}"}

        try:
            managed_accounts = ib.managedAccounts()
            account_id = account if account else (managed_accounts[0] if managed_accounts else "")
            net_liq = ""
            try:
                summary = ib.accountSummary(account_id) if account_id else ib.accountSummary()
                for av in summary:
                    if av.tag == "NetLiquidation":
                        net_liq = av.value
                        break
            except Exception:
                pass
            ib.disconnect()
            return {
                "ok": True,
                "message": f"Connected to IB Gateway at {host}:{port}",
                "accounts": managed_accounts,
                "account_id": account_id,
                "net_liquidation": net_liq,
            }
        except Exception as exc:
            try:
                ib.disconnect()
            except Exception:
                pass
            return {"ok": False, "message": f"Connected but failed to read account: {exc}"}
