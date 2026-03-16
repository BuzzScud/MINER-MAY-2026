"""
Clock-lattice mapping from Custom Math thesis (12-fold symmetry, geometric positions).
Maps price/change to ring and position (0-11). Prime-aligned positions 3, 6, 9.
Used for support/resistance and trend structure. Asset-agnostic.
"""
from __future__ import annotations


def price_to_clock_position(price: float, scale: float = 10.0) -> tuple[int, int]:
    """
    Map price to clock position (0-11) and magnitude/ring.
    Mirrors Crystalline: scaled mod 12, magnitude = scaled // 12.
    Returns (position, magnitude).
    """
    if price != price or price < 0:  # NaN or negative
        return (0, 0)
    scaled = int(price * scale)
    position = int(scaled % 12)
    magnitude = int(scaled // 12) % 100
    return (position, magnitude)


def price_change_to_ring(delta: float, scale: float = 100.0) -> int | None:
    """
    Map absolute price change to ring (0-3 style). Positions 3, 6, 9 are prime-aligned.
    Returns ring-like bucket (0-3) or None if not on prime position.
    """
    if delta != delta:
        return None
    scaled = int(abs(delta) * scale)
    if scaled <= 0:
        return None
    position = int(scaled % 12)
    if position not in (3, 6, 9):
        return None
    mag = int(scaled // 12)
    if mag < 4:
        return min(mag, 3)
    return 3


def is_prime_aligned_position(position: int) -> bool:
    """Positions 3, 6, 9 on the 12-fold clock are prime-aligned (Crystalline)."""
    return position in (3, 6, 9)


def key_levels_from_stats(mean: float, std_dev: float, min_p: float, max_p: float) -> list[tuple[str, float]]:
    """Strong support, support, mean, resistance, strong resistance (Custom Math levels)."""
    return [
        ("strong_support", min_p),
        ("support", mean - std_dev),
        ("mean", mean),
        ("resistance", mean + std_dev),
        ("strong_resistance", max_p),
    ]
