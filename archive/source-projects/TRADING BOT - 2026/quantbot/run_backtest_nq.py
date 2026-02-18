#!/usr/bin/env python3
"""
NQ 15-Minute Backtest Runner
Fetches 60 days of NQ 15-minute data from Yahoo Finance and runs a fast backtest
with the MultiAssetStrategy's NQ entry/exit logic on the 15-minute timeframe.

Pre-computes all indicators once (O(n)) instead of per-bar recomputation (O(n^2))
to avoid the slow Abacus overhead on every bar.

Usage:
    python3 -m quantbot.run_backtest_nq
"""
from __future__ import annotations

import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from quantbot.backtest.engine import BacktestConfig, apply_slippage, _pnl_dollars
from quantbot.data.yahoo_feed import YahooFeed
from quantbot.config import DEFAULT_SYMBOLS
from quantbot.mathlib.math_engine import MathEngine
from quantbot.signals.multi_asset import MultiAssetStrategyConfig

SYMBOL = "NQ"
INTERVAL = "15m"
PERIOD = "14d"
INITIAL_EQUITY = 100_000.0
WARMUP_BARS = 200

SEPARATOR = "=" * 72
THIN_SEP = "-" * 72


def fetch_ohlcv_for_backtest(symbol: str, interval: str, period: str) -> pd.DataFrame:
    """Fetch OHLCV using the shared YahooFeed (single pipeline)."""
    empty = pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    feed = YahooFeed()
    result = feed.fetch_all_ohlcv(symbols=[symbol], interval=interval, period=period)
    return result.get(symbol, empty)


def precompute_indicators(df: pd.DataFrame, cfg: MultiAssetStrategyConfig) -> dict:
    """Pre-compute all strategy indicators once over the full dataset."""
    m = MathEngine()
    close = df["close"].tolist()
    high = df["high"].tolist()
    low = df["low"].tolist()
    volume = df["volume"].tolist() if "volume" in df.columns else [0.0] * len(close)

    print("  Computing RSI...")
    rsi_vals = m.rsi(close, cfg.rsi_period)
    rsi = [v.to_float() for v in rsi_vals] if rsi_vals else []

    print("  Computing Bollinger Bands...")
    mid_vals, upper_vals, lower_vals = m.bollinger(close, cfg.bb_period, cfg.bb_std)
    upper = [v.to_float() for v in upper_vals] if upper_vals else []
    lower = [v.to_float() for v in lower_vals] if lower_vals else []

    print("  Computing Z-score...")
    z_vals = m.zscore(close, cfg.bb_period)
    z_scores = [v.to_float() for v in z_vals] if z_vals else []

    print("  Computing ATR...")
    atr_vals = m.atr(high, low, close, cfg.atr_period)
    atr = [v.to_float() for v in atr_vals] if atr_vals else []

    print("  Computing Volume SMA...")
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


