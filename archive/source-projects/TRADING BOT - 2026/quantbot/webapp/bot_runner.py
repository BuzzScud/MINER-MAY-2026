"""
Bot runner: orchestrates data feed, MultiAssetStrategy, RiskEngine, CircuitBreaker, PaperBroker/LiveBroker.
Runs in a background thread; emits SocketIO events for the dashboard.
Supports paper and live trading modes with runtime switching.
"""
from __future__ import annotations

import asyncio
import dataclasses
import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

# UTC session boundaries (hour, minute) for session start; duration in hours
SESSION_ASIAN = (0, 0, 8)
SESSION_LONDON = (8, 0, 8)
SESSION_NY = (13, 30, 6.5)

import pandas as pd

from quantbot.backtest.metrics import compute_all_metrics
from quantbot.config import DEFAULT_SYMBOLS, get_config
from quantbot.data.denoiser import calculate_signal_quality
from quantbot.data.storage import save_trade, save_signal
from quantbot.execution.broker import IBBroker
from quantbot.optimization.daily_review import run_daily_review
from quantbot.mathlib.math_engine import MathEngine
from quantbot.data.yahoo_feed import YahooFeed
from quantbot.risk.circuit_breaker import CircuitBreaker, CircuitBreakerConfig
from quantbot.risk.engine import RiskEngine
from quantbot.signals.adaptive_weights import AdaptiveWeightManager, signal_type_for_symbol
from quantbot.signals.base import Side
from quantbot.signals.regime import RegimeDetector
from quantbot.signals.registry import create_strategy, get_strategy_class
from quantbot.webapp.paper_broker import PaperBroker
from quantbot.webapp.live_broker import LiveBrokerAdapter

logger = logging.getLogger(__name__)


VALID_FEED_PROVIDERS = ("yahoo", "barchart", "massive", "finnhub")


def _create_feed(provider: str | None = None, api_keys: dict[str, str] | None = None) -> Any:
    """Create data feed for the given provider. Uses api_keys override or env."""
    api_keys = api_keys or {}
    cfg = get_config()
    prov = (provider or cfg.data_feed_provider or "yahoo").lower()
    if prov == "yahoo":
        return YahooFeed()
    if prov == "massive":
        api_key = api_keys.get("massive") or os.environ.get("QUANTBOT_MASSIVE_API_KEY", "").strip()
        if not api_key:
            logger.warning("QUANTBOT_MASSIVE_API_KEY not set; falling back to YahooFeed")
            return YahooFeed()
        from quantbot.data.massive_feed import MassiveFeed
        return MassiveFeed(api_key=api_key)
    if prov == "finnhub":
        api_key = api_keys.get("finnhub") or os.environ.get("QUANTBOT_FINNHUB_API_KEY", "").strip()
        if not api_key:
            logger.warning("QUANTBOT_FINNHUB_API_KEY not set; falling back to YahooFeed")
            return YahooFeed()
        from quantbot.data.finnhub_feed import FinnhubFeed
        return FinnhubFeed(api_key=api_key)
    if prov == "barchart":
        api_key = api_keys.get("barchart") or os.environ.get("QUANTBOT_BARCHART_API_KEY", "").strip()
        if not api_key:
            logger.warning("QUANTBOT_BARCHART_API_KEY not set; falling back to YahooFeed")
            return YahooFeed()
        from quantbot.data.barchart_feed import BarchartFeed
        return BarchartFeed(api_key=api_key)
    return YahooFeed()

POLL_INTERVAL_SEC = 8
# Polygon free tier: 5 API calls/min; we use 4 per cycle so run cycle every 60s when using Massive
POLL_INTERVAL_MASSIVE_SEC = 60
SYMBOLS = ["NQ", "ES", "EURUSD", "GBPUSD"]
MAX_BARS_EMIT = 500

TIMEFRAME_RESAMPLE: dict[str, str] = {
    "15m": "15min",
    "30m": "30min",
    "1h":  "1h",
    "4h":  "4h",
    "1d":  "1D",
}
VALID_TIMEFRAMES = set(TIMEFRAME_RESAMPLE.keys())


