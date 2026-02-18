"""Prometheus exporter for CPU/mem/latency."""
from __future__ import annotations

from typing import Any

try:
    from prometheus_client import Counter, Gauge, Histogram, start_http_server
    HAS_PROM = True
except ImportError:
    HAS_PROM = False

TRADES_TOTAL: Any = None
LATENCY_SECONDS: Any = None
EQUITY_GAUGE: Any = None


def init_telemetry(port: int = 9090) -> bool:
    if not HAS_PROM:
        return False
    global TRADES_TOTAL, LATENCY_SECONDS, EQUITY_GAUGE
    TRADES_TOTAL = Counter("quantbot_trades_total", "Total trades", ["symbol", "side"])
    LATENCY_SECONDS = Histogram("quantbot_latency_seconds", "Latency", ["op"])
    EQUITY_GAUGE = Gauge("quantbot_equity", "Account equity")
    start_http_server(port)
    return True


def record_trade(symbol: str, side: str) -> None:
    if TRADES_TOTAL is not None:
        TRADES_TOTAL.labels(symbol=symbol, side=side).inc()


def record_equity(equity: float) -> None:
    if EQUITY_GAUGE is not None:
        EQUITY_GAUGE.set(equity)


def record_latency(op: str, seconds: float) -> None:
    if LATENCY_SECONDS is not None:
        LATENCY_SECONDS.labels(op=op).observe(seconds)