def run_fast_backtest(
    df: pd.DataFrame,
    indicators: dict,
    cfg: MultiAssetStrategyConfig,
    bt_config: BacktestConfig,
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
    equity_curve = [equity]
    returns_list = []
    trades_pnl = []
    trade_details = []

    position = None
    m = MathEngine()

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
        vol_idx = i - vol_sma_offset
        if vol_idx >= 0 and vol_idx < len(vol_sma) and vol_sma[vol_idx] > 0:
            if volume[i] < vol_sma[vol_idx] * 0.5:
                equity_curve.append(equity)
                if equity_curve[-2] > 0:
                    ret = (equity - equity_curve[-2]) / equity_curve[-2]
                    returns_list.append(ret)
                continue

        # Get indicator values for this bar
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
                pnl = _pnl_dollars(SYMBOL, entry_price, price, side, bt_config)
                equity += pnl
                trades_pnl.append(pnl)
                trade_details.append({
                    "symbol": SYMBOL,
                    "side": side,
                    "entry_price": entry_price,
                    "exit_price": price,
                    "entry_time": str(entry_time),
                    "exit_time": str(bar_time),
                    "exit_reason": exit_reason,
                    "pnl": pnl,
                    "hold_minutes": round(time_elapsed, 1),
                })
                position = None

        # Entry logic (only if no position)
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
                    "rsi": r,
                    "z": z_val,
                }

        equity_curve.append(equity)
        if len(equity_curve) >= 2 and equity_curve[-2] > 0:
            ret = (equity - equity_curve[-2]) / equity_curve[-2]
            returns_list.append(ret)

    # Force-close any open position at end
    if position is not None:
        final_price = close[-1]
        pnl = _pnl_dollars(SYMBOL, position["entry_price"], final_price, position["side"], bt_config)
        equity += pnl
        trades_pnl.append(pnl)
        trade_details.append({
            "symbol": SYMBOL,
            "side": position["side"],
            "entry_price": position["entry_price"],
            "exit_price": final_price,
            "entry_time": str(position["entry_time"]),
            "exit_time": str(df.index[-1]),
            "exit_reason": "end_of_data",
            "pnl": pnl,
            "hold_minutes": 0,
        })
        equity_curve.append(equity)

    from quantbot.backtest.metrics import compute_all_metrics
    metrics = compute_all_metrics(returns_list, equity_curve, trades_pnl)

    return {
        "equity_curve": equity_curve,
        "returns": returns_list,
        "trades": trades_pnl,
        "trade_details": trade_details,
        "metrics": metrics,
    }


