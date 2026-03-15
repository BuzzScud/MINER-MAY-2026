"""Massive (Polygon) news API: fetch news by ticker, map to RawSignal. Use insights sentiment when present."""
import os
from datetime import datetime, timezone
from typing import Any

import requests

from backend.sentiment.gatherers import RawSignal
from backend.sentiment.providers.rate_limit import record_call, wait_if_needed

MASSIVE_BASE = "https://api.polygon.io"
# Alternative: https://api.massive.com if key is for Massive domain


def _sentiment_to_score(sentiment: str) -> float:
    """Map Massive insight sentiment label to score in [-1, 1]."""
    if not sentiment:
        return 0.0
    s = sentiment.lower().strip()
    if s == "positive":
        return 0.5
    if s == "negative":
        return -0.5
    return 0.0


def _parse_utc(ts: str | None) -> datetime:
    """Parse RFC3339 UTC string (e.g. 2024-06-24T18:33:53Z) to datetime."""
    if not ts:
        return datetime.now(timezone.utc)
    try:
        normalized = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except Exception:
        return datetime.now(timezone.utc)


def fetch_massive(symbol: str) -> list[RawSignal]:
    """Fetch news for symbol from Massive/Polygon; return RawSignal list. Enforces rate limit."""
    api_key = os.getenv("MASSIVE_API_KEY", "").strip()
    if not api_key:
        raise ValueError("MASSIVE_API_KEY is not configured")

    wait_if_needed("massive")
    url = f"{MASSIVE_BASE}/v2/reference/news"
    params = {"ticker": symbol, "limit": 50, "apiKey": api_key}
    try:
        resp = requests.get(url, params=params, timeout=15)
        record_call("massive")
    except requests.RequestException as e:
        raise RuntimeError(f"Massive API request failed: {e}") from e

    if resp.status_code == 429:
        record_call("massive")
        raise RuntimeError("Rate limit exceeded for Massive. Try again in a minute.")
    if resp.status_code != 200:
        raise RuntimeError(f"Massive API error: {resp.status_code} {resp.text[:200]}")

    data = resp.json()
    results = data.get("results") or []
    signals: list[RawSignal] = []
    for item in results:
        title = item.get("title") or ""
        desc = item.get("description") or ""
        text = f"{title} {desc}".strip() or "(no content)"
        if len(text) > 2000:
            text = text[:2000]
        url_link = item.get("article_url") or item.get("url")
        published = item.get("published_utc")
        ts = _parse_utc(published)
        insights = item.get("insights") or []
        sentiment_score: float | None = None
        for ins in insights:
            if isinstance(ins, dict) and ins.get("ticker") == symbol:
                sent = ins.get("sentiment")
                if sent is not None:
                    sentiment_score = _sentiment_to_score(str(sent))
                break
        sig: dict[str, Any] = {
            "asset_symbol": symbol,
            "source": "massive",
            "text": text,
            "timestamp": ts,
            "url": url_link,
        }
        if sentiment_score is not None:
            sig["sentiment_score"] = sentiment_score
        signals.append(sig)
    return signals
