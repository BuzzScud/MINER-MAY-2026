"""Finnhub company-news API: fetch news by symbol, map to RawSignal. VADER used on text."""
from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from backend.sentiment.gatherers import RawSignal
from backend.sentiment.providers.rate_limit import record_call, wait_if_needed

FINNHUB_BASE = "https://finnhub.io/api/v1"


def _parse_ts(ts: int | str | None) -> datetime:
    """Unix timestamp (seconds or ms) or parseable value to timezone-aware datetime."""
    if ts is None:
        return datetime.now(timezone.utc)
    try:
        n = int(ts)
        if n > 1e12:
            n = n // 1000
        return datetime.fromtimestamp(n, tz=timezone.utc)
    except (ValueError, OSError, TypeError):
        return datetime.now(timezone.utc)


def fetch_finnhub(symbol: str) -> list[RawSignal]:
    """Fetch company news for symbol from Finnhub; return RawSignal list. Enforces rate limit."""
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if not api_key:
        raise ValueError("FINNHUB_API_KEY is not configured")

    wait_if_needed("finnhub")
    to_date = datetime.now(timezone.utc)
    from_date = to_date - timedelta(days=7)
    params = {
        "symbol": symbol,
        "from": from_date.strftime("%Y-%m-%d"),
        "to": to_date.strftime("%Y-%m-%d"),
        "token": api_key,
    }
    try:
        resp = requests.get(f"{FINNHUB_BASE}/company-news", params=params, timeout=15)
        record_call("finnhub")
    except requests.RequestException as e:
        raise RuntimeError(f"Finnhub API request failed: {e}") from e

    if resp.status_code == 429:
        record_call("finnhub")
        raise RuntimeError("Rate limit exceeded for Finnhub. Try again in a minute.")
    if resp.status_code != 200:
        raise RuntimeError(f"Finnhub API error: {resp.status_code} {resp.text[:200]}")

    data = resp.json()
    if not isinstance(data, list):
        return []
    signals: list[RawSignal] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        title = item.get("headline") or item.get("title") or ""
        summary = item.get("summary") or ""
        text = f"{title} {summary}".strip() or "(no content)"
        if len(text) > 2000:
            text = text[:2000]
        url_link = item.get("url")
        ts = _parse_ts(item.get("datetime") or item.get("publishedDate"))
        sig: dict[str, Any] = {
            "asset_symbol": symbol,
            "source": "finnhub",
            "text": text,
            "timestamp": ts,
            "url": url_link,
        }
        signals.append(sig)
    return signals
