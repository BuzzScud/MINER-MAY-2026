"""Alpha Vantage NEWS_SENTIMENT API: fetch by ticker, map to RawSignal. Use ticker_sentiment when present."""
import os
from datetime import datetime, timezone
from typing import Any

import requests

from backend.sentiment.gatherers import RawSignal
from backend.sentiment.providers.rate_limit import record_call, wait_if_needed

ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query"


def _parse_av_date(ts: str | None) -> datetime:
    """Parse Alpha Vantage time (YYYYMMDDTHHMM) to datetime."""
    if not ts or len(ts) < 8:
        return datetime.now(timezone.utc)
    try:
        # Format can be 20220410T0130 or 2022-04-10T01:30:00
        s = ts.strip().replace("-", "").replace(":", "")
        if "T" in s:
            date_part, time_part = s.split("T", 1)
            year = int(date_part[:4])
            month = int(date_part[4:6]) if len(date_part) >= 6 else 1
            day = int(date_part[6:8]) if len(date_part) >= 8 else 1
            hour = int(time_part[:2]) if len(time_part) >= 2 else 0
            minute = int(time_part[2:4]) if len(time_part) >= 4 else 0
            second = int(time_part[4:6]) if len(time_part) >= 6 else 0
            return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
        return datetime.now(timezone.utc)
    except (ValueError, IndexError):
        return datetime.now(timezone.utc)


def fetch_alphavantage(symbol: str) -> list[RawSignal]:
    """Fetch news sentiment for symbol from Alpha Vantage; return RawSignal list. Enforces 12s rate limit."""
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY", "").strip()
    if not api_key:
        raise ValueError("ALPHA_VANTAGE_API_KEY is not configured")

    wait_if_needed("alphavantage")
    params = {
        "function": "NEWS_SENTIMENT",
        "tickers": symbol,
        "limit": 50,
        "apikey": api_key,
    }
    try:
        resp = requests.get(ALPHA_VANTAGE_BASE, params=params, timeout=20)
        record_call("alphavantage")
    except requests.RequestException as e:
        raise RuntimeError(f"Alpha Vantage API request failed: {e}") from e

    if resp.status_code == 429:
        record_call("alphavantage")
        raise RuntimeError("Rate limit exceeded for Alpha Vantage (5/min). Try again in a minute.")
    if resp.status_code != 200:
        raise RuntimeError(f"Alpha Vantage API error: {resp.status_code} {resp.text[:200]}")

    data = resp.json()
    if not isinstance(data, dict):
        return []
    feed = data.get("feed")
    if not isinstance(feed, list):
        return []
    signals: list[RawSignal] = []
    for item in feed:
        if not isinstance(item, dict):
            continue
        title = item.get("title") or ""
        summary = item.get("summary") or ""
        text = f"{title} {summary}".strip() or "(no content)"
        if len(text) > 2000:
            text = text[:2000]
        url_link = item.get("url")
        ts = _parse_av_date(item.get("time_published") or item.get("published_time"))
        # ticker_sentiment: list of {ticker, relevance_score, ticker_sentiment_score, ...}
        ticker_sentiments = item.get("ticker_sentiment") or []
        sentiment_score: float | None = None
        for ts_entry in ticker_sentiments:
            if isinstance(ts_entry, dict) and ts_entry.get("ticker") == symbol:
                score = ts_entry.get("ticker_sentiment_score")
                if score is not None:
                    try:
                        sentiment_score = float(score)
                    except (TypeError, ValueError):
                        pass
                break
        sig: dict[str, Any] = {
            "asset_symbol": symbol,
            "source": "alphavantage",
            "text": text,
            "timestamp": ts,
            "url": url_link,
        }
        if sentiment_score is not None:
            sig["sentiment_score"] = sentiment_score
        signals.append(sig)
    return signals
