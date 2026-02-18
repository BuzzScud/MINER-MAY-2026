"""
Quantbot configuration: symbols, broker, risk params, timeframes.
Uses Pydantic BaseSettings; load from env + .env.
"""
from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class TradingMode(str, Enum):
    BACKTEST = "backtest"
    PAPER = "paper"
    LIVE = "live"


class InstrumentConfig(BaseSettings):
    """Per-instrument: tick size, margin, session hours."""

    symbol: str
    tick_size: float = Field(..., gt=0, description="Minimum price increment")
    tick_value: float = Field(..., gt=0, description="Cash value per tick")
    margin_per_contract: float = Field(..., ge=0)
    session_start_hour: int = Field(0, ge=0, le=23)
    session_end_hour: int = Field(23, ge=0, le=23)
    is_forex: bool = False


# Default instrument configs for NQ, ES, EURUSD, GBPUSD
DEFAULT_SYMBOLS: dict[str, InstrumentConfig] = {
    "NQ": InstrumentConfig(
        symbol="NQ",
        tick_size=0.25,
        tick_value=5.0,
        margin_per_contract=15_000.0,
        session_start_hour=0,
        session_end_hour=23,
        is_forex=False,
    ),
    "ES": InstrumentConfig(
        symbol="ES",
        tick_size=0.25,
        tick_value=12.50,
        margin_per_contract=12_000.0,
        session_start_hour=0,
        session_end_hour=23,
        is_forex=False,
    ),
    "EURUSD": InstrumentConfig(
        symbol="EURUSD",
        tick_size=0.00001,
        tick_value=1.0,
        margin_per_contract=0.0,
        session_start_hour=0,
        session_end_hour=23,
        is_forex=True,
    ),
    "GBPUSD": InstrumentConfig(
        symbol="GBPUSD",
        tick_size=0.00001,
        tick_value=1.0,
        margin_per_contract=0.0,
        session_start_hour=0,
        session_end_hour=23,
        is_forex=True,
    ),
}


class BrokerConfig(BaseSettings):
    """Interactive Brokers (primary) and optional CCXT for forex."""

    ib_host: str = Field("127.0.0.1", description="TWS/Gateway host")
    ib_port: int = Field(7497, ge=1, le=65535)
    ib_client_id: int = Field(1, ge=0)
    ib_account: str = Field("", description="Account ID; empty = use default")
    use_ccxt_for_forex: bool = Field(False, description="Fallback to CCXT for forex if needed")


class RiskConfig(BaseSettings):
    """Risk limits: per-trade, daily loss halt, position caps."""

    risk_pct_per_trade: float = Field(0.5, ge=0.01, le=10.0)
    max_concurrent_positions: int = Field(4, ge=1, le=20)
    max_daily_loss_pct: float = Field(10.0, ge=1.0, le=100.0)
    max_portfolio_pct_per_instrument: float = Field(20.0, ge=1.0, le=100.0)
    max_vol_adjusted_exposure_pct: float = Field(2.0, ge=0.1, le=20.0)


class LearningConfig(BaseSettings):
    """Adaptive learning parameters."""

    denoise_threshold: float = Field(0.1, ge=0.01, le=1.0, description="FFT denoise cutoff ratio")
    snr_min_threshold: float = Field(-20.0, description="Skip trading when SNR (dB) below this")
    adaptive_lookback_trades: int = Field(50, ge=10, le=500, description="Rolling window for signal weights")
    adaptive_min_weight: float = Field(0.2, ge=0.0, le=1.0, description="Minimum weight before signal is skipped")
    optimizer_training_weeks: int = Field(4, ge=1, le=12, description="Walk-forward training window")
    optimizer_validation_weeks: int = Field(1, ge=1, le=4, description="Walk-forward out-of-sample window")
    optimizer_min_trades: int = Field(30, ge=5, le=200, description="Minimum trades to run optimization")
    optimizer_sharpe_improvement: float = Field(0.1, ge=0.0, description="Required Sharpe improvement for adoption")
    daily_review_hour_utc: int = Field(22, ge=0, le=23, description="UTC hour for daily review")
    weekly_optimize_day: int = Field(6, ge=0, le=6, description="Day of week for optimization (0=Mon, 6=Sun)")


class Config(BaseSettings):
    """Root config: mode, symbols, broker, risk, timeframes."""

    model_config = SettingsConfigDict(
        env_prefix="QUANTBOT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mode: TradingMode = Field(TradingMode.PAPER)
    symbols: list[str] = Field(
        default=["NQ", "ES", "EURUSD", "GBPUSD"],
        description="Instruments to trade",
    )
    timeframes: list[str] = Field(
        default=["1s", "5s", "15s", "1m", "5m", "15m", "1H", "4H", "D"],
    )
    scan_interval_seconds: int = Field(5, ge=1, le=300)
    data_cache_dir: Path = Field(default=Path("data/cache"))
    historical_years: int = Field(2, ge=1, le=10)
    data_feed_provider: Literal["yahoo", "barchart", "massive", "finnhub"] = Field(
        default="yahoo",
        description="Data feed: yahoo, barchart, massive, or finnhub (env: QUANTBOT_DATA_FEED_PROVIDER)",
    )
    strategy_id: Literal["multi_asset"] = Field(
        default="multi_asset",
        description="Trading strategy id from registry (env: QUANTBOT_STRATEGY_ID)",
    )

    broker: BrokerConfig = Field(default_factory=BrokerConfig)
    risk: RiskConfig = Field(default_factory=RiskConfig)
    learning: LearningConfig = Field(default_factory=LearningConfig)

    def get_instrument(self, symbol: str) -> InstrumentConfig | None:
        return DEFAULT_SYMBOLS.get(symbol)


def get_config() -> Config:
    return Config()
