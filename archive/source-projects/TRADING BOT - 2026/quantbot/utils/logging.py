"""Structured JSON logging via structlog."""
from __future__ import annotations

import logging
import sys
from typing import Any

try:
    import structlog
    HAS_STRUCTLOG = True
except ImportError:
    HAS_STRUCTLOG = False


def configure_logging(level: str = "INFO", json: bool = True) -> None:
    if HAS_STRUCTLOG:
        structlog.configure(
            processors=[
                structlog.stdlib.filter_by_level,
                structlog.stdlib.add_logger_name,
                structlog.stdlib.add_log_level,
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer(),
            ],
            wrapper_class=structlog.stdlib.BoundLogger,
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            cache_logger_on_first_use=True,
        )
    else:
        logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO), stream=sys.stdout)


def get_logger(name: str) -> Any:
    if HAS_STRUCTLOG:
        return structlog.get_logger(name)
    return logging.getLogger(name)