def _session_info_utc(now: datetime) -> dict[str, Any]:
    """Compute current trading session from UTC time. Returns primary session."""
    utc = now.replace(tzinfo=timezone.utc)
    hour = utc.hour
    minute = utc.minute
    total_minutes = hour * 60 + minute

    def in_session(start_h: int, start_m: int, duration_h: float) -> tuple[float, float] | None:
        start_min = start_h * 60 + start_m
        end_min = start_min + int(duration_h * 60)
        if end_min > 24 * 60:
            in_range = total_minutes >= start_min or total_minutes < (end_min - 24 * 60)
        else:
            in_range = start_min <= total_minutes < end_min
        if not in_range:
            return None
        if total_minutes >= start_min:
            elapsed = total_minutes - start_min
        else:
            elapsed = (24 * 60 - start_min) + total_minutes
        duration_min = int(duration_h * 60)
        progress = min(1.0, elapsed / duration_min) if duration_min else 0
        remaining_sec = max(0, (duration_min - elapsed) * 60)
        return (progress, remaining_sec)

    for name, sh, sm, dur in [
        ("Asian", SESSION_ASIAN[0], SESSION_ASIAN[1], SESSION_ASIAN[2]),
        ("London", SESSION_LONDON[0], SESSION_LONDON[1], SESSION_LONDON[2]),
        ("New York", SESSION_NY[0], SESSION_NY[1], SESSION_NY[2]),
    ]:
        res = in_session(sh, sm, dur)
        if res is not None:
            progress, remaining_sec = res
            return {
                "name": name,
                "progress": round(progress, 4),
                "time_remaining_sec": int(remaining_sec),
                "active": True,
            }
    return {"name": "Closed", "progress": 0.0, "time_remaining_sec": 0, "active": False}


