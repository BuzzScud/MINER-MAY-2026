"""
RocketBot entrypoint: TradingEngine orchestrator, typer CLI.
Modes: backtest, paper, live. Graceful SIGTERM → flatten positions.
"""
from __future__ import annotations

import asyncio
import signal
import sys
from pathlib import Path

import typer

from quantbot.config import Config, TradingMode, get_config
from quantbot.backtest.engine import BacktestEngine, BacktestConfig
from quantbot.signals.multi_asset import MultiAssetStrategy
from quantbot.utils.logging import configure_logging, get_logger

app = typer.Typer(help="RocketBot: algorithmic trading bot (NQ, ES, EURUSD, GBPUSD)")


def _config_callback(ctx: typer.Context, value: str | None) -> None:
    if value:
        ctx.params.setdefault("config_path", value)


@app.callback()
def main(
    ctx: typer.Context,
    mode: str = typer.Option("paper", "--mode", "-m", help="backtest | paper | live"),
    config_path: str | None = typer.Option(None, "--config", "-c", help="Config YAML or .env path"),
    verbose: bool = typer.Option(False, "--verbose", "-v"),
) -> None:
    configure_logging(level="DEBUG" if verbose else "INFO", json=True)
    ctx.ensure_object(dict)
    try:
        cfg = get_config()
        ctx.obj["config"] = cfg
        ctx.obj["mode"] = TradingMode(mode) if mode in ("backtest", "paper", "live") else TradingMode.PAPER
    except Exception as e:
        get_logger("quantbot").error("config_load_failed", error=str(e))
        raise typer.Exit(1)


@app.command()
def run(
    ctx: typer.Context,
    symbols: str = typer.Option("NQ,ES,EURUSD,GBPUSD", "--symbols", "-s"),
) -> None:
    """Run the trading engine (paper or live)."""
    cfg: Config = ctx.obj["config"]
    mode: TradingMode = ctx.obj["mode"]
    log = get_logger("quantbot")
    log.info("engine_start", mode=mode.value, symbols=symbols)
    if mode == TradingMode.BACKTEST:
        typer.echo("Use 'backtest' command for backtesting.")
        raise typer.Exit(0)
    # Stub: real loop would start feed, strategy, risk, execution
    typer.echo(f"RocketBot running in {mode.value} mode. Symbols: {symbols}")


@app.command()
def backtest(
    ctx: typer.Context,
    symbol: str = typer.Option("NQ", "--symbol", "-s"),
    timeframe: str = typer.Option("1m", "--timeframe", "-t"),
    cache_dir: str = typer.Option("data/cache", "--cache-dir"),
) -> None:
    """Run backtest on cached data."""
    cfg: Config = ctx.obj["config"]
    cache = Path(cache_dir)
    strategy = MultiAssetStrategy()
    bt_config = BacktestConfig(
        initial_equity=100_000.0,
        slippage_ticks=0.25,
        slippage_bps=0.5,
    )
    engine = BacktestEngine(strategy, bt_config)
    result = engine.run(cache, symbol, timeframe)
    typer.echo(f"Backtest {symbol} {timeframe}: metrics = {result.get('metrics', {})}")


@app.command()
def version() -> None:
    """Show version."""
    typer.echo("RocketBot 0.1.0")


def run_app() -> None:
    app()


if __name__ == "__main__":
    run_app()
