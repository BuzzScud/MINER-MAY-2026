"""
Barchart OnDemand data feed for NQ, ES, EURUSD, GBPUSD.
Uses getHistory.json; API key from QUANTBOT_BARCHART_API_KEY only.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

BASE_URL = "https://ondemand.websol.barchart.com"
CACHE_TTL_SEC = 30.0
# Conservative rate limit to respect Barchart OnDemand limits
MIN_FETCH_INTERVAL_SEC = 10.0

# Barchart symbols: front month futures ES*1, NQ*1; forex often same as ours
BARCHART_SYMBOL_MAP = {
    "NQ": "NQ*1",
    "ES": "ES*1",
    "EURUSD": "EURUSD",
    "GBPUSD": "GBPUSD",
}


def _to_barchart(symbol: str) -> str:
    return BARCHART_SYMBOL_MAP.get(symbol.upper(), symbol)


def _parse_period(period: str) -> tuple[str, str]:
    """Return (startDate, endDate) in yyyymmdd format."""
    now = datetime.now(timezone.utc)
    if period.endswith("d"):
        try:
            days = int(period[:-1])
        except ValueError:
            days = 5
    else:
        days = 5
    end_dt = now
    start_dt = now - timedelta(days=days)
    return start_dt.strftime("%Y%m%d"), end_dt.strftime("%Y%m%d")


def _interval_minutes(interval: str) -> int:
    """Return interval in minutes for Barchart (e.g. 5m -> 5)."""
    interval = interval.strip().lower()
    if interval.endswith("m") or interval == "1min":
        try:
            return int(interval.replace("m", "").replace("min", "") or "1")
        except ValueError:
            pass
    if interval.endswith("h"):
        try:
            return int(interval.replace("h", "").strip() or "1") * 60
        except ValueError:
            pass
    return 5


def _response_to_dataframe(results: list[dict[str, Any]]) -> pd.DataFrame:
    """Convert Barchart getHistory results to standardized OHLCV DataFrame."""
    if not results:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    rows = []
    index_vals = []
    for r in results:
        ts = r.get("timestamp")
        if not ts:
            continue
        try:
            idx = pd.to_datetime(ts, utc=True)
        except Exception:
            continue
        index_vals.append(idx)
        rows.append({
            "open": float(r.get("open", 0)),
            "high": float(r.get("high", 0)),
            "low": float(r.get("low", 0)),
            "close": float(r.get("close", 0)),
            "volume": int(r.get("volume", 0)),
        })
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    df = pd.DataFrame(rows, index=index_vals)
    df = df[["open", "high", "low", "close", "volume"]]
    return df


class BarchartFeed:
    """OHLCV feed from Barchart OnDemand getHistory. Same contract as YahooFeed."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = (api_key or "").strip()
        self._ohlcv_cache: dict[str, pd.DataFrame] = {}
        self._price_cache: dict[str, float] = {}
        self._last_fetch_time: float = 0.0
        self._lock = threading.Lock()
        self._session: Any = None

    def _session_get(self) -> Any:
        try:
            import requests
            if self._session is None:
                self._session = requests.Session()
            return self._session
        except ImportError:
            raise RuntimeError("requests not installed; pip install requests")

    def _request(self, params: dict[str, str | int]) -> dict[str, Any]:
        url = f"{BASE_URL}/getHistory.json"
        p = dict(params)
        if self._api_key:
            p["apikey"] = self._api_key
        try:
            r = self._session_get().get(url, params=p, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.warning("Barchart request failed: %s", e)
            return {}

    def fetch_all_ohlcv(
        self,
        symbols: list[str] | None = None,
        interval: str = "5m",
        period: str = "5d",
    ) -> dict[str, pd.DataFrame]:
        """Fetch OHLCV for all symbols. Updates cache. Respects rate limit."""
        if not self._api_key:
            logger.warning("QUANTBOT_BARCHART_API_KEY not set; returning cache only")
            with self._lock:
                return dict(self._ohlcv_cache)

        now = time.time()
        with self._lock:
            if (now - self._last_fetch_time) < MIN_FETCH_INTERVAL_SEC and self._ohlcv_cache:
                return dict(self._ohlcv_cache)

        syms = symbols or ["NQ", "ES", "EURUSD", "GBPUSD"]
        start_date, end_date = _parse_period(period)
        interval_min = _interval_minutes(interval)
        max_records = 2000

        result: dict[str, pd.DataFrame] = {}
        for sym in syms:
            bc_symbol = _to_barchart(sym)
            data = self._request({
                "symbol": bc_symbol,
                "type": "minutes",
                "startDate": start_date,
                "endDate": end_date,
                "interval": interval_min,
                "maxRecords": max_records,
                "order": "asc",
            })
            status = data.get("status") or {}
            if status.get("code") != 200:
                result[sym] = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
                continue
            results = data.get("results") or []
            df = _response_to_dataframe(results)
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