class BotRunner:
    """Single-threaded loop: fetch data -> signals -> risk -> trade -> emit.
    Supports paper and live modes with runtime switching."""

    def __init__(
        self,
        initial_equity: float = 100_000.0,
        symbols: list[str] | None = None,
    ) -> None:
        self._symbols = symbols or SYMBOLS
        cfg = get_config()
        self._feed_provider = (cfg.data_feed_provider or "yahoo").lower()
        if self._feed_provider not in VALID_FEED_PROVIDERS:
            self._feed_provider = "yahoo"
        self._feed_api_keys: dict[str, str] = {}
        self._feed = _create_feed(self._feed_provider, self._feed_api_keys)
        self._broker = PaperBroker(initial_equity=initial_equity)
        self._mode: str = "paper"
        self._broker_config: dict[str, Any] = {}
        self._initial_equity = initial_equity
        self._strategy_id = cfg.strategy_id
        self._strategy = create_strategy(cfg.strategy_id)
        self._risk = RiskEngine(
            max_daily_loss_pct=cfg.risk.max_daily_loss_pct,
            max_vol_adjusted_exposure_pct=cfg.risk.max_vol_adjusted_exposure_pct,
            max_portfolio_pct_per_instrument=cfg.risk.max_portfolio_pct_per_instrument,
        )
        self._circuit = CircuitBreaker(
            CircuitBreakerConfig(
                max_daily_loss_pct=cfg.risk.max_daily_loss_pct,
                max_drawdown_pct=10.0,
            )
        )
        self._ohlcv_cache: dict[str, pd.DataFrame] = {}
        self._chart_ohlcv_cache: dict[str, pd.DataFrame] = {}
        self._chart_interval: str = "1h"
        self._prices: dict[str, float] = {}
        self._socketio: Any = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._running = False
        self._lock = threading.Lock()
        self._activity_log: list[dict[str, Any]] = []
        self._preload_done = False
        self._cache_dir = cfg.data_cache_dir
        self._current_regime: str = ""
        self._snr_min: float = cfg.learning.snr_min_threshold
        self._regime_detector = RegimeDetector()
        self._adaptive_weights = AdaptiveWeightManager(
            lookback_trades=cfg.learning.adaptive_lookback_trades,
            min_weight=cfg.learning.adaptive_min_weight,
            cache_dir=cfg.data_cache_dir,
        )

    def _log(self, message: str, level: str = "info", data: dict[str, Any] | None = None) -> None:
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        with self._lock:
            entry = {"message": f"{ts} {message}", "level": level, "data": data or {}}
            self._activity_log.append(entry)
            if len(self._activity_log) > 200:
                self._activity_log.pop(0)
            log_snapshot = list(self._activity_log)
        self._emit("log_update", log_snapshot)

    def set_chart_interval(self, interval: str) -> bool:
        """Set the chart display timeframe. Returns True if valid."""
        tf = interval.strip().lower()
        if tf not in VALID_TIMEFRAMES:
            return False
        self._chart_interval = tf
        return True

    def get_feed_provider(self) -> str:
        """Return the current data feed provider name."""
        return self._feed_provider

    def set_feed_provider(self, provider: str, api_key: str | None = None) -> str:
        """Switch data feed at runtime. Clears caches and uses new feed. Returns active provider (may fallback to yahoo)."""
        prov = (provider or "").strip().lower()
        if prov not in VALID_FEED_PROVIDERS:
            return self._feed_provider
        with self._lock:
            if api_key is not None and api_key.strip():
                self._feed_api_keys[prov] = api_key.strip()
            self._feed_provider = prov
            self._feed = _create_feed(prov, self._feed_api_keys)
            self._ohlcv_cache.clear()
            self._chart_ohlcv_cache.clear()
            self._prices.clear()
        return self._feed_provider

    def _resample_ohlcv(self, df: pd.DataFrame, rule: str) -> pd.DataFrame:
        """Resample OHLCV DataFrame to the given pandas frequency rule."""
        if df.empty:
            return df
        resampled = df.resample(rule).agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }).dropna(subset=["open", "close"])
        return resampled

    def _build_chart_bars(self) -> dict[str, list[dict[str, Any]]]:
        """Resample 1m OHLCV cache to the selected chart timeframe and return bar dicts."""
        tf = self._chart_interval
        rule = TIMEFRAME_RESAMPLE.get(tf, "1h")
        result: dict[str, list[dict[str, Any]]] = {}
        for sym in self._symbols:
            df = self._ohlcv_cache.get(sym, pd.DataFrame())
            if df.empty:
                result[sym] = self._ohlcv_to_bars(self._chart_ohlcv_cache.get(sym, pd.DataFrame()))
                continue
            resampled = self._resample_ohlcv(df, rule)
            with self._lock:
                self._chart_ohlcv_cache[sym] = resampled
            result[sym] = self._ohlcv_to_bars(resampled)
        return result

    def fetch_chart_bars_immediate(self) -> dict[str, list[dict[str, Any]]]:
        """Public wrapper for the /api/timeframe endpoint to get bars immediately."""
        if not any(not self._ohlcv_cache.get(s, pd.DataFrame()).empty for s in self._symbols):
            try:
                ohlcv_all = self._feed.fetch_all_ohlcv(self._symbols, interval="1m", period="2d")
                for sym in self._symbols:
                    df = ohlcv_all.get(sym, pd.DataFrame())
                    if not df.empty:
                        self._ohlcv_cache[sym] = df
                        self._prices[sym] = float(df["close"].iloc[-1])
            except Exception:
                pass
        return self._build_chart_bars()

    def _get_market_overview(self) -> list[dict[str, Any]]:
        """Compute per-symbol market overview from 1m OHLCV cache."""
        overview: list[dict[str, Any]] = []
        for sym in self._symbols:
            price = self._prices.get(sym, 0.0)
            df = self._ohlcv_cache.get(sym, pd.DataFrame())
            if df.empty or price <= 0:
                overview.append({
                    "symbol": sym, "price": price,
                    "change_pct": 0.0, "day_high": 0.0, "day_low": 0.0, "volume": 0,
                })
                continue
            today = df.index[-1].normalize() if hasattr(df.index[-1], "normalize") else None
            if today is not None:
                day_df = df[df.index >= today]
            else:
                day_df = df.tail(390)
            if day_df.empty:
                day_df = df.tail(1)
            day_open = float(day_df["open"].iloc[0])
            day_high = float(day_df["high"].max())
            day_low = float(day_df["low"].min())
            volume = int(day_df["volume"].sum()) if "volume" in day_df.columns else 0
            change_pct = ((price - day_open) / day_open * 100.0) if day_open > 0 else 0.0
            overview.append({
                "symbol": sym,
                "price": round(price, 5),
                "change_pct": round(change_pct, 2),
                "day_high": round(day_high, 5),
                "day_low": round(day_low, 5),
                "volume": volume,
            })
        return overview

    def _emit(self, event: str, data: Any) -> None:
        if self._socketio is None:
            return
        try:
            self._socketio.emit(event, data)
        except Exception:
            pass

    def _ohlcv_to_bars(self, df: pd.DataFrame, max_bars: int = MAX_BARS_EMIT) -> list[dict[str, Any]]:
        """DataFrame to list of {time, open, high, low, close} for Lightweight Charts."""
        if df.empty or len(df) == 0:
            return []
        out = []
        tail = df.tail(max_bars)
        for ts, row in tail.iterrows():
            epoch = int(pd.Timestamp(ts).timestamp())
            out.append({
                "time": epoch,
                "open": round(float(row.get("open", 0)), 5),
                "high": round(float(row.get("high", 0)), 5),
                "low": round(float(row.get("low", 0)), 5),
                "close": round(float(row.get("close", 0)), 5),
            })
        return out

    def _atr_for_bar(self, ohlcv: pd.DataFrame, period: int = 14) -> float:
        if ohlcv.empty or len(ohlcv) < period:
            return 0.0
        high = ohlcv["high"].tolist()
        low = ohlcv["low"].tolist()
        close = ohlcv["close"].tolist()
        atr_series = self._strategy._math.atr(high, low, close, period)
        if not atr_series:
            return 0.0
        v = atr_series[-1].to_float()
        return v if v > 0 else 0.01

    def _run_cycle(self) -> None:
        self._log("Fetching market data...")

        try:
            ohlcv_all = self._feed.fetch_all_ohlcv(self._symbols, interval="1m", period="2d")
        except Exception as e:
            self._log(f"Batch fetch failed: {e}", "error")
            self._emit("price_update", {"prices": self._prices, "bars": {}})
            return

        bars_loaded = 0
        for sym in self._symbols:
            df = ohlcv_all.get(sym, pd.DataFrame())
            if not df.empty:
                self._ohlcv_cache[sym] = df
                self._prices[sym] = float(df["close"].iloc[-1])
                bars_loaded += len(df)
            else:
                cached = self._feed.get_cached_ohlcv(sym)
                if not cached.empty:
                    self._ohlcv_cache[sym] = cached
                    self._prices[sym] = float(cached["close"].iloc[-1])

        self._log(f"Data loaded: {bars_loaded} bars across {len(self._symbols)} symbols")

        prices = dict(self._prices)
        chart_bars = self._build_chart_bars()
        self._emit("price_update", {
            "prices": prices,
            "bars": chart_bars,
        })
        self._emit("market_overview_update", self._get_market_overview())

        positions = self._broker.get_positions_for_context()
        equity = self._broker.get_equity()
        for pos in self._broker.get_open_positions(prices):
            equity += pos.get("unrealized_pnl", 0.0)
        self._broker.append_equity_snapshot(equity)
        self._circuit.set_equity(equity)
        allowed, reason = self._circuit.check(equity)
        if not allowed:
            self._log(f"Circuit breaker tripped: {reason}", "warning")
            self._emit("position_update", self._broker.get_open_positions(prices))
            self._emit("equity_update", self._get_equity_payload(prices))
            return

        representative_df = self._ohlcv_cache.get("ES")
        if (
            representative_df is None
            or (isinstance(representative_df, pd.DataFrame) and representative_df.empty)
            or len(representative_df) < 200
        ):
            representative_df = self._ohlcv_cache.get(
                self._symbols[0] if self._symbols else "",
                pd.DataFrame(columns=["open", "high", "low", "close", "volume"]),
            )
        if representative_df is not None and not representative_df.empty and len(representative_df) >= 200:
            self._current_regime = self._regime_detector.classify(representative_df)
        else:
            self._current_regime = "mean_reverting"

        context: dict[str, Any] = {"open_positions": positions, "regime": self._current_regime}
        es_df = self._ohlcv_cache.get("ES")
        if es_df is not None and not es_df.empty and "close" in es_df.columns:
            context["es_close_series"] = es_df["close"].tolist()

        now_iso = datetime.now(timezone.utc).isoformat()
        strategy_params_snapshot = dataclasses.asdict(self._strategy.config)

        for sym in self._symbols:
            ohlcv = self._ohlcv_cache.get(sym)
            if ohlcv is None or len(ohlcv) < 200:
                self._log(f"{sym}: insufficient data ({len(ohlcv) if ohlcv is not None else 0} bars, need 200)", "warning")
                continue
            snr = calculate_signal_quality(ohlcv["close"].tolist())
            if snr < self._snr_min:
                self._log(f"{sym}: noisy data (SNR={snr:.1f}dB < {self._snr_min}dB), skipping", "info")
                continue
            bar = ohlcv.iloc[-1]
            context["snr"] = snr
            context["regime"] = self._current_regime
            signals = self._strategy.generate_signals(sym, ohlcv, context)
            sig_type = signal_type_for_symbol(sym)
            if signals:
                self._log(f"{sym}: {len(signals)} signal(s) generated")
            for sig in signals:
                acted_on = False
                skip_reason = ""
                weight = self._adaptive_weights.get_weight(sig_type)
                if self._adaptive_weights.should_skip(sig_type):
                    skip_reason = f"low_weight:{weight:.2f}"
                    self._log(f"{sym}: signal skipped (weight={weight:.2f})", "info")
                elif not self._strategy.should_enter(sym, sig, context):
                    skip_reason = "max_positions_or_duplicate"
                    self._log(f"{sym}: entry blocked (max positions or duplicate)", "info")
                else:
                    sig.strength *= weight
                    quantity = 1.0
                    price = float(bar.get("close", 0))
                    ok, risk_reason = self._risk.check_trade(
                        sym, sig.side.value, quantity, price, equity, {}, 0.0, None
                    )
                    if not ok:
                        skip_reason = f"risk:{risk_reason}"
                        self._log(f"Risk blocked {sym} {sig.side.value}: {risk_reason}", "warning")
                    else:
                        acted_on = True
                        atr = self._atr_for_bar(ohlcv)
                        fill = self._broker.open_position(sym, sig.side.value, price, quantity, atr)
                        self._log(f"ENTRY {sig.side.value.upper()} {sym} @ {fill:.2f}", "info")
                        self._emit("trade_executed", {"symbol": sym, "side": sig.side.value, "price": fill, "type": "entry"})
                        context["open_positions"] = self._broker.get_positions_for_context()
                try:
                    save_signal(self._cache_dir, {
                        "timestamp": now_iso,
                        "symbol": sym,
                        "side": sig.side.value,
                        "strength": sig.strength,
                        "acted_on": acted_on,
                        "skip_reason": skip_reason,
                        "metadata": sig.metadata or {},
                        "regime": self._current_regime,
                    })
                except Exception:
                    pass

            pos = positions.get(sym)
            if pos is not None:
                exit_sig = self._strategy.should_exit(sym, pos, bar, context)
                if exit_sig is not None:
                    exit_price = prices.get(sym, float(bar.get("close", 0)))
                    pnl = self._broker.close_position(
                        sym, exit_price,
                        exit_reason=exit_sig.reason,
                        regime_at_entry=self._current_regime,
                    )
                    if pnl is not None:
                        self._log(f"EXIT {sym} ({exit_sig.reason}) @ {exit_price:.2f} PnL=${pnl:.2f}", "info")
                        self._emit("trade_executed", {
                            "symbol": sym, "reason": exit_sig.reason, "exit_price": exit_price, "pnl": pnl, "type": "exit",
                        })
                        try:
                            last_trade = self._broker.get_trade_history()[-1]
                            last_trade["strategy_params"] = strategy_params_snapshot
                            save_trade(self._cache_dir, last_trade)
                            self._adaptive_weights.update(last_trade)
                        except Exception:
                            pass
                    context["open_positions"] = self._broker.get_positions_for_context()

        self._emit("position_update", self._broker.get_open_positions(prices))
        self._emit("equity_update", self._get_equity_payload(prices))
        self._log("Cycle complete")

    def _get_equity_payload(self, current_prices: dict[str, float] | None = None) -> dict[str, Any]:
        current_prices = current_prices or {}
        engine = MathEngine()
        equity_a = engine._a(self._broker.get_equity())
        positions = self._broker.get_open_positions(current_prices)
        for p in positions:
            equity_a = equity_a + engine._a(p.get("unrealized_pnl", 0.0))
        equity = equity_a.to_float()
        curve = self._broker.get_equity_curve()
        eq_vals = [e["equity"] for e in curve]
        if len(eq_vals) > 1:
            returns = []
            for i in range(1, len(eq_vals)):
                prev = engine._a(eq_vals[i - 1])
                if prev > engine._a(0):
                    ret_a = (engine._a(eq_vals[i]) - prev) / prev
                    returns.append(ret_a.to_float())
                else:
                    returns.append(0.0)
        else:
            returns = []
        trades_pnl = [t["pnl"] for t in self._broker.get_trade_history()]
        metrics = compute_all_metrics(returns, eq_vals, trades_pnl)
        return {
            "equity": equity,
            "equity_curve": curve,
            "metrics": metrics,
        }

    def get_settings(self) -> dict[str, Any]:
        """Current strategy and risk settings for API."""
        strat = dataclasses.asdict(self._strategy.config)
        return {
            "strategy_id": self._strategy_id,
            "strategy": strat,
            "risk": {
                "risk_pct_per_trade": self._strategy.config.risk_pct_per_trade,
                "max_concurrent_positions": self._strategy.config.max_positions,
                "max_daily_loss_pct": self._risk._max_daily_loss_pct,
                "max_portfolio_pct_per_instrument": self._risk._max_pct_per_instrument,
                "max_vol_adjusted_exposure_pct": self._risk._max_vol_adjusted_exposure_pct,
            },
            "circuit": {
                "max_drawdown_pct": self._circuit.config.max_drawdown_pct,
                "max_daily_loss_pct": self._circuit.config.max_daily_loss_pct,
            },
        }

    def update_settings(self, updates: dict[str, Any]) -> None:
        """Apply partial strategy/risk updates. Validates and applies in place."""
        with self._lock:
            strategy_id = updates.get("strategy_id")
            if strategy_id is not None and get_strategy_class(strategy_id) is not None:
                self._strategy_id = strategy_id
                self._strategy = create_strategy(strategy_id)
            strategy_updates = updates.get("strategy") or {}
            risk_updates = updates.get("risk") or {}
            circuit_updates = updates.get("circuit") or {}
            for key, value in strategy_updates.items():
                if hasattr(self._strategy.config, key):
                    setattr(self._strategy.config, key, value)
            if risk_updates:
                if "risk_pct_per_trade" in risk_updates:
                    self._strategy.config.risk_pct_per_trade = float(risk_updates["risk_pct_per_trade"])
                if "max_concurrent_positions" in risk_updates:
                    self._strategy.config.max_positions = int(risk_updates["max_concurrent_positions"])
                if "max_daily_loss_pct" in risk_updates:
                    self._risk._max_daily_loss_pct = float(risk_updates["max_daily_loss_pct"])
                if "max_portfolio_pct_per_instrument" in risk_updates:
                    self._risk._max_pct_per_instrument = float(risk_updates["max_portfolio_pct_per_instrument"])
                if "max_vol_adjusted_exposure_pct" in risk_updates:
                    self._risk._max_vol_adjusted_exposure_pct = float(risk_updates["max_vol_adjusted_exposure_pct"])
            if circuit_updates:
                if "max_drawdown_pct" in circuit_updates:
                    self._circuit.config.max_drawdown_pct = float(circuit_updates["max_drawdown_pct"])
                if "max_daily_loss_pct" in circuit_updates:
                    self._circuit.config.max_daily_loss_pct = float(circuit_updates["max_daily_loss_pct"])

    def _ensure_ohlcv_preloaded(self) -> None:
        """One-off preload of OHLCV when cache is empty so charts load before bot is started."""
        with self._lock:
            if self._preload_done:
                return
            need = any(
                self._ohlcv_cache.get(s, pd.DataFrame()).empty
                for s in self._symbols
            )
            if not need:
                self._preload_done = True
                return
            self._preload_done = True
        try:
            ohlcv_all = self._feed.fetch_all_ohlcv(self._symbols, interval="1m", period="2d")
        except Exception as e:
            logger.warning("Preload OHLCV failed: %s", e)
            return
        with self._lock:
            for sym in self._symbols:
                df = ohlcv_all.get(sym, pd.DataFrame())
                if not df.empty:
                    self._ohlcv_cache[sym] = df
                    self._prices[sym] = float(df["close"].iloc[-1])
        self._build_chart_bars()

    def get_mode(self) -> str:
        """Return current trading mode: 'paper' or 'live'."""
        return self._mode

    def get_broker_config(self) -> dict[str, Any]:
        """Return the current broker configuration."""
        return dict(self._broker_config)

    def set_mode(self, mode: str, broker_config: dict[str, Any] | None = None) -> dict[str, Any]:
        """Switch between paper and live trading modes.

        Args:
            mode: 'paper' or 'live'
            broker_config: Required for live mode. Keys: ib_host, ib_port, ib_client_id, ib_account

        Returns:
            dict with ok, message, and mode
        """
        mode = mode.strip().lower()
        if mode not in ("paper", "live"):
            return {"ok": False, "message": f"Invalid mode: {mode}. Must be 'paper' or 'live'."}

        if self._running:
            return {"ok": False, "message": "Cannot switch mode while bot is running. Stop the bot first."}

        if mode == "paper":
            if isinstance(self._broker, LiveBrokerAdapter):
                try:
                    self._broker.disconnect()
                except Exception:
                    pass
            self._broker = PaperBroker(initial_equity=self._initial_equity)
            self._mode = "paper"
            self._broker_config = {}
            self._log("Switched to PAPER trading mode")
            return {"ok": True, "message": "Switched to paper trading mode.", "mode": "paper"}

        if not broker_config:
            return {"ok": False, "message": "Broker configuration required for live mode."}

        host = broker_config.get("ib_host", "127.0.0.1")
        port = int(broker_config.get("ib_port", 7496))
        client_id = int(broker_config.get("ib_client_id", 1))
        account = broker_config.get("ib_account", "")

        live_adapter = LiveBrokerAdapter(
            host=host,
            port=port,
            client_id=client_id,
            account=account,
            initial_equity=self._initial_equity,
        )

        try:
            live_adapter.connect()
        except Exception as exc:
            return {"ok": False, "message": f"Failed to connect to IB: {exc}"}

        if isinstance(self._broker, LiveBrokerAdapter):
            try:
                self._broker.disconnect()
            except Exception:
                pass

        self._broker = live_adapter
        self._mode = "live"
        self._broker_config = {
            "ib_host": host,
            "ib_port": port,
            "ib_client_id": client_id,
            "ib_account": account,
        }
        self._log("Switched to LIVE trading mode", "warning")
        return {"ok": True, "message": f"LIVE trading enabled via IB at {host}:{port}", "mode": "live"}

    @staticmethod
    def test_broker_connection(broker_config: dict[str, Any]) -> dict[str, Any]:
        """Test IB Gateway/TWS connection without changing mode. Returns result dict."""
        host = broker_config.get("ib_host", "127.0.0.1")
        port = int(broker_config.get("ib_port", 7497))
        client_id = int(broker_config.get("ib_client_id", 1))
        account = broker_config.get("ib_account", "")

        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(
                IBBroker.test_connection(host, port, client_id, account)
            )
            return result
        except Exception as exc:
            return {"ok": False, "message": f"Connection test error: {exc}"}
        finally:
            loop.close()

    def get_state(self) -> dict[str, Any]:
        """Full snapshot for REST API. Uses cached data only -- never blocks."""
        self._ensure_ohlcv_preloaded()
        prices = dict(self._prices)
        with self._lock:
            log_snapshot = list(self._activity_log)
        need_resample = any(
            self._chart_ohlcv_cache.get(s, pd.DataFrame()).empty for s in self._symbols
        )
        if need_resample:
            chart_bars = self._build_chart_bars()
        else:
            with self._lock:
                chart_bars = {
                    s: self._ohlcv_to_bars(self._chart_ohlcv_cache[s])
                    for s in self._symbols
                }
        return {
            "running": self._running,
            "symbols": self._symbols,
            "prices": prices,
            "positions": self._broker.get_open_positions(prices),
            "trades": self._broker.get_trade_history(),
            "equity": self._get_equity_payload(prices),
            "bars": chart_bars,
            "activity_log": log_snapshot,
            "session_info": _session_info_utc(datetime.now(timezone.utc)),
            "market_overview": self._get_market_overview(),
            "chart_interval": self._chart_interval,
            "mode": self._mode,
            "feed_provider": self.get_feed_provider(),
        }

    def _run_daily_review(self) -> None:
        """Execute end-of-day learning cycle."""
        equity = self._broker.get_equity()
        eq_curve = [e["equity"] for e in self._broker.get_equity_curve()]
        strategy_params = dataclasses.asdict(self._strategy.config)
        cfg = get_config()
        summary = run_daily_review(
            cache_dir=self._cache_dir,
            equity=equity,
            equity_curve=eq_curve,
            adaptive_weights=self._adaptive_weights,
            current_strategy_params=strategy_params,
            learning_cfg=cfg.learning,
        )
        opt = summary.get("optimizer")
        if opt and opt.get("adopted"):
            new_params = opt["best_params"]
            for key, value in new_params.items():
                if hasattr(self._strategy.config, key):
                    setattr(self._strategy.config, key, value)
            self._log(f"Optimizer adopted new params (val_sharpe={opt['validation_sharpe']:.3f})", "info")
        self._emit("daily_review_update", summary)
        self._log(f"Daily review complete: {summary.get('trades_today', 0)} trades today", "info")

    def start(self, socketio: Any) -> dict[str, Any]:
        """Start background loop; socketio used to emit events.
        Returns dict with ok and optional error message."""
        if self._running:
            return {"ok": False, "error": "Bot is already running"}

        if self._mode == "live" and isinstance(self._broker, LiveBrokerAdapter):
            if not self._broker.is_connected():
                return {"ok": False, "error": "Live broker not connected. Re-configure live trading."}

        self._socketio = socketio
        self._stop.clear()
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        self._log("Bot started" + (" [LIVE MODE]" if self._mode == "live" else " [PAPER MODE]"))
        return {"ok": True}

    def _get_poll_interval_sec(self) -> float:
        """Return poll interval in seconds; longer for rate-limited feeds (e.g. Polygon 5/min)."""
        if self._feed_provider == "massive":
            return float(POLL_INTERVAL_MASSIVE_SEC)
        return float(POLL_INTERVAL_SEC)

    def _loop(self) -> None:
        last_review_date = ""
        cfg = get_config()
        review_hour = cfg.learning.daily_review_hour_utc
        while not self._stop.is_set():
            try:
                self._run_cycle()
                now = datetime.now(timezone.utc)
                today_str = now.strftime("%Y-%m-%d")
                if now.hour == review_hour and today_str != last_review_date:
                    self._run_daily_review()
                    last_review_date = today_str
            except Exception as e:
                self._log(f"Cycle error: {e}", "error")
            self._stop.wait(timeout=self._get_poll_interval_sec())

    def stop(self) -> None:
        """Graceful shutdown."""
        self._running = False
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=15)
            self._thread = None
        self._log("Bot stopped")

    def add_symbol(self, symbol: str) -> bool:
        """Add a symbol for charting. Fetches OHLCV and updates state. Returns True if added."""
        sym = symbol.strip().upper()
        if not sym:
            return False
        with self._lock:
            if sym in self._symbols:
                return False
            self._symbols = list(self._symbols) + [sym]
        try:
            ohlcv_all = self._feed.fetch_all_ohlcv([sym], interval="1m", period="2d")
            with self._lock:
                df = ohlcv_all.get(sym, pd.DataFrame())
                if not df.empty:
                    self._ohlcv_cache[sym] = df
                    self._prices[sym] = float(df["close"].iloc[-1])
            self._build_chart_bars()
            self._log(f"Added chart: {sym}")
            return True
        except Exception as e:
            with self._lock:
                self._symbols = [s for s in self._symbols if s != sym]
            logger.warning("Add symbol %s failed: %s", sym, e)
            return False

    def remove_symbol(self, symbol: str) -> bool:
        """Remove a symbol from charting. Returns True if removed. Keeps at least one symbol."""
        sym = symbol.strip().upper()
        with self._lock:
            if sym not in self._symbols or len(self._symbols) <= 1:
                return False
            self._symbols = [s for s in self._symbols if s != sym]
            self._ohlcv_cache.pop(sym, None)
            self._prices.pop(sym, None)
        self._log(f"Removed chart: {sym}")
        return True
