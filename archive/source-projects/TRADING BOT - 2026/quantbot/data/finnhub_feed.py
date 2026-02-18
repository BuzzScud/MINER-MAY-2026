"""
Finnhub data feed for NQ, ES, EURUSD, GBPUSD.
Uses Finnhub REST candle API; API key from QUANTBOT_FINNHUB_API_KEY.
Stock/forex candle endpoints; same contract as YahooFeed.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

BASE_URL = "https://finnhub.io/api/v1"
CACHE_TTL_SEC = 30.0
# Free tier: 60 API calls/minute; space requests to stay under limit
FINNHUB_DELAY_BETWEEN_REQUESTS_SEC = 1.0

# Internal symbol -> Finnhub stock/crypto symbol (proxies for futures: QQQ≈NQ, SPY≈ES)
STOCK_SYMBOL_MAP = {
    "NQ": "QQQ",
    "ES": "SPY",
    "EURUSD": None,  # forex
    "GBPUSD": None,
}

FOREX_SYMBOL_MAP = {
    "EURUSD": "OANDA:EUR_USD",
    "GBPUSD": "OANDA:GBP_USD",
}


def _parse_period(period: str) -> tuple[datetime, datetime]:
    """Return (from_dt, to_dt) in UTC for period like 5d or 2d."""
    now = datetime.now(timezone.utc)
    to_dt = now
    if period.endswith("d"):
        days = int(period[:-1])
        from_dt = now - timedelta(days=days)
    else:
        from_dt = now - timedelta(days=5)
    return from_dt, to_dt


def _interval_to_resolution(interval: str) -> str:
    """Map interval string to Finnhub resolution: 1, 5, 15, 30, 60, D, W, M."""
    interval = interval.strip().lower()
    if interval == "1m" or interval == "1min":
        return "1"
    if interval.endswith("m"):
        try:
            n = int(interval.replace("m", "").replace("min", "") or "1")
            if n <= 1:
                return "1"
            if n <= 5:
                return "5"
            if n <= 15:
                return "15"
            if n <= 30:
                return "30"
        except ValueError:
            pass
    if interval.endswith("h") or "hour" in interval:
        try:
            n = int(interval.replace("h", "").replace("hour", "").strip() or "1")
            return "60" if n >= 1 else "1"
        except ValueError:
            pass
    if interval == "1d" or interval == "day":
        return "D"
    return "5"


def _response_to_dataframe(data: dict[str, Any], symbol: str) -> pd.DataFrame:
    """Convert Finnhub candle response (t, o, h, l, c, v arrays) to OHLCV DataFrame."""
    if not data or data.get("s") != "ok":
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    t_arr = data.get("t") or []
    o_arr = data.get("o") or []
    h_arr = data.get("h") or []
    l_arr = data.get("l") or []
    c_arr = data.get("c") or []
    v_arr = data.get("v") or []
    if not t_arr:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    n = len(t_arr)
    rows = []
    index_vals = []
    for i in range(n):
        ts = t_arr[i]
        if ts is None:
            continue
        index_vals.append(pd.Timestamp(ts, unit="s", tz="UTC"))
        rows.append({
            "open": float(o_arr[i]) if i < len(o_arr) else 0,
            "high": float(h_arr[i]) if i < len(h_arr) else 0,
            "low": float(l_arr[i]) if i < len(l_arr) else 0,
            "close": float(c_arr[i]) if i < len(c_arr) else 0,
            "volume": int(v_arr[i]) if i < len(v_arr) else 0,
        })
    if not rows:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    df = pd.DataFrame(rows, index=index_vals)
    return df[["open", "high", "low", "close", "volume"]]


class FinnhubFeed:
    """OHLCV feed from Finnhub REST API. Same contract as YahooFeed."""

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

    def _request(
        self,
        path: str,
        params: dict[str, str | int] | None = None,
    ) -> dict[str, Any]:
        url = f"{BASE_URL}{path}"
        p = dict(params or {})
        if self._api_key:
            p["token"] = self._api_key
        try:
            r = self._session_get().get(url, params=p, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.warning("Finnhub request failed %s: %s", path, e)
            return {}

    def _fetch_stock_candle(self, symbol: str, resolution: str, from_ts: int, to_ts: int) -> pd.DataFrame:
        """Fetch one symbol via stock/candle endpoint."""
        data = self._request(
            "stock/candle",
            {"symbol": symbol, "resolution": resolution, "from": from_ts, "to": to_ts},
        )
        return _response_to_dataframe(data, symbol)

    def _fetch_forex_candle(self, symbol: str, resolution: str, from_ts: int, to_ts: int) -> pd.DataFrame:
        """Fetch one symbol via forex/candle endpoint (OANDA pair)."""
        data = self._request(
            "forex/candle",
            {"symbol": symbol, "resolution": resolution, "from": from_ts, "to": to_ts},
        )
        return _response_to_dataframe(data, symbol)

    def fetch_all_ohlcv(
        self,
        symbols: list[str] | None = None,
        interval: str = "5m",
        period: str = "5d",
    ) -> dict[str, pd.DataFrame]:
        """Fetch OHLCV for all symbols. Updates cache."""
        if not self._api_key:
            logger.warning("QUANTBOT_FINNHUB_API_KEY not set; returning cache only")
            with self._lock:
                return dict(self._ohlcv_cache)

        syms = symbols or ["NQ", "ES", "EURUSD", "GBPUSD"]
        from_dt, to_dt = _parse_period(period)
        from_ts = int(from_dt.timestamp())
        to_ts = int(to_dt.timestamp())
        resolution = _interval_to_resolution(interval)

        result: dict[str, pd.DataFrame] = {}
        for i, sym in enumerate(syms):
            if i > 0:
                time.sleep(FINNHUB_DELAY_BETWEEN_REQUESTS_SEC)
            s = sym.upper()
            if s in FOREX_SYMBOL_MAP:
                fh_sym = FOREX_SYMBOL_MAP[s]
                df = self._fetch_forex_candle(fh_sym, resolution, from_ts, to_ts)
            else:
                fh_sym = STOCK_SYMBOL_MAP.get(s, s)
                if fh_sym:
                    df = self._fetch_stock_candle(fh_sym, resolution, from_ts, to_ts)
                else:
                    df = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
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
