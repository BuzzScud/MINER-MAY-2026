"""Default sentiment-momentum strategy: Reddit 0.7, News 0.3; entry/exit thresholds; 24h staleness; min volume 10.
Optional prime-modular mode (Lunar-thesis): SENTIMENT_PRIME_MODULAR=1 for 0.29/-0.31 thresholds and 29-day window."""
import os

from backend.sentiment.gatherers import gather_reddit, gather_rss
from backend.sentiment.strategies.base import GathererFn, Strategy

_PRIME_MODULAR_ENV = "SENTIMENT_PRIME_MODULAR"
HOURS_PER_DAY = 24
PRIME_MODULAR_STALENESS_DAYS = 29


def _use_prime_modular() -> bool:
    return os.environ.get(_PRIME_MODULAR_ENV, "").strip().lower() in ("1", "true", "yes")


class DefaultStrategy(Strategy):
    def get_gatherers(self) -> list[GathererFn]:
        return [gather_reddit, gather_rss]

    def get_source_weight(self, source: str) -> float:
        if source == "reddit":
            return 0.7
        if source == "rss":
            return 0.3
        return 0.5

    def get_entry_threshold(self) -> float:
        if _use_prime_modular():
            return 0.29
        return 0.3

    def get_exit_threshold(self) -> float:
        if _use_prime_modular():
            return -0.31
        return -0.3

    def get_staleness_hours(self) -> float:
        if _use_prime_modular():
            return float(PRIME_MODULAR_STALENESS_DAYS * HOURS_PER_DAY)
        return 24.0

    def get_min_volume(self) -> int:
        return 10

    def get_use_prime_modular_thresholds(self) -> bool:
        return _use_prime_modular()

    def get_use_prime_modular_window(self) -> bool:
        return _use_prime_modular()


default_strategy = DefaultStrategy()