def main() -> None:
    print(SEPARATOR)
    print("  QUANTBOT BACKTEST: NQ (Nasdaq-100 Futures) -- 15-Min Timeframe, 14 Days")
    print(SEPARATOR)
    print()

    # ── Step 1: Fetch data ──────────────────────────────────────────
    print("[1/4] Fetching NQ 15-minute data from Yahoo Finance...")
    t0 = time.time()
    try:
        df = fetch_ohlcv_for_backtest(SYMBOL, interval=INTERVAL, period=PERIOD)
    except Exception as exc:
        print(f"  ERROR: Failed to fetch data: {exc}")
        sys.exit(1)

    if df.empty:
        print("  ERROR: No data returned from Yahoo Finance.")
        sys.exit(1)

    bar_count = len(df)
    date_start = df.index[0]
    date_end = df.index[-1]
    price_start = float(df["close"].iloc[0])
    price_end = float(df["close"].iloc[-1])
    price_high = float(df["high"].max())
    price_low = float(df["low"].min())

    print(f"  Bars loaded:  {bar_count}")
    print(f"  Date range:   {date_start} -> {date_end}")
    print(f"  Price range:  {price_low:,.2f} - {price_high:,.2f}")
    print(f"  Open/Close:   {price_start:,.2f} -> {price_end:,.2f}")
    buy_hold_ret = ((price_end - price_start) / price_start) * 100
    print(f"  Buy & Hold:   {buy_hold_ret:+.2f}%")
    print(f"  Fetch time:   {time.time() - t0:.1f}s")
    print()

    if bar_count < WARMUP_BARS:
        print(f"  ERROR: Insufficient bars ({bar_count}). Need at least {WARMUP_BARS}.")
        sys.exit(1)

    # ── Step 2: Pre-compute indicators ──────────────────────────────
    print("[2/4] Pre-computing strategy indicators...")
    cfg = MultiAssetStrategyConfig()
    t1 = time.time()
    indicators = precompute_indicators(df, cfg)
    print(f"  Indicator computation time: {time.time() - t1:.1f}s")
    print()

    # ── Step 3: Run backtest ────────────────────────────────────────
    print("[3/4] Running fast backtest...")
    inst = DEFAULT_SYMBOLS.get(SYMBOL)
    tick_size = inst.tick_size if inst else 0.25
    tick_value = inst.tick_value if inst else 5.0

    print(f"  Symbol:         {SYMBOL}")
    print(f"  Tick size:      {tick_size}")
    print(f"  Tick value:     ${tick_value}")
    print(f"  1 point move:   ${tick_value / tick_size:,.2f}")
    print(f"  Initial equity: ${INITIAL_EQUITY:,.2f}")
    print(f"  Slippage:       0.25 ticks + 0.5 bps")
    print()
    print(f"  Strategy: MultiAssetStrategy (NQ rules)")
    print(f"    Entry LONG:   RSI < {cfg.rsi_oversold}, Z-score < {cfg.z_long_threshold}, price > lower BB")
    print(f"    Entry SHORT:  RSI > {cfg.rsi_overbought}, Z-score > {cfg.z_short_threshold}, price < upper BB")
    print(f"    Exit:         {cfg.profit_atr_mult}x ATR profit, {cfg.stop_atr_mult}x ATR trailing stop, {cfg.max_hold_minutes}min time stop")
    print(f"    Volume:       Must be > 50% of 20-bar avg")
    print()

    bt_config = BacktestConfig(
        initial_equity=INITIAL_EQUITY,
        slippage_ticks=0.25,
        slippage_bps=0.5,
        tick_size=tick_size,
        tick_value=tick_value,
    )

    t2 = time.time()
    result = run_fast_backtest(df, indicators, cfg, bt_config)
    backtest_time = time.time() - t2
    print(f"  Backtest time:  {backtest_time:.1f}s")
    print()

    # ── Step 4: Print results ───────────────────────────────────────
    print("[4/4] Backtest Results")
    print(SEPARATOR)
    print()

    metrics = result.get("metrics", {})
    trades_pnl = result.get("trades", [])
    trade_details = result.get("trade_details", [])
    equity_curve = result.get("equity_curve", [])

    if not trades_pnl:
        print("  NO TRADES GENERATED during the backtest period.")
        print()
        print("  Possible reasons:")
        print("    - RSI did not reach oversold (<30) or overbought (>70)")
        print("    - Z-score did not reach -2.0 or +2.0")
        print("    - Volume filter blocked signals (vol < 50% of 20-bar avg)")
        print("    - Market conditions were not conducive to mean-reversion")
        print()
        _print_market_context(indicators, cfg)
        _print_signal_diagnostics(indicators, cfg)
        _print_indicator_extremes(indicators, cfg)

        # Run with relaxed parameters to show actual trading performance
        print()
        print(SEPARATOR)
        print("  RETEST WITH RELAXED PARAMETERS")
        print("  (RSI 40/60, Z-score -1.0/+1.0 -- more trade opportunities)")
        print(SEPARATOR)
        print()

        relaxed_cfg = MultiAssetStrategyConfig(
            rsi_oversold=40.0,
            rsi_overbought=60.0,
            z_long_threshold=-1.0,
            z_short_threshold=1.0,
            profit_atr_mult=1.5,
            stop_atr_mult=1.0,
            max_hold_minutes=30,
        )

        print(f"  Relaxed Entry LONG:   RSI < {relaxed_cfg.rsi_oversold}, Z-score < {relaxed_cfg.z_long_threshold}, price > lower BB")
        print(f"  Relaxed Entry SHORT:  RSI > {relaxed_cfg.rsi_overbought}, Z-score > {relaxed_cfg.z_short_threshold}, price < upper BB")
        print()

        relaxed_result = run_fast_backtest(df, indicators, relaxed_cfg, bt_config)
        _print_backtest_results(relaxed_result, bt_config, buy_hold_ret)
        return

    _print_backtest_results(result, bt_config, buy_hold_ret)

    total_time = time.time() - t0
    print(f"  Total runtime:  {total_time:.1f}s")
    print(SEPARATOR)
    print("  BACKTEST COMPLETE")
    print(SEPARATOR)


