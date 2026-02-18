"""
MASSIVE (Polygon.io) data feed for NQ, ES, EURUSD, GBPUSD.
Uses Polygon REST API; API key from QUANTBOT_MASSIVE_API_KEY only.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

BASE_URL = "https://api.polygon.io"
CACHE_TTL_SEC = 30.0
# Free tier: 5 API calls per minute
POLYGON_MAX_CALLS_PER_MINUTE = 5
POLYGON_WINDOW_SEC = 60

# CME quarter month codes: H=Mar, M=Jun, U=Sep, Z=Dec
CME_MONTHS = "HMUZ"


def _front_month_futures_ticker(base: str, dt: datetime | None = None) -> str:
    """Return Polygon-style front-month futures ticker (e.g. ESH25, NQH25)."""
    dt = dt or datetime.now(timezone.utc)
    year = dt.year % 100
    month_1based = dt.month
    # next quarter index 0..3 for H,M,U,Z
    quarter_index = (month_1based - 1) // 3
    if quarter_index >= 4:
        quarter_index = 0
        year += 1
    month_code = CME_MONTHS[quarter_index]
    return f"{base}{month_code}{year}"


def _massive_ticker(symbol: str, dt: datetime | None = None) -> str:
    """Map internal symbol to Polygon ticker."""
    s = symbol.upper()
    if s == "NQ":
        return _front_month_futures_ticker("NQ", dt)
    if s == "ES":
        return _front_month_futures_ticker("ES", dt)
    if s == "EURUSD":
        return "C:EURUSD"
    if s == "GBPUSD":
        return "C:GBPUSD"
    return symbol


def _parse_period(period: str) -> tuple[datetime, datetime]:
    """Return (from_dt, to_dt) in UTC for period like 5d."""
    now = datetime.now(timezone.utc)
    to_dt = now
    if period.endswith("d"):
        days = int(period[:-1])
        from_dt = now - timedelta(days=days)
    else:
        from_dt = now - timedelta(days=5)
    return from_dt, to_dt


def _interval_to_multiplier_timespan(interval: str) -> tuple[int, str]:
    """Return (multiplier, timespan) for Polygon API."""
    interval = interval.strip().lower()
    if interval.endswith("m") or interval == "1min":
        try:
            mult = int(interval.replace("m", "").replace("min", "") or "1")
            return (mult, "minute")
        except ValueError:
            pass
    if interval.endswith("h") or "hour" in interval:
        try:
            mult = int(interval.replace("h", "").replace("hour", "").strip() or "1")
            return (mult, "hour")
        except ValueError:
            pass
    if interval == "1d" or interval == "day":
        return (1, "day")
    return (5, "minute")


def _response_to_dataframe(results: list[dict[str, Any]], symbol: str) -> pd.DataFrame:
    """Convert Polygon results (o,h,l,c,v,t) to standardized OHLCV DataFrame."""
    if not results:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    rows = []
    index_vals = []
    for r in results:
        t_ms = r.get("t")
        if t_ms is None:
            continue
        index_vals.append(pd.Timestamp(t_ms, unit="ms", tz="UTC"))
        rows.append({
            "open": float(r.get("o", 0)),
            "high": float(r.get("h", 0)),
            "low": float(r.get("l", 0)),
            "close": float(r.get("c", 0)),
            "volume": int(r.get("v", 0)),
        })
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    df = pd.DataFrame(rows, index=index_vals)
    df = df[["open", "high", "low", "close", "volume"]]
    return df


class MassiveFeed:
    """OHLCV feed from MASSIVE (Polygon.io) REST API. Same contract as YahooFeed."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = (api_key or "").strip()
        self._ohlcv_cache: dict[str, pd.DataFrame] = {}
        self._price_cache: dict[str, float] = {}
        self._last_fetch_time: float = 0.0
        self._lock = threading.Lock()
        self._session: Any = None
        self._request_times: list[float] = []

    def _session_get(self) -> Any:
        try:
            import requests
            if self._session is None:
                self._session = requests.Session()
            return self._session
        except ImportError:
            raise RuntimeError("requests not installed; pip install requests")

    def _wait_for_rate_limit(self) -> None:
        """Ensure we do not exceed POLYGON_MAX_CALLS_PER_MINUTE per POLYGON_WINDOW_SEC."""
        now = time.time()
        with self._lock:
            self._request_times = [t for t in self._request_times if now - t < POLYGON_WINDOW_SEC]
            while len(self._request_times) >= POLYGON_MAX_CALLS_PER_MINUTE and self._request_times:
                oldest = self._request_times[0]
                wait = (oldest + POLYGON_WINDOW_SEC) - now
                if wait > 0:
                    self._lock.release()
                    try:
                        time.sleep(min(wait, POLYGON_WINDOW_SEC))
                    finally:
                        self._lock.acquire()
                    now = time.time()
                    self._request_times = [t for t in self._request_times if now - t < POLYGON_WINDOW_SEC]
                else:
                    break

    def _request(
        self,
        path: str,
        params: dict[str, str | int] | None = None,
    ) -> dict[str, Any]:
        self._wait_for_rate_limit()
        url = f"{BASE_URL}{path}"
        p = dict(params or {})
        if self._api_key:
            p["apiKey"] = self._api_key
        try:
            r = self._session_get().get(url, params=p, timeout=30)
            r.raise_for_status()
            with self._lock:
                self._request_times.append(time.time())
            return r.json()
        except Exception as e:
            logger.warning("MASSIVE request failed %s: %s", path, e)
            return {}

    def fetch_all_ohlcv(
        self,
        symbols: list[str] | None = None,
        interval: str = "5m",
        period: str = "5d",
    ) -> dict[str, pd.DataFrame]:
        """Fetch OHLCV for all symbols. Updates cache."""
        if not self._api_key:
            logger.warning("QUANTBOT_MASSIVE_API_KEY not set; returning cache only")
            with self._lock:
                return dict(self._ohlcv_cache)

        syms = symbols or ["NQ", "ES", "EURUSD", "GBPUSD"]
        from_dt, to_dt = _parse_period(period)
        from_str = from_dt.strftime("%Y-%m-%d")
        to_str = to_dt.strftime("%Y-%m-%d")
        mult, timespan = _interval_to_multiplier_timespan(interval)

        result: dict[str, pd.DataFrame] = {}
        for sym in syms:
            ticker = _massive_ticker(sym)
            path = f"/v2/aggs/ticker/{ticker}/range/{mult}/{timespan}/{from_str}/{to_str}"
            data = self._request(path, {"limit": 50000, "sort": "asc"})
            results = (data.get("results") or []) if isinstance(data, dict) else []
            df = _response_to_dataframe(results, sym)
            result[sym] = df

        with self._lock:
            self._ohlcv_cache.update(result)
            for sym, df in result.items():
                if not df.empty:
                    self._price_cache[sym] = float(df["close"].iloc[-1])
            self._last_fetch_time = time.time()

        return result

    def get_cached_ohlcv(self, symbol: str) -> pd.DataFrame:
        """Return cached OHLCV without fetching."""
        with self._lock:
            return self._ohlcv_cache.get(
                symbol,
                pd.DataFrame(columns=["open", "high", "low", "close", "volume"]),
            )

    def get_cached_prices(self) -> dict[str, float]:
        """Return cached last prices."""
        with self._lock:
            return dict(self._price_cache)
