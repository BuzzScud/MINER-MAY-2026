"""Per-provider rate limiting. Alpha Vantage: 5/min (12s min interval). Others: 1 req/sec."""
import threading
import time

_lock = threading.Lock()
_last_call: dict[str, float] = {}

# Minimum seconds between calls per provider (Alpha Vantage free: 5/min = 12s)
# yfinance: 2s recommended to avoid Yahoo rate limits (per yfinance best practices)
ALPHA_VANTAGE_MIN_INTERVAL = 12.0
YAHOO_MIN_INTERVAL = 2.0
DEFAULT_MIN_INTERVAL = 1.0


def wait_if_needed(provider: str) -> None:
    """Block until the minimum interval has passed since the last call for this provider."""
    if provider == "alphavantage":
        interval = ALPHA_VANTAGE_MIN_INTERVAL
    elif provider == "yfinance":
        interval = YAHOO_MIN_INTERVAL
    else:
        interval = DEFAULT_MIN_INTERVAL
    with _lock:
        last = _last_call.get(provider, 0.0)
        elapsed = time.monotonic() - last
        if elapsed < interval:
            time.sleep(interval - elapsed)
        _last_call[provider] = time.monotonic()


def record_call(provider: str) -> None:
    """Record that a call was made (called after successful request)."""
    with _lock:
        _last_call[provider] = time.monotonic()