def _print_backtest_results(result: dict, bt_config: BacktestConfig, buy_hold_ret: float) -> None:
    """Print formatted backtest results."""
    metrics = result.get("metrics", {})
    trades_pnl = result.get("trades", [])
    trade_details = result.get("trade_details", [])
    equity_curve = result.get("equity_curve", [])

    if not trades_pnl:
        print("  NO TRADES GENERATED.")
        print()
        return

    final_equity = equity_curve[-1] if equity_curve else bt_config.initial_equity
    total_pnl = final_equity - bt_config.initial_equity
    total_return_pct = (total_pnl / bt_config.initial_equity) * 100.0

    print("  PERFORMANCE SUMMARY")
    print(THIN_SEP)
    print(f"  Starting Equity:    ${bt_config.initial_equity:>14,.2f}")
    print(f"  Final Equity:       ${final_equity:>14,.2f}")
    print(f"  Total P&L:          ${total_pnl:>14,.2f}  ({total_return_pct:+.2f}%)")
    print(f"  Buy & Hold:         {buy_hold_ret:>14.2f}%")
    print()

    print("  KEY METRICS")
    print(THIN_SEP)
    _print_metric("Sharpe Ratio", metrics.get("sharpe"), fmt=".3f")
    _print_metric("Sortino Ratio", metrics.get("sortino"), fmt=".3f")
    _print_metric("Calmar Ratio", metrics.get("calmar"), fmt=".3f")
    _print_metric("Max Drawdown", metrics.get("max_drawdown"), fmt=".2%")
    _print_metric("Win Rate", metrics.get("win_rate"), fmt=".2%")
    _print_metric("Profit Factor", metrics.get("profit_factor"), fmt=".2f")
    _print_metric("Expectancy", metrics.get("expectancy"), fmt="$,.2f")
    _print_metric("Total Trades", metrics.get("total_trades"), fmt=".0f")
    _print_metric("Total P&L", metrics.get("total_pnl"), fmt="$,.2f")
    _print_metric("Avg Win", metrics.get("avg_win"), fmt="$,.2f")
    _print_metric("Avg Loss", metrics.get("avg_loss"), fmt="$,.2f")
    print()

    wins = [t for t in trades_pnl if t > 0]
    losses = [t for t in trades_pnl if t <= 0]
    print("  TRADE STATISTICS")
    print(THIN_SEP)
    print(f"  Total Trades:       {len(trades_pnl)}")
    print(f"  Winning Trades:     {len(wins)}")
    print(f"  Losing Trades:      {len(losses)}")
    if wins:
        print(f"  Best Trade:         ${max(wins):>10,.2f}")
    if losses:
        print(f"  Worst Trade:        ${min(losses):>10,.2f}")
    if trades_pnl:
        avg_hold = sum(td.get("hold_minutes", 0) for td in trade_details) / len(trade_details)
        print(f"  Avg Hold Time:      {avg_hold:.1f} min")
    print()

    if trade_details:
        print("  TRADE LOG")
        print(THIN_SEP)
        print(f"  {'#':>3}  {'Side':<6} {'Entry':>12} {'Exit':>12} {'P&L ($)':>12} {'Reason':<16} {'Hold':>6} {'Entry Time'}")
        print(f"  {'---':>3}  {'------':<6} {'--------':>12} {'--------':>12} {'--------':>12} {'------':<16} {'----':>6} {'----------'}")
        for idx, td in enumerate(trade_details, 1):
            pnl_val = td["pnl"]
            pnl_prefix = "+" if pnl_val > 0 else ""
            hold = f"{td.get('hold_minutes', 0):.0f}m"
            entry_time_short = td["entry_time"][:19]
            print(f"  {idx:>3}  {td['side']:<6} {td['entry_price']:>12,.2f} {td['exit_price']:>12,.2f} {pnl_prefix}{pnl_val:>11,.2f} {td['exit_reason']:<16} {hold:>6} {entry_time_short}")
        print()

    if len(equity_curve) > 1:
        peak = max(equity_curve)
        trough = min(equity_curve)
        print("  EQUITY CURVE")
        print(THIN_SEP)
        print(f"  Peak Equity:        ${peak:>14,.2f}")
        print(f"  Trough Equity:      ${trough:>14,.2f}")
        print(f"  Bars Processed:     {len(equity_curve) - 1}")
        print()


