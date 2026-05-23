"""Yahoo Finance news via yfinance: Ticker.get_news(count, tab). No API key. Rate limit: 2s min interval per docs."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any

from backend.sentiment.gatherers import RawSignal
from backend.sentiment.providers.rate_limit import record_call, wait_if_needed


def _parse_pub_date(pub_date: str | None) -> datetime:
    """Parse ISO 8601 pubDate (e.g. 2026-02-19T11:00:29Z) to timezone-aware datetime."""
    if not pub_date or not isinstance(pub_date, str):
        return datetime.now(timezone.utc)
    try:
        normalized = pub_date.strip().replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except (ValueError, TypeError):
        return datetime.now(timezone.utc)


def _url_from_content(content: dict) -> str | None:
    """Extract article URL from content canonicalUrl or clickThroughUrl per yfinance response shape."""
    for key in ("canonicalUrl", "clickThroughUrl"):
        obj = content.get(key)
        if isinstance(obj, dict) and obj.get("url"):
            return obj["url"]
    return None


def fetch_yfinance(symbol: str) -> list[RawSignal]:
    """
    Fetch news for symbol from Yahoo Finance via yfinance.
    Uses Ticker.get_news(count=50, tab='news') per yfinance docs.
    Response shape: list of { "id", "content" } with content having title, summary, pubDate, canonicalUrl/clickThroughUrl.
    No API key required. Enforces 2s min interval per rate-limit best practices.
    """
    wait_if_needed("yfinance")
    try:
        import yfinance as yf
    except ImportError:
        raise RuntimeError("yfinance is not installed. Install with: pip install yfinance")

    try:
        ticker = yf.Ticker(symbol)
        # Per docs: get_news(count=10, tab='news'); tab options: "news", "all", "press releases"
        news_list = ticker.get_news(count=50, tab="news")
        record_call("yfinance")
    except Exception as e:
        err_msg = str(e).strip().lower()
        if "rate" in err_msg or "limit" in err_msg or "too many" in err_msg:
            record_call("yfinance")
            raise RuntimeError("Yahoo Finance rate limit reached. Try again in a minute.") from e
        raise RuntimeError(f"Yahoo Finance request failed: {e}") from e

    if not isinstance(news_list, list):
        return []
    signals: list[RawSignal] = []
    for item in news_list:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, dict):
            continue
        title = content.get("title") or ""
        summary = content.get("summary") or content.get("description") or ""
        if isinstance(summary, str) and len(summary) > 2000:
            summary = summary[:2000]
        text = f"{title} {summary}".strip() or "(no content)"
        if len(text) > 2000:
            text = text[:2000]
        url_link = _url_from_content(content)
        ts = _parse_pub_date(content.get("pubDate") or content.get("displayTime"))
        sig: dict[str, Any] = {
            "asset_symbol": symbol.upper(),
            "source": "yfinance",
            "text": text,
            "timestamp": ts,
            "url": url_link,
        }
        signals.append(sig)
    return signals
