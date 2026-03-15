"""
Crystalline-style statistics (algo_statistics equivalent).
Pure Python: mean, variance, std_dev, min, max for price/ring series.
Asset-agnostic: use for stocks, crypto, forex.
"""
from __future__ import annotations


def statistics(values: list[float]) -> dict[str, float]:
    """Return count, mean, variance, std_dev, min, max. Empty list returns zeros."""
    n = len(values)
    if n == 0:
        return {"count": 0, "mean": 0.0, "variance": 0.0, "std_dev": 0.0, "min": 0.0, "max": 0.0}
    total = sum(values)
    mean = total / n
    variance = sum((x - mean) ** 2 for x in values) / n
    std_dev = variance ** 0.5
    return {
        "count": n,
        "mean": mean,
        "variance": variance,
        "std_dev": std_dev,
        "min": min(values),
        "max": max(values),
    }
