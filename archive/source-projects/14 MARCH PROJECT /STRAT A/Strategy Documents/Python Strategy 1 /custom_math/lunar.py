"""
Lunar phase from datetime (Custom Math LUNAR_MONTH). Moon filter for buy/sell rules.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from custom_math.constants import LUNAR_MONTH

# Well-known new moon epoch (2000-01-06 18:14 UTC) for synodic cycle
_NEW_MOON_EPOCH = datetime(2000, 1, 6, 18, 14, 0, tzinfo=timezone.utc)


def _parse_timestamp(ts: str | Any) -> datetime | None:
    """Parse ISO timestamp from bar_data.timestamp; return naive UTC or None if unparseable."""
    if ts is None:
        return None
    s = str(ts).strip().replace("Z", "+00:00")
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def lunar_day(dt: datetime) -> float:
    """Day in synodic month (0 to ~29.53). Uses LUNAR_MONTH and fixed new-moon epoch."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = dt - _NEW_MOON_EPOCH
    days_since = delta.total_seconds() / 86400.0
    return days_since % LUNAR_MONTH


def lunar_phase(dt: datetime) -> float:
    """Phase 0-1 (0=new, 0.5=full, 1=next new)."""
    day = lunar_day(dt)
    return (day % LUNAR_MONTH) / LUNAR_MONTH


def moon_filter_allows_buy(phase: float, rule: str) -> bool:
    """
    rule: "waxing" (0 to 0.5), "waning" (0.5 to 1), "full" (0.45-0.55), "new" (0-0.05 or 0.95-1), "any" (True).
    """
    rule = (rule or "any").strip().lower()
    if rule == "any":
        return True
    if rule == "waxing":
        return 0 < phase < 0.5
    if rule == "waning":
        return 0.5 < phase < 1.0
    if rule == "full":
        return 0.45 <= phase <= 0.55
    if rule == "new":
        return phase <= 0.05 or phase >= 0.95
    return True


def moon_filter_allows_sell(phase: float, rule: str) -> bool:
    """Same rules as moon_filter_allows_buy."""
    rule = (rule or "any").strip().lower()
    if rule == "any":
        return True
    if rule == "waxing":
        return 0 < phase < 0.5
    if rule == "waning":
        return 0.5 < phase < 1.0
    if rule == "full":
        return 0.45 <= phase <= 0.55
    if rule == "new":
        return phase <= 0.05 or phase >= 0.95
    return True