def _print_metric(label: str, value, fmt: str = ".2f") -> None:
    if value is None:
        print(f"  {label:<22} {'N/A':>14}")
        return
    if fmt.startswith("$"):
        formatted = f"${value:{fmt[1:]}}"
    elif fmt.endswith("%"):
        formatted = f"{value * 100:{fmt[:-1]}}%"
    else:
        formatted = f"{value:{fmt}}"
    print(f"  {label:<22} {formatted:>14}")


def _print_market_context(indicators: dict, cfg: MultiAssetStrategyConfig) -> None:
    """Print current indicator values to explain why no trades fired."""
    rsi = indicators["rsi"]
    z_scores = indicators["z_scores"]
    upper = indicators["upper"]
    lower = indicators["lower"]
    atr = indicators["atr"]
    close = indicators["close"]
    volume = indicators["volume"]
    vol_sma = indicators["vol_sma"]

    print("  MARKET CONTEXT (last bar indicators)")
    print(THIN_SEP)
    if rsi:
        print(f"  RSI({cfg.rsi_period}):          {rsi[-1]:.2f}   (need <{cfg.rsi_oversold} for LONG, >{cfg.rsi_overbought} for SHORT)")
    if z_scores:
        print(f"  Z-score({cfg.bb_period}):       {z_scores[-1]:.3f}   (need <{cfg.z_long_threshold} for LONG, >{cfg.z_short_threshold} for SHORT)")
    if upper:
        print(f"  Bollinger Upper:    {upper[-1]:,.2f}")
    if lower:
        print(f"  Bollinger Lower:    {lower[-1]:,.2f}")
    if atr:
        print(f"  ATR({cfg.atr_period}):          {atr[-1]:.2f}")
    print(f"  Last Close:         {close[-1]:,.2f}")
    if vol_sma and len(volume) > 0:
        avg_vol = vol_sma[-1]
        cur_vol = volume[-1]
        pct = (cur_vol / avg_vol * 100) if avg_vol > 0 else 0
        print(f"  Volume:             {cur_vol:,.0f}  (avg: {avg_vol:,.0f}, ratio: {pct:.0f}%)")
    print()


def _print_signal_diagnostics(indicators: dict, cfg: MultiAssetStrategyConfig) -> None:
    """Check how many bars meet each condition individually and together."""
    rsi = indicators["rsi"]
    z_scores = indicators["z_scores"]
    upper = indicators["upper"]
    lower = indicators["lower"]
    close = indicators["close"]
    volume = indicators["volume"]
    vol_sma = indicators["vol_sma"]

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
    near_misses_long = []
    near_misses_short = []

    for i in range(WARMUP_BARS, num_bars):
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
        if has_vol and vol_sma[vol_idx] > 0:
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

        if has_bb_lower and has_rsi:
            if close[i] > lower[lower_idx]:
                bb_long_count += 1
        if has_bb_upper and has_rsi:
            if close[i] < upper[upper_idx]:
                bb_short_count += 1

        # Check combined conditions
        if has_rsi and has_z and has_bb_lower:
            r = rsi[rsi_idx]
            z = z_scores[z_idx]
            rsi_ok = r < cfg.rsi_oversold
            z_ok = z < cfg.z_long_threshold
            bb_ok = close[i] > lower[lower_idx]
            if rsi_ok and z_ok and bb_ok:
                if vol_ok:
                    long_signal_count += 1
                else:
                    long_blocked_by_vol += 1

        if has_rsi and has_z and has_bb_upper:
            r = rsi[rsi_idx]
            z = z_scores[z_idx]
            rsi_ok = r > cfg.rsi_overbought
            z_ok = z > cfg.z_short_threshold
            bb_ok = close[i] < upper[upper_idx]
            if rsi_ok and z_ok and bb_ok:
                if vol_ok:
                    short_signal_count += 1
                else:
                    short_blocked_by_vol += 1

    total_bars = num_bars - WARMUP_BARS
    print("  SIGNAL DIAGNOSTICS (bar-by-bar analysis)")
    print(THIN_SEP)
    print(f"  Bars analyzed:         {total_bars}")
    print()
    print(f"  Volume filter pass:    {vol_pass_count:>5} bars  ({vol_pass_count/total_bars*100:.1f}%)")
    print(f"  Volume filter block:   {vol_block_count:>5} bars  ({vol_block_count/total_bars*100:.1f}%)")
    print()
    print(f"  RSI < {cfg.rsi_oversold} (oversold):   {rsi_oversold_count:>5} bars")
    print(f"  RSI > {cfg.rsi_overbought} (overbought):  {rsi_overbought_count:>5} bars")
    print(f"  Z < {cfg.z_long_threshold} (long zone):  {z_long_count:>5} bars")
    print(f"  Z > {cfg.z_short_threshold} (short zone): {z_short_count:>5} bars")
    print(f"  Price > lower BB:      {bb_long_count:>5} bars")
    print(f"  Price < upper BB:      {bb_short_count:>5} bars")
    print()
    print(f"  LONG signals (all 3 conditions + vol):   {long_signal_count}")
    print(f"  LONG blocked by volume only:             {long_blocked_by_vol}")
    print(f"  SHORT signals (all 3 conditions + vol):  {short_signal_count}")
    print(f"  SHORT blocked by volume only:            {short_blocked_by_vol}")
    print()


