"""
Fibonacci retracements, 50% equilibrium (PD Array), OTE, Fib-time indices (ICT).
Uses constants: FIB_RETRACEMENTS, FIB_SEQUENCE.
"""
from __future__ import annotations

from custom_math.constants import FIB_RETRACEMENTS, FIB_SEQUENCE


def fib_retracement_levels(high: float, low: float) -> dict[str, float]:
    """
    Levels for 0.236, 0.382, 0.5, 0.618, 0.786 (high - ratio * (high - low)).
    Keys are ratio strings.
    """
    if high <= low:
        return {}
    span = high - low
    return {str(r): high - r * span for r in FIB_RETRACEMENTS}


def equilibrium_50(high: float, low: float) -> float:
    """PD Array 50% equilibrium. Guard: if high <= low return 0."""
    if high <= low:
        return 0.0
    return (high + low) / 2.0


def in_discount_zone(price: float, high: float, low: float) -> bool:
    """Price <= 50% equilibrium (below 50% = discount)."""
    eq = equilibrium_50(high, low)
    if eq == 0:
        return False
    return price <= eq


def in_premium_zone(price: float, high: float, low: float) -> bool:
    """Price >= 50% equilibrium (above 50% = premium)."""
    eq = equilibrium_50(high, low)
    if eq == 0:
        return False
    return price >= eq


def price_at_ote(price: float, high: float, low: float, tolerance_pct: float) -> bool:
    """
    True if price is within tolerance of 0.618 retracement (OTE 61.8%).
    OTE band 61.8-78.6%: check 0.618 as primary.
    """
    if high <= low:
        return False
    span = high - low
    ote_level = high - 0.618 * span
    tolerance = tolerance_pct / 100.0
    if abs(ote_level) < 1e-12:
        return abs(price - ote_level) <= tolerance * abs(high)
    return abs(price - ote_level) / abs(ote_level) <= tolerance


def _price_near_retracement(price: float, high: float, low: float, ratio: float, tolerance_pct: float) -> bool:
    """True if price is within tolerance_pct of the given retracement level (from high)."""
    if high <= low:
        return False
    span = high - low
    level = high - ratio * span
    tolerance = tolerance_pct / 100.0
    if abs(level) < 1e-12:
        return abs(price - level) <= tolerance * abs(high)
    return abs(price - level) / abs(level) <= tolerance


def price_in_ote_zone(price: float, high: float, low: float, tolerance_pct: float) -> bool:
    """
    True if price is within tolerance of 0.618 or 0.786 retracement (ICT OTE band 61.8-78.6%).
    Use for confluence so entries align with full OTE zone.
    """
    if high <= low:
        return False
    return (
        _price_near_retracement(price, high, low, 0.618, tolerance_pct)
        or _price_near_retracement(price, high, low, 0.786, tolerance_pct)
    )


def fib_time_indices_from_swing(swing_bar_index: int, max_offset: int = 500) -> set[int]:
    """
    Bar indices that are Fib counts from swing: swing_bar_index + f for f in FIB_SEQUENCE.
    Capped by max_offset to avoid huge sets.
    """
    result: set[int] = set()
    for f in FIB_SEQUENCE:
        idx = swing_bar_index + f
        if 0 <= idx <= swing_bar_index + max_offset:
            result.add(idx)
    return result
