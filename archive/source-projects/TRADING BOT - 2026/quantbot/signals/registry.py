"""
Strategy registry: maps strategy ids to strategy classes and display labels.
Used by BotRunner to instantiate the configured strategy (e.g. from config.strategy_id).
"""
from __future__ import annotations

from typing import Any, Type

from quantbot.signals.base import BaseStrategy
from quantbot.signals.multi_asset import MultiAssetStrategy, MultiAssetStrategyConfig

STRATEGY_OPTIONS: list[dict[str, Any]] = [
    {"id": "multi_asset", "label": "Multi-Asset (default)"},
]

_REGISTRY: dict[str, tuple[type[BaseStrategy], type[Any]]] = {
    "multi_asset": (MultiAssetStrategy, MultiAssetStrategyConfig),
}


def get_strategy_class(strategy_id: str) -> type[BaseStrategy] | None:
    """Return the strategy class for the given id, or None if unknown."""
    entry = _REGISTRY.get(strategy_id)
    return entry[0] if entry else None


def get_strategy_config_class(strategy_id: str) -> type[Any] | None:
    """Return the config class for the given strategy id, or None if unknown."""
    entry = _REGISTRY.get(strategy_id)
    return entry[1] if entry else None


def create_strategy(strategy_id: str, config_instance: Any | None = None) -> BaseStrategy:
    """Create a strategy instance for the given id. Uses default config if config_instance is None."""
    entry = _REGISTRY.get(strategy_id)
    if not entry:
        raise ValueError(f"Unknown strategy_id: {strategy_id}")
    strategy_cls, config_cls = entry
    config = config_instance if config_instance is not None else config_cls()
    return strategy_cls(config)


def get_strategy_options() -> list[dict[str, Any]]:
    """Return list of {id, label} for UI dropdown."""
    return list(STRATEGY_OPTIONS)