def _print_indicator_extremes(indicators: dict, cfg: MultiAssetStrategyConfig) -> None:
    """Show how close indicators came to triggering entry signals."""
    rsi = indicators["rsi"]
    z_scores = indicators["z_scores"]

    if not rsi or not z_scores:
        return

    rsi_min = min(rsi[WARMUP_BARS:]) if len(rsi) > WARMUP_BARS else min(rsi)
    rsi_max = max(rsi[WARMUP_BARS:]) if len(rsi) > WARMUP_BARS else max(rsi)
    z_min = min(z_scores[WARMUP_BARS:]) if len(z_scores) > WARMUP_BARS else min(z_scores)
    z_max = max(z_scores[WARMUP_BARS:]) if len(z_scores) > WARMUP_BARS else max(z_scores)

    print("  INDICATOR EXTREMES (during backtest window)")
    print(THIN_SEP)
    print(f"  RSI min:  {rsi_min:.2f}  (threshold: <{cfg.rsi_oversold} for LONG)")
    print(f"  RSI max:  {rsi_max:.2f}  (threshold: >{cfg.rsi_overbought} for SHORT)")
    print(f"  Z min:    {z_min:.3f}  (threshold: <{cfg.z_long_threshold} for LONG)")
    print(f"  Z max:    {z_max:.3f}  (threshold: >{cfg.z_short_threshold} for SHORT)")

    rsi_long_gap = rsi_min - cfg.rsi_oversold
    rsi_short_gap = cfg.rsi_overbought - rsi_max
    z_long_gap = z_min - cfg.z_long_threshold
    z_short_gap = cfg.z_short_threshold - z_max

    print()
    if rsi_long_gap > 0:
        print(f"  RSI never reached oversold. Closest: {rsi_min:.2f} (gap: {rsi_long_gap:.2f})")
    else:
        print(f"  RSI reached oversold ({rsi_min:.2f})")
    if rsi_short_gap > 0:
        print(f"  RSI never reached overbought. Closest: {rsi_max:.2f} (gap: {rsi_short_gap:.2f})")
    else:
        print(f"  RSI reached overbought ({rsi_max:.2f})")
    if z_long_gap > 0:
        print(f"  Z-score never reached long threshold. Closest: {z_min:.3f} (gap: {z_long_gap:.3f})")
    else:
        print(f"  Z-score reached long threshold ({z_min:.3f})")
    if z_short_gap > 0:
        print(f"  Z-score never reached short threshold. Closest: {z_max:.3f} (gap: {z_short_gap:.3f})")
    else:
        print(f"  Z-score reached short threshold ({z_max:.3f})")
    print()


if __name__ == "__main__":
    main()
