"""
Data feed abstraction: real-time ticks/bars.
Primary: Interactive Brokers via ib_insync.
"""
from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncIterator

import pandas as pd


@dataclass
class Bar:
    """OHLCV bar."""
    symbol: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    timestamp: datetime


@dataclass
class Tick:
    """Single tick."""
    symbol: str
    price: float
    size: float
    timestamp: datetime


class DataFeed(ABC):
    """Abstract real-time data feed."""

    @abstractmethod
    async def connect(self) -> None:
        """Connect to broker feed."""
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Disconnect."""
        ...

    @abstractmethod
    async def subscribe_bars(self, symbols: list[str], timeframe: str) -> None:
        """Subscribe to bar updates for symbols."""
        ...

    @abstractmethod
    async def stream_bars(self) -> AsyncIterator[Bar]:
        """Stream bars as they arrive."""
        ...


class IBFeed(DataFeed):
    """Interactive Brokers feed via ib_insync."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 7497,
        client_id: int = 1,
    ) -> None:
        self._host = host
        self._port = port
        self._client_id = client_id
        self._ib = None
        self._bars_queue: asyncio.Queue[Bar] = asyncio.Queue()

    async def connect(self) -> None:
        try:
            from ib_insync import IB
            self._ib = IB()
            await self._ib.connectAsync(self._host, self._port, clientId=self._client_id)
        except ImportError:
            raise RuntimeError("ib_insync not installed; pip install ib_insync")

    async def disconnect(self) -> None:
        if self._ib is not None and self._ib.isConnected():
            self._ib.disconnect()
            self._ib = None

    async def subscribe_bars(self, symbols: list[str], timeframe: str) -> None:
        """Subscribe; bars pushed to queue (stub: real impl would use reqHistoricalData or reqMktData)."""
        pass

    async def stream_bars(self) -> AsyncIterator[Bar]:
        while True:
            try:
                bar = await asyncio.wait_for(self._bars_queue.get(), timeout=1.0)
                yield bar
            except asyncio.TimeoutError:
                await asyncio.sleep(0.1)
                continue
