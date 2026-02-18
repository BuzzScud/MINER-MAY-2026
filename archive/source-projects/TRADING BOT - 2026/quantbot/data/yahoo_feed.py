"""
Yahoo Finance data feed for NQ, ES, EURUSD, GBPUSD.
Uses yf.download() for batch fetching; extracts prices from OHLCV last close.
In-memory cache to avoid rate limits.
"""
from __future__ import annotations

import threading
import time
from typing import Any

import pandas as pd

YAHOO_SYMBOL_MAP = {
    "NQ": "NQ=F",
    "ES": "ES=F",
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
}

CACHE_TTL_SEC = 8.0
# Rate limit: Yahoo/yfinance is IP-based; stay under ~2 req per 5 sec to avoid YFRateLimitError
MIN_FETCH_INTERVAL_SEC = 5.0


def _to_yahoo(symbol: str) -> str:
    return YAHOO_SYMBOL_MAP.get(symbol.upper(), symbol)


def _standardize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure columns: open, high, low, close, volume; index = datetime."""
    if df.empty:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    out = df.copy()
    col_map = {"Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume"}
    for old, new in col_map.items():
        if old in out.columns:
            out = out.rename(columns={old: new})
    required = ["open", "high", "low", "close", "volume"]
    for c in required:
        if c not in out.columns:
            out[c] = 0.0 if c == "volume" else float("nan")
    out = out[required]
    out = out.dropna(subset=["open", "high", "low", "close"], how="all")
    if not out.empty:
        out.index = pd.to_datetime(out.index, utc=True)
    return out


class YahooFeed:
    """Batch-fetch OHLCV from Yahoo Finance with caching."""

    def __init__(
        self,
        symbol_map: dict[str, str] | None = None,
    ) -> None:
        self._symbol_map = symbol_map or dict(YAHOO_SYMBOL_MAP)
        self._ohlcv_cache: dict[str, pd.DataFrame] = {}
        self._price_cache: dict[str, float] = {}
        self._last_fetch_time: float = 0.0
        self._lock = threading.Lock()

    def fetch_all_ohlcv(
        self,
        symbols: list[str] | None = None,
        interval: str = "5m",
        period: str = "5d",
    ) -> dict[str, pd.DataFrame]:
        """Batch-fetch OHLCV for all symbols in one call. Updates cache. Respects rate limit."""
        import yfinance as yf

        now = time.time()
        with self._lock:
            if (now - self._last_fetch_time) < MIN_FETCH_INTERVAL_SEC and self._ohlcv_cache:
                return dict(self._ohlcv_cache)

        syms = symbols or list(self._symbol_map.keys())
        yahoo_tickers = [_to_yahoo(s) for s in syms]
        ticker_string = " ".join(yahoo_tickers)

        try:
            raw = yf.download(
                ticker_string,
                period=period,
                interval=interval,
                auto_adjust=True,
                group_by="ticker",
                threads=True,
                progress=False,
            )
        except Exception:
            return dict(self._ohlcv_cache)

        result: dict[str, pd.DataFrame] = {}
        for sym in syms:
            yahoo_sym = _to_yahoo(sym)
            try:
                if len(syms) == 1:
                    r = raw
                    if isinstance(r.columns, pd.MultiIndex) and r.columns.nlevels >= 2:
                        if yahoo_sym in r.columns.get_level_values(0):
                            r = r[yahoo_sym].copy()
                    df = _standardize_ohlcv(r)
                else:
                    if yahoo_sym in raw.columns.get_level_values(0):
                        df = _standardize_ohlcv(raw[yahoo_sym])
                    else:
                        df = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
            except Exception:
                df = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
            result[sym] = df

        with self._lock:
            self._ohlcv_cache.update(result)
            for sym, df in result.items():
                if not df.empty:
                    self._price_cache[sym] = float(df["close"].iloc[-1])
            self._last_fetch_time = time.time()

        return result

    def fetch_ohlcv(
        self,
        symbol: str,
        interval: str = "5m",
        period: str = "5d",
    ) -> pd.DataFrame:
        """Single-symbol OHLCV; uses batch internally and returns from cache."""
        now = time.time()
        with self._lock:
            cached = self._ohlcv_cache.get(symbol)
            if cached is not None and not cached.empty and (now - self._last_fetch_time) < CACHE_TTL_SEC:
                return cached

        result = self.fetch_all_ohlcv([symbol], interval=interval, period=period)
        return result.get(symbol, pd.DataFrame(columns=["open", "high", "low", "close", "volume"]))

    def fetch_all_prices(self, symbols: list[str] | None = None) -> dict[str, float]:
        """Latest close for each symbol. Extracted from cached OHLCV."""
        syms = symbols or list(self._symbol_map.keys())
        with self._lock:
            return {s: self._price_cache.get(s, 0.0) for s in syms}

    def get_cached_ohlcv(self, symbol: str) -> pd.DataFrame:
        """Return cached OHLCV without triggering a fetch."""
        with self._lock:
            return self._ohlcv_cache.get(symbol, pd.DataFrame(columns=["open", "high", "low", "close", "volume"]))

    def get_cached_prices(self) -> dict[str, float]:
        """Return cached prices without triggering a fetch."""
        with self._lock:
            return dict(self._price_cache)
