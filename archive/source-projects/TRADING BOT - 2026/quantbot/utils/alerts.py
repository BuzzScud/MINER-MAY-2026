"""Alerts: Discord/Telegram on fills, breaches, errors."""
from __future__ import annotations

import os
from typing import Any

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False


def send_telegram(message: str) -> bool:
    """Send message to Telegram (env: QUANTBOT_TELEGRAM_BOT_TOKEN, QUANTBOT_TELEGRAM_CHAT_ID)."""
    token = os.environ.get("QUANTBOT_TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("QUANTBOT_TELEGRAM_CHAT_ID")
    if not token or not chat_id or not HAS_HTTPX:
        return False
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        with httpx.Client() as client:
            r = client.post(url, json={"chat_id": chat_id, "text": message}, timeout=10.0)
        return r.is_success
    except Exception:
        return False


def send_discord(message: str) -> bool:
    """Send message to Discord webhook (env: QUANTBOT_DISCORD_WEBHOOK)."""
    webhook = os.environ.get("QUANTBOT_DISCORD_WEBHOOK")
    if not webhook or not HAS_HTTPX:
        return False
    try:
        with httpx.Client() as client:
            r = client.post(webhook, json={"content": message}, timeout=10.0)
        return r.is_success
    except Exception:
        return False


def alert(message: str, channels: list[str] | None = None) -> None:
    """Send to Telegram and/or Discord. channels: ['telegram','discord'] or None = both if configured."""
    if channels is None:
        channels = ["telegram", "discord"]
    if "telegram" in channels:
        send_telegram(message)
    if "discord" in channels:
        send_discord(message)
