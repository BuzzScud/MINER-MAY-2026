"""Pluggable strategy base: config and rule parameters only (no LLM or trading)."""
from abc import ABC, abstractmethod
from typing import Callable, List, Literal, Optional

# Gatherer: (symbols: Optional[List[str]]) -> List[RawSignal]
# RawSignal is from gatherers module
GathererFn = Callable[[Optional[List[str]]], list]

AggregationMode = Literal["mean", "trimmed_mean", "median"]


class Strategy(ABC):
    """Base class for sentiment-momentum style strategies."""

    @abstractmethod
    def get_gatherers(self) -> List[GathererFn]:
        """Return list of gatherer functions to run."""
        ...

    @abstractmethod
    def get_source_weight(self, source: str) -> float:
        """Weight for aggregation (e.g. reddit=0.7, rss=0.3)."""
        ...

    @abstractmethod
    def get_entry_threshold(self) -> float:
        """Score above this => bullish entry signal (e.g. 0.3)."""
        ...

    @abstractmethod
    def get_exit_threshold(self) -> float:
        """Score below this => bearish exit signal (e.g. -0.3)."""
        ...

    @abstractmethod
    def get_staleness_hours(self) -> float:
        """Signals older than this are excluded or marked stale (e.g. 24)."""
        ...

    @abstractmethod
    def get_min_volume(self) -> int:
        """Minimum number of mentions before emitting an aggregate (e.g. 10)."""
        ...

    def get_use_time_decay(self) -> bool:
        """If True, weight signals by exponential decay by age. Default False."""
        return False

    def get_decay_half_life_hours(self) -> float:
        """Half-life in hours for time-decay weighting when use_time_decay is True. Default 12.0."""
        return 12.0

    def get_aggregation_mode(self) -> AggregationMode:
        """Aggregation mode: mean, trimmed_mean, or median. Default mean."""
        return "mean"

    def get_use_prime_modular_thresholds(self) -> bool:
        """If True, use Lunar-thesis twin-prime thresholds: entry 0.29, exit -0.31. Default False."""
        return False

    def get_use_prime_modular_window(self) -> bool:
        """If True, use 29-day staleness window (Lunar-thesis alignment). Default False."""
        return False

    def get_include_uncertainty(self) -> bool:
        """If True, compute and include score_std and confidence interval in aggregates. Default True for on-demand."""
        return True
