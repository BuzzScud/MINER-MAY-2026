"""Modular gatherers: fetch raw text signals from Reddit (PRAW) and Yahoo Finance RSS (feedparser)."""
from datetime import datetime, timezone
from typing import List, Optional, TypedDict

try:
    from typing import NotRequired
except ImportError:
    from typing_extensions import NotRequired

import feedparser

# Raw signal contract: same shape for all gatherers. Optional sentiment_score lets providers supply pre-computed score.
RawSignal = TypedDict(
    "RawSignal",
    {
        "asset_symbol": str,
        "source": str,
        "text": str,
        "timestamp": datetime,
        "url": Optional[str],
        "sentiment_score": NotRequired[float],
    },
)

DEFAULT_SYMBOLS = ["AAPL", "BTC"]
REDDIT_LIMIT_PER_SUB = 50
RSS_ENTRIES_PER_FEED = 30
YAHOO_RSS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US"


def _parse_rss_date(entry: dict) -> datetime:
    """Parse published_parsed or published into timezone-aware datetime."""
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        import time as _time
        t = _time.mktime(entry.published_parsed)
        return datetime.fromtimestamp(t, tz=timezone.utc)
    return datetime.now(timezone.utc)


def gather_reddit(symbols: Optional[List[str]] = None) -> List[RawSignal]:
    """Fetch recent posts from configured subreddits; filter by symbol mentions. Returns list of RawSignal."""
    symbols = symbols or DEFAULT_SYMBOLS
    signals: List[RawSignal] = []
    try:
        import os
        import praw
    except ImportError:
        return signals

    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    user_agent = os.getenv("REDDIT_USER_AGENT", "SentimentIndicator/1.0")
    if not client_id or not client_secret:
        return signals

    subreddits = ["wallstreetbets", "stocks"]
    symbol_set = {s.upper() for s in symbols}
    # Match whole-word or ticker-like (e.g. $AAPL, AAPL)
    def mentions_symbol(text: str) -> List[str]:
        if not text:
            return []
        upper = text.upper()
        found = []
        for sym in symbol_set:
            if f"${sym}" in upper or f" {sym} " in upper or upper.startswith(sym + " ") or upper.endswith(" " + sym):
                found.append(sym)
            elif upper == sym or f"({sym})" in upper:
                found.append(sym)
        return found

    try:
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=user_agent,
        )
        for sub_name in subreddits:
            try:
                sub = reddit.subreddit(sub_name)
                for post in sub.new(limit=REDDIT_LIMIT_PER_SUB):
                    title = getattr(post, "title", "") or ""
                    body = getattr(post, "selftext", "") or ""
                    text = f"{title} {body}".strip()
                    for sym in mentions_symbol(text):
                        ts = datetime.fromtimestamp(getattr(post, "created_utc", 0), tz=timezone.utc)
                        signals.append({
                            "asset_symbol": sym,
                            "source": "reddit",
                            "text": text[:2000],
                            "timestamp": ts,
                            "url": f"https://reddit.com{getattr(post, 'permalink', '')}" or None,
                        })
            except Exception:
                continue
    except Exception:
        pass
    return signals


def gather_rss(symbols: Optional[List[str]] = None) -> List[RawSignal]:
    """Fetch Yahoo Finance RSS per symbol; return list of RawSignal."""
    symbols = symbols or DEFAULT_SYMBOLS
    signals: List[RawSignal] = []
    for symbol in symbols:
        url = YAHOO_RSS_URL.format(symbol=symbol)
        try:
            feed = feedparser.parse(url)
        except Exception:
            continue
        for entry in feed.entries[:RSS_ENTRIES_PER_FEED]:
            title = entry.get("title") or ""
            summary = entry.get("summary", entry.get("description", "")) or ""
            if isinstance(summary, str) and len(summary) > 2000:
                summary = summary[:2000]
            text = f"{title} {summary}".strip()
            ts = _parse_rss_date(entry)
            signals.append({
                "asset_symbol": symbol.upper(),
                "source": "rss",
                "text": text,
                "timestamp": ts,
                "url": entry.get("link"),
            })
    return signals


def gather_all(symbols: Optional[List[str]] = None) -> List[RawSignal]:
    """Run all gatherers and return combined raw signals."""
    out: List[RawSignal] = []
    out.extend(gather_reddit(symbols))
    out.extend(gather_rss(symbols))
    return out
