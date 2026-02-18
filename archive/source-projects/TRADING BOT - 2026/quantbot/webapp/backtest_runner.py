#!/usr/bin/env python3
"""
BacktestRunner: server-side backtest engine for the web UI.

Extracts and refactors logic from run_backtest_nq.py into a reusable class
that emits SocketIO progress events and returns structured results.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from quantbot.backtest.engine import BacktestConfig, apply_slippage, _pnl_dollars
from quantbot.backtest.metrics import compute_all_metrics
from quantbot.config import DEFAULT_SYMBOLS
from quantbot.mathlib.math_engine import MathEngine
from quantbot.signals.multi_asset import MultiAssetStrategyConfig

logger = logging.getLogger(__name__)

WARMUP_BARS = 200

YAHOO_TICKER_MAP: dict[str, str] = {
    "NQ": "NQ=F",
    "ES": "ES=F",
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
}

VALID_INTERVALS = ("5m", "15m", "30m", "1h")
VALID_PERIODS = ("7d", "14d", "30d", "60d")


@dataclass
class BacktestParams:
    """User-configurable backtest parameters."""
    symbol: str = "NQ"
    interval: str = "15m"
    period: str = "14d"
    initial_equity: float = 100_000.0
    rsi_period: int = 14
    rsi_oversold: float = 30.0
    rsi_overbought: float = 70.0
    z_long_threshold: float = -2.0
    z_short_threshold: float = 2.0
    bb_period: int = 20
    bb_std: float = 2.0
    atr_period: int = 14
    profit_atr_mult: float = 1.5
    stop_atr_mult: float = 1.0
    max_hold_minutes: int = 30
    volume_filter: bool = True


def _fetch_ohlcv_for_backtest(symbol: str, interval: str, period: str) -> pd.DataFrame:
    """Fetch OHLCV using the shared YahooFeed (single pipeline: no parallel implementation)."""
    from quantbot.data.yahoo_feed import YahooFeed

    empty = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    feed = YahooFeed()
    result = feed.fetch_all_ohlcv(symbols=[symbol], interval=interval, period=period)
    return result.get(symbol, empty)


def _precompute_indicators(
    df: pd.DataFrame,
    cfg: MultiAssetStrategyConfig,
    emit_fn: Any = None,
) -> dict:
    """Pre-compute all strategy indicators once over the full dataset."""
    m = MathEngine()
    close = df["close"].tolist()
    high = df["high"].tolist()
    low = df["low"].tolist()
    volume = df["volume"].tolist() if "volume" in df.columns else [0.0] * len(close)

    if emit_fn:
        emit_fn("Computing RSI...", 20)
    rsi_vals = m.rsi(close, cfg.rsi_period)
    rsi = [v.to_float() for v in rsi_vals] if rsi_vals else []

    if emit_fn:
        emit_fn("Computing Bollinger Bands...", 40)
    mid_vals, upper_vals, lower_vals = m.bollinger(close, cfg.bb_period, cfg.bb_std)
    upper = [v.to_float() for v in upper_vals] if upper_vals else []
    lower = [v.to_float() for v in lower_vals] if lower_vals else []

    if emit_fn:
        emit_fn("Computing Z-score...", 55)
    z_vals = m.zscore(close, cfg.bb_period)
    z_scores = [v.to_float() for v in z_vals] if z_vals else []

    if emit_fn:
        emit_fn("Computing ATR...", 70)
    atr_vals = m.atr(high, low, close, cfg.atr_period)
    atr = [v.to_float() for v in atr_vals] if atr_vals else []

    if emit_fn:
        emit_fn("Computing Volume SMA...", 85)
    vol_sma_vals = m.sma(volume, 20)
    vol_sma = [v.to_float() for v in vol_sma_vals] if vol_sma_vals else []

    return {
        "rsi": rsi,
        "upper": upper,
        "lower": lower,
        "z_scores": z_scores,
        "atr": atr,
        "vol_sma": vol_sma,
        "close": close,
        "high": high,
        "low": low,
        "volume": volume,
    }


def _run_fast_backtest(
    df: pd.DataFrame,
    indicators: dict,
    cfg: MultiAssetStrategyConfig,
    bt_config: BacktestConfig,
    symbol: str,
    volume_filter: bool = True,
) -> dict:
    """Run a fast backtest using pre-computed indicators."""
    close = indicators["close"]
    volume = indicators["volume"]
    rsi = indicators["rsi"]
    upper = indicators["upper"]
    lower = indicators["lower"]
    z_scores = indicators["z_scores"]
    atr = indicators["atr"]
    vol_sma = indicators["vol_sma"]

    num_bars = len(close)
    equity = bt_config.initial_equity
    equity_curve: list[float] = [equity]
    returns_list: list[float] = []
    trades_pnl: list[float] = []
    trade_details: list[dict[str, Any]] = []

    position: dict[str, Any] | None = None

    rsi_offset = num_bars - len(rsi)
    z_offset = num_bars - len(z_scores)
    upper_offset = num_bars - len(upper)
    lower_offset = num_bars - len(lower)
    atr_offset = num_bars - len(atr)
    vol_sma_offset = num_bars - len(vol_sma)

    for i in range(WARMUP_BARS, num_bars):
        bar_time = df.index[i]
        price = close[i]

        # Volume filter
        if volume_filter:
            vol_idx = i - vol_sma_offset
            if 0 <= vol_idx < len(vol_sma) and vol_sma[vol_idx] > 0:
                if volume[i] < vol_sma[vol_idx] * 0.5:
                    equity_curve.append(equity)
                    if equity_curve[-2] > 0:
                        ret = (equity - equity_curve[-2]) / equity_curve[-2]
                        returns_list.append(ret)
                    continue

        rsi_idx = i - rsi_offset
        z_idx = i - z_offset
        upper_idx = i - upper_offset
        lower_idx = i - lower_offset
        atr_idx = i - atr_offset

        has_rsi = 0 <= rsi_idx < len(rsi)
        has_z = 0 <= z_idx < len(z_scores)
        has_bb = 0 <= upper_idx < len(upper) and 0 <= lower_idx < len(lower)
        has_atr = 0 <= atr_idx < len(atr)

        # Exit logic
        if position is not None and has_atr:
            entry_price = position["entry_price"]
            side = position["side"]
            entry_atr = position["atr_at_entry"]
            entry_time = position["entry_time"]

            profit_thresh = entry_atr * cfg.profit_atr_mult
            stop_dist = entry_atr * cfg.stop_atr_mult

            if side == "long":
                pnl_points = price - entry_price
                trail_stop = entry_price - stop_dist
                hit_profit = pnl_points >= profit_thresh
                hit_stop = price < trail_stop
            else:
                pnl_points = entry_price - price
                trail_stop = entry_price + stop_dist
                hit_profit = pnl_points >= profit_thresh
                hit_stop = price > trail_stop

            time_elapsed = (bar_time - entry_time).total_seconds() / 60.0
            hit_time = time_elapsed >= cfg.max_hold_minutes

            exit_reason = None
            if hit_profit:
                exit_reason = "profit_target"
            elif hit_stop:
                exit_reason = "trailing_stop"
            elif hit_time:
                exit_reason = "time_stop"

            if exit_reason is not None:
                pnl = _pnl_dollars(symbol, entry_price, price, side, bt_config)
                equity += pnl
                trades_pnl.append(pnl)
                trade_details.append({
                    "symbol": symbol,
                    "side": side,
                    "entry_price": round(entry_price, 2),
                    "exit_price": round(price, 2),
                    "entry_time": str(entry_time),
                    "exit_time": str(bar_time),
                    "exit_reason": exit_reason,
                    "pnl": round(pnl, 2),
                    "hold_minutes": round(time_elapsed, 1),
                })
                position = None

        # Entry logic
        if position is None and has_rsi and has_z and has_bb and has_atr:
            r = rsi[rsi_idx]
            z_val = z_scores[z_idx]
            bb_low = lower[lower_idx]
            bb_high = upper[upper_idx]
            current_atr = atr[atr_idx]

            signal_side = None
            if r < cfg.rsi_oversold and price > bb_low and z_val < cfg.z_long_threshold:
                signal_side = "long"
            elif r > cfg.rsi_overbought and price < bb_high and z_val > cfg.z_short_threshold:
                signal_side = "short"

            if signal_side is not None:
                fill_price = apply_slippage(price, signal_side, bt_config)
                position = {
                    "entry_price": fill_price,
                    "entry_time": bar_time,
                    "side": signal_side,
                    "atr_at_entry": current_atr,
                }

        equity_curve.append(equity)
        if len(equity_curve) >= 2 and equity_curve[-2] > 0:
            ret = (equity - equity_curve[-2]) / equity_curve[-2]
            returns_list.append(ret)

    # Force-close open position at end
    if position is not None:
        final_price = close[-1]
        pnl = _pnl_dollars(symbol, position["entry_price"], final_price, position["side"], bt_config)
        equity += pnl
        trades_pnl.append(pnl)
        entry_time = position["entry_time"]
        time_elapsed = (df.index[-1] - entry_time).total_seconds() / 60.0
        trade_details.append({
            "symbol": symbol,
            "side": position["side"],
            "entry_price": round(position["entry_price"], 2),
            "exit_price": round(final_price, 2),
            "entry_time": str(entry_time),
            "exit_time": str(df.index[-1]),
            "exit_reason": "end_of_data",
            "pnl": round(pnl, 2),
            "hold_minutes": round(time_elapsed, 1),
        })
        equity_curve.append(equity)

    metrics = compute_all_metrics(returns_list, equity_curve, trades_pnl)

    return {
        "equity_curve": equity_curve,
        "returns": returns_list,
        "trades": trades_pnl,
        "trade_details": trade_details,
        "metrics": metrics,
    }


def _compute_diagnostics(
    indicators: dict,
    cfg: MultiAssetStrategyConfig,
    volume_filter: bool = True,
) -> dict[str, Any]:
    """Compute signal diagnostics when no trades were generated."""
    rsi = indicators["rsi"]
    z_scores = indicators["z_scores"]
    upper = indicators["upper"]
    lower = indicators["lower"]
    close = indicators["close"]
    volume = indicators["volume"]
    vol_sma = indicators["vol_sma"]
    atr = indicators["atr"]

    num_bars = len(close)
    rsi_offset = num_bars - len(rsi)
    z_offset = num_bars - len(z_scores)
    upper_offset = num_bars - len(upper)
    lower_offset = num_bars - len(lower)
    vol_sma_offset = num_bars - len(vol_sma)

    rsi_oversold_count = 0
    rsi_overbought_count = 0
    z_long_count = 0
    z_short_count = 0
    bb_long_count = 0
    bb_short_count = 0
    vol_pass_count = 0
    vol_block_count = 0
    long_signal_count = 0
    short_signal_count = 0
    long_blocked_by_vol = 0
    short_blocked_by_vol = 0
    bars_analyzed = 0

    for i in range(WARMUP_BARS, num_bars):
        bars_analyzed += 1
        rsi_idx = i - rsi_offset
        z_idx = i - z_offset
        upper_idx = i - upper_offset
        lower_idx = i - lower_offset
        vol_idx = i - vol_sma_offset

        has_rsi = 0 <= rsi_idx < len(rsi)
        has_z = 0 <= z_idx < len(z_scores)
        has_bb_upper = 0 <= upper_idx < len(upper)
        has_bb_lower = 0 <= lower_idx < len(lower)
        has_vol = 0 <= vol_idx < len(vol_sma)

        vol_ok = True
        if volume_filter and has_vol and vol_sma[vol_idx] > 0:
            if volume[i] < vol_sma[vol_idx] * 0.5:
                vol_ok = False
                vol_block_count += 1
            else:
                vol_pass_count += 1

        if has_rsi:
            r = rsi[rsi_idx]
            if r < cfg.rsi_oversold:
                rsi_oversold_count += 1
            if r > cfg.rsi_overbought:
                rsi_overbought_count += 1

        if has_z:
            z = z_scores[z_idx]
            if z < cfg.z_long_threshold:
                z_long_count += 1
            if z > cfg.z_short_threshold:
                z_short_count += 1

        if has_bb_lower:
            if close[i] > lower[lower_idx]:
                bb_long_count += 1
        if has_bb_upper:
            if close[i] < upper[upper_idx]:
                bb_short_count += 1

        if has_rsi and has_z and has_bb_lower:
            r = rsi[rsi_idx]
            z = z_scores[z_idx]
            if r < cfg.rsi_oversold and z < cfg.z_long_threshold and close[i] > lower[lower_idx]:
                if vol_ok:
                    long_signal_count += 1
                else:
                    long_blocked_by_vol += 1

        if has_rsi and has_z and has_bb_upper:
            r = rsi[rsi_idx]
            z = z_scores[z_idx]
            if r > cfg.rsi_overbought and z > cfg.z_short_threshold and close[i] < upper[upper_idx]:
                if vol_ok:
                    short_signal_count += 1
                else:
                    short_blocked_by_vol += 1

    # Indicator extremes
    rsi_min = min(rsi[WARMUP_BARS:]) if len(rsi) > WARMUP_BARS else (min(rsi) if rsi else None)
    rsi_max = max(rsi[WARMUP_BARS:]) if len(rsi) > WARMUP_BARS else (max(rsi) if rsi else None)
    z_min = min(z_scores[WARMUP_BARS:]) if len(z_scores) > WARMUP_BARS else (min(z_scores) if z_scores else None)
    z_max = max(z_scores[WARMUP_BARS:]) if len(z_scores) > WARMUP_BARS else (max(z_scores) if z_scores else None)

    # Market context (last bar)
    market_context: dict[str, Any] = {}
    if rsi:
        market_context["rsi"] = round(rsi[-1], 2)
    if z_scores:
        market_context["z_score"] = round(z_scores[-1], 3)
    if upper:
        market_context["bb_upper"] = round(upper[-1], 2)
    if lower:
        market_context["bb_lower"] = round(lower[-1], 2)
    if atr:
        market_context["atr"] = round(atr[-1], 2)
    market_context["last_close"] = round(close[-1], 2)
    if vol_sma and len(volume) > 0:
        market_context["volume"] = round(volume[-1], 0)
        market_context["volume_avg"] = round(vol_sma[-1], 0)

    return {
        "bars_analyzed": bars_analyzed,
        "vol_pass_count": vol_pass_count,
        "vol_block_count": vol_block_count,
        "rsi_oversold_count": rsi_oversold_count,
        "rsi_overbought_count": rsi_overbought_count,
        "z_long_count": z_long_count,
        "z_short_count": z_short_count,
        "bb_long_count": bb_long_count,
        "bb_short_count": bb_short_count,
        "long_signal_count": long_signal_count,
        "short_signal_count": short_signal_count,
        "long_blocked_by_vol": long_blocked_by_vol,
        "short_blocked_by_vol": short_blocked_by_vol,
        "rsi_min": round(rsi_min, 2) if rsi_min is not None else None,
        "rsi_max": round(rsi_max, 2) if rsi_max is not None else None,
        "z_min": round(z_min, 3) if z_min is not None else None,
        "z_max": round(z_max, 3) if z_max is not None else None,
        "market_context": market_context,
    }


class BacktestRunner:
    """Server-side backtest runner with SocketIO progress events."""

    def __init__(self) -> None:
        self._status: str = "idle"
        self._result: dict[str, Any] | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            out: dict[str, Any] = {"status": self._status}
            if self._status == "complete" and self._result is not None:
                out["result"] = self._result
            return out

    def is_running(self) -> bool:
        with self._lock:
            return self._status == "running"

    def start(self, params: BacktestParams, socketio: Any) -> dict[str, Any]:
        """Start a backtest in a background thread."""
        with self._lock:
            if self._status == "running":
                return {"ok": False, "error": "Backtest already running"}
            self._status = "running"
            self._result = None

        self._thread = threading.Thread(
            target=self._run,
            args=(params, socketio),
            daemon=True,
        )
        self._thread.start()
        return {"ok": True}

    def _run(self, params: BacktestParams, socketio: Any) -> None:
        """Execute backtest with progress events."""

        def emit_progress(stage: str, pct: int) -> None:
            try:
                socketio.emit("backtest_progress", {
                    "stage": stage,
                    "pct": pct,
                })
            except Exception:
                pass

        try:
            # ── Validate params ──
            symbol = params.symbol.upper()
            yahoo_ticker = YAHOO_TICKER_MAP.get(symbol)
            if not yahoo_ticker:
                raise ValueError(f"Unknown symbol: {symbol}")
            if params.interval not in VALID_INTERVALS:
                raise ValueError(f"Invalid interval: {params.interval}")
            if params.period not in VALID_PERIODS:
                raise ValueError(f"Invalid period: {params.period}")

            # ── Step 1: Fetch data (shared Market Data Feed pipeline) ──
            emit_progress("Fetching market data...", 5)
            t0 = time.time()
            df = _fetch_ohlcv_for_backtest(symbol, interval=params.interval, period=params.period)

            if df.empty:
                raise ValueError("No data returned from Yahoo Finance")

            bar_count = len(df)
            if bar_count < WARMUP_BARS:
                raise ValueError(
                    f"Insufficient bars ({bar_count}). Need at least {WARMUP_BARS}. "
                    f"Try a longer period or shorter interval."
                )

            date_start = str(df.index[0])
            date_end = str(df.index[-1])
            price_start = float(df["close"].iloc[0])
            price_end = float(df["close"].iloc[-1])
            price_high = float(df["high"].max())
            price_low = float(df["low"].min())
            buy_hold_ret = ((price_end - price_start) / price_start) * 100

            data_summary = {
                "bars": bar_count,
                "date_start": date_start,
                "date_end": date_end,
                "price_start": round(price_start, 2),
                "price_end": round(price_end, 2),
                "price_high": round(price_high, 2),
                "price_low": round(price_low, 2),
                "buy_hold_pct": round(buy_hold_ret, 2),
            }

            fetch_time = time.time() - t0
            emit_progress("Data loaded. Computing indicators...", 15)

            # ── Step 2: Pre-compute indicators ──
            cfg = MultiAssetStrategyConfig(
                rsi_period=params.rsi_period,
                rsi_oversold=params.rsi_oversold,
                rsi_overbought=params.rsi_overbought,
                z_long_threshold=params.z_long_threshold,
                z_short_threshold=params.z_short_threshold,
                bb_period=params.bb_period,
                bb_std=params.bb_std,
                atr_period=params.atr_period,
                profit_atr_mult=params.profit_atr_mult,
                stop_atr_mult=params.stop_atr_mult,
                max_hold_minutes=params.max_hold_minutes,
            )

            t1 = time.time()
            indicators = _precompute_indicators(df, cfg, emit_fn=emit_progress)
            indicator_time = time.time() - t1

            # ── Step 3: Run backtest ──
            emit_progress("Running simulation...", 90)

            inst = DEFAULT_SYMBOLS.get(symbol)
            tick_size = inst.tick_size if inst else 0.25
            tick_value = inst.tick_value if inst else 5.0

            bt_config = BacktestConfig(
                initial_equity=params.initial_equity,
                slippage_ticks=0.25,
                slippage_bps=0.5,
                tick_size=tick_size,
                tick_value=tick_value,
            )

            t2 = time.time()
            result = _run_fast_backtest(
                df, indicators, cfg, bt_config, symbol,
                volume_filter=params.volume_filter,
            )
            sim_time = time.time() - t2

            # ── Step 4: Compute metrics / diagnostics ──
            emit_progress("Computing metrics...", 95)

            trades_pnl = result.get("trades", [])
            equity_curve = result.get("equity_curve", [])
            metrics = result.get("metrics", {})
            trade_details = result.get("trade_details", [])

            final_equity = equity_curve[-1] if equity_curve else params.initial_equity
            total_pnl = final_equity - params.initial_equity
            total_return_pct = (total_pnl / params.initial_equity) * 100.0

            # Diagnostics (always computed, shown when no trades)
            diagnostics = _compute_diagnostics(indicators, cfg, params.volume_filter)

            # Trade statistics
            wins = [t for t in trades_pnl if t > 0]
            losses = [t for t in trades_pnl if t <= 0]
            avg_hold = 0.0
            if trade_details:
                avg_hold = sum(td.get("hold_minutes", 0) for td in trade_details) / len(trade_details)

            # Build equity curve with timestamps for chart
            equity_chart_data: list[dict[str, Any]] = []
            eq_idx = 0
            for i in range(WARMUP_BARS, len(df)):
                if eq_idx < len(equity_curve):
                    ts = int(df.index[i].timestamp())
                    equity_chart_data.append({"time": ts, "value": round(equity_curve[eq_idx], 2)})
                    eq_idx += 1

            full_result: dict[str, Any] = {
                "params": {
                    "symbol": symbol,
                    "interval": params.interval,
                    "period": params.period,
                    "initial_equity": params.initial_equity,
                    "rsi_oversold": params.rsi_oversold,
                    "rsi_overbought": params.rsi_overbought,
                    "z_long_threshold": params.z_long_threshold,
                    "z_short_threshold": params.z_short_threshold,
                    "bb_period": params.bb_period,
                    "bb_std": params.bb_std,
                    "atr_period": params.atr_period,
                    "profit_atr_mult": params.profit_atr_mult,
                    "stop_atr_mult": params.stop_atr_mult,
                    "max_hold_minutes": params.max_hold_minutes,
                    "volume_filter": params.volume_filter,
                    "tick_size": tick_size,
                    "tick_value": tick_value,
                },
                "data_summary": data_summary,
                "performance": {
                    "starting_equity": params.initial_equity,
                    "final_equity": round(final_equity, 2),
                    "total_pnl": round(total_pnl, 2),
                    "total_return_pct": round(total_return_pct, 2),
                    "buy_hold_pct": round(buy_hold_ret, 2),
                },
                "metrics": metrics,
                "trade_stats": {
                    "total_trades": len(trades_pnl),
                    "winning_trades": len(wins),
                    "losing_trades": len(losses),
                    "best_trade": round(max(wins), 2) if wins else 0,
                    "worst_trade": round(min(losses), 2) if losses else 0,
                    "avg_hold_minutes": round(avg_hold, 1),
                },
                "trade_details": trade_details,
                "equity_chart": equity_chart_data,
                "diagnostics": diagnostics,
                "timing": {
                    "fetch_sec": round(fetch_time, 1),
                    "indicator_sec": round(indicator_time, 1),
                    "simulation_sec": round(sim_time, 1),
                    "total_sec": round(time.time() - t0, 1),
                },
            }

            with self._lock:
                self._status = "complete"
                self._result = full_result

            socketio.emit("backtest_complete", full_result)
            logger.info(
                "Backtest complete: %s %s %s | %d trades | P&L $%.2f | %.1fs",
                symbol, params.interval, params.period,
                len(trades_pnl), total_pnl, time.time() - t0,
            )

        except Exception as exc:
            logger.exception("Backtest failed: %s", exc)
            with self._lock:
                self._status = "error"
                self._result = {"error": str(exc)}
            try:
                socketio.emit("backtest_error", {"error": str(exc)})
            except Exception:
                pass
