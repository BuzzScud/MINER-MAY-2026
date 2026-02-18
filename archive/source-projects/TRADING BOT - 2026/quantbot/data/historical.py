"""
Historical data: fetch 1s–D bars (e.g. last 2 years) from broker, cache.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

import pandas as pd

if TYPE_CHECKING:
    pass


def load_historical_ohlcv(
    symbol: str,
    timeframe: str,
    start: datetime | None = None,
    end: datetime | None = None,
    years_back: int = 2,
    cache_dir: Path | None = None,
) -> pd.DataFrame:
    """
    Load OHLCV from cache (Parquet) or return empty DataFrame.
    Actual IB fetch should be done by a separate job and stored via storage.write_ohlcv.
    """
    if cache_dir is None:
        cache_dir = Path("data/cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{symbol}_{timeframe}.parquet"
    if path.exists():
        return pd.read_parquet(path)
    if end is None:
        end = datetime.utcnow()
    if start is None:
        start = end - timedelta(days=365 * years_back)
    return pd.DataFrame(
        columns=["open", "high", "low", "close", "volume"],
        index=pd.DatetimeIndex([], name="timestamp"),
    )


def fetch_historical_ib(
    symbol: str,
    timeframe: str,
    start: datetime,
    end: datetime,
) -> pd.DataFrame:
    """
    Fetch historical bars from IB (stub).
    Real impl: use ib_insync reqHistoricalData with appropriate durationStr.
    """
    return pd.DataFrame(
        columns=["open", "high", "low", "close", "volume"],
        index=pd.DatetimeIndex([], name="timestamp"),
    )
