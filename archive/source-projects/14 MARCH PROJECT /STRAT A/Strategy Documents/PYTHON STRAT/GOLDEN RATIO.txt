"""
Golden-ratio retracements and phi-extension levels (Custom Math + ICT).
Uses constants: PHI, PI_TIMES_PHI, PHI_EXTENSIONS, GOLDEN_RETRACEMENTS.
"""
from __future__ import annotations

from custom_math.constants import GOLDEN_RETRACEMENTS, PHI_EXTENSIONS


def retracement_levels(high: float, low: float) -> dict[str, float]:
    """
    Given a swing range, return price levels for 0.382 and 0.618 (and 0.5).
    Keys: "0.382", "0.618", "0.5". For bull move (low to high), retracements from high.
    """
    if high <= low:
        return {}
    span = high - low
    return {
        "0.382": high - 0.382 * span,
        "0.5": high - 0.5 * span,
        "0.618": high - 0.618 * span,
    }


def extension_levels(pivot: float, scale: float, direction: str) -> list[float]:
    """
    For each PHI_EXTENSIONS value, compute pivot +/- ext * scale.
    direction in ("above", "below"). scale = ATR or recent range.
    """
    if scale <= 0:
        return []
    if direction == "above":
        return [pivot + ext * scale for ext in PHI_EXTENSIONS]
    if direction == "below":
        return [pivot - ext * scale for ext in PHI_EXTENSIONS]
    return []


def price_near_level(price: float, level: float, tolerance_pct: float) -> bool:
    """True if abs(price - level) / level <= tolerance_pct/100. Guard division by zero."""
    if level == 0:
        return False
    tolerance = tolerance_pct / 100.0
    return abs(price - level) / abs(level) <= tolerance


def price_near_any_level(price: float, levels: list[float], tolerance_pct: float) -> bool:
    """True if price is near any level."""
    for level in levels:
        if price_near_level(price, level, tolerance_pct):
            return True
    return False
