"""Metrics and helpers for admin panels."""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func

EST = ZoneInfo("America/New_York")


def get_new_users_count(user_model, days: int = 7) -> int:
    """Return count of users created in the last N days."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    return user_model.query.filter(user_model.created_at >= cutoff).count()


def get_user_active_time(activity_model) -> str:
    """Return total active time (sum of per-user session spans) as formatted string."""
    try:
        rows = (
            activity_model.query.with_entities(
                func.min(activity_model.timestamp).label("first_ts"),
                func.max(activity_model.timestamp).label("last_ts"),
            )
            .group_by(activity_model.username)
            .all()
        )
        total_seconds = 0
        for row in rows:
            if row.first_ts and row.last_ts:
                total_seconds += int((row.last_ts - row.first_ts).total_seconds())
        if total_seconds < 60:
            return "< 1 min"
        if total_seconds < 3600:
            return f"{total_seconds // 60}m"
        hours = total_seconds // 3600
        mins = (total_seconds % 3600) // 60
        if mins:
            return f"{hours}h {mins}m"
        return f"{hours}h"
    except Exception:
        return "—"


def get_peak_user_time(activity_model) -> str:
    """Return the hour (EST) with most activity as formatted string."""
    try:
        from collections import Counter

        rows = activity_model.query.with_entities(activity_model.timestamp).all()
        hours_est = []
        for r in rows:
            if not r or not r.timestamp:
                continue
            ts = r.timestamp
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            hour_est = ts.astimezone(EST).hour
            hours_est.append(hour_est)
        if not hours_est:
            return "—"
        hour = Counter(hours_est).most_common(1)[0][0]
        h12 = hour % 12 or 12
        ampm = "AM" if hour < 12 else "PM"
        return f"{h12}:00 {ampm} EST"
    except Exception:
        return "—"
