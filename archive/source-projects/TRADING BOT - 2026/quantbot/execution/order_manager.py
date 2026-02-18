"""
Order manager: idempotent (unique client_order_id), retry queue, fill reconciliation.
"""
from __future__ import annotations

import asyncio
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from quantbot.execution.broker import BrokerInterface, OrderRequest, OrderResult


@dataclass
class ManagedOrder:
    """Order with lifecycle."""
    client_order_id: str
    request: OrderRequest
    result: OrderResult | None = None
    retries: int = 0


class OrderManager:
    """Idempotent order management with retry queue."""

    def __init__(self, broker: BrokerInterface, max_retries: int = 3) -> None:
        self._broker = broker
        self._max_retries = max_retries
        self._pending: dict[str, ManagedOrder] = {}
        self._retry_queue: deque[ManagedOrder] = deque()

    def _next_client_id(self) -> str:
        return f"qb_{uuid.uuid4().hex[:12]}"

    async def place(self, req: OrderRequest) -> OrderResult:
        """Place order with unique client_order_id if not set."""
        if req.client_order_id and req.client_order_id in self._pending:
            existing = self._pending[req.client_order_id]
            if existing.result and existing.result.status in ("filled", "cancelled"):
                return existing.result
        client_id = req.client_order_id or self._next_client_id()
        req = OrderRequest(
            symbol=req.symbol,
            side=req.side,
            quantity=req.quantity,
            order_type=req.order_type,
            limit_price=req.limit_price,
            stop_price=req.stop_price,
            client_order_id=client_id,
            oco_group=req.oco_group,
            parent_order_id=req.parent_order_id,
        )
        managed = ManagedOrder(client_order_id=client_id, request=req)
        self._pending[client_id] = managed
        try:
            result = await self._broker.place_order(req)
            managed.result = result
            if result.status not in ("filled", "cancelled") and managed.retries < self._max_retries:
                self._retry_queue.append(managed)
            return result
        except Exception:
            if managed.retries < self._max_retries:
                managed.retries += 1
                self._retry_queue.append(managed)
            raise

    async def process_retry_queue(self) -> int:
        """Process one batch of retries; return count processed."""
        processed = 0
        for _ in range(len(self._retry_queue)):
            if not self._retry_queue:
                break
            managed = self._retry_queue.popleft()
            try:
                result = await self._broker.place_order(managed.request)
                managed.result = result
                managed.retries += 1
                processed += 1
                if result.status not in ("filled", "cancelled") and managed.retries < self._max_retries:
                    self._retry_queue.append(managed)
            except Exception:
                if managed.retries < self._max_retries:
                    self._retry_queue.append(managed)
        return processed

    def get_order(self, client_order_id: str) -> ManagedOrder | None:
        return self._pending.get(client_order_id)

    def reconcile_fills(self, reported_fills: list[dict[str, Any]]) -> None:
        """Update managed orders from broker fill report (stub)."""
        for fill in reported_fills:
            cid = fill.get("client_order_id")
            if cid and cid in self._pending:
                mo = self._pending[cid]
                if mo.result:
                    mo.result = OrderResult(
                        order_id=mo.result.order_id,
                        client_order_id=mo.result.client_order_id,
                        filled_quantity=float(fill.get("filled_quantity", mo.result.filled_quantity)),
                        average_price=float(fill.get("average_price", mo.result.average_price)),
                        status=fill.get("status", mo.result.status),
                        message=mo.result.message,
                    )
