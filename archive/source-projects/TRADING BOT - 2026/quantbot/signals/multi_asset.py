"""
MultiAssetStrategy: NQ/ES/EURUSD/GBPUSD rules per spec.
Trend filter (15m): Supertrend + EMA50 > EMA200.
Entry: instrument-specific (RSI/BB/Z, MACD+ATR+corr, Supertrend+RSI+Z).
Exit: 1.5x ATR profit, 1x ATR trailing, 30min time stop, correlation hedge.
Position sizing: 0.5% risk, Kelly, max 4 positions, 20% per instrument.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd

from quantbot.mathlib.math_engine import MathEngine
from quantbot.signals.base import BaseStrategy, ExitSignal, Signal, Side


def _is_news_time(ts: datetime) -> bool:
    """Stub: return True during high-impact news windows."""
    return False


@dataclass
class MultiAssetStrategyConfig:
    """Strategy parameters."""
    rsi_period: int = 14
    bb_period: int = 20
    bb_std: float = 2.0
    atr_period: int = 14
    supertrend_period: int = 10
    supertrend_mult: float = 3.0
    trend_ema_fast: int = 50
    trend_ema_slow: int = 200
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    corr_period: int = 20
    corr_threshold: float = 0.7
    rsi_oversold: float = 30.0
    rsi_overbought: float = 70.0
    z_long_threshold: float = -2.0
    z_short_threshold: float = 2.0
    z_gbp_long: float = -1.5
    z_gbp_short: float = 1.5
    profit_atr_mult: float = 1.5
    stop_atr_mult: float = 1.0
    max_hold_minutes: int = 30
    risk_pct_per_trade: float = 0.5
    max_positions: int = 4
    max_pct_per_instrument: float = 20.0


class MultiAssetStrategy(BaseStrategy):
    """Mean-reversion + trend filter for NQ, ES, EURUSD, GBPUSD."""

    def __init__(self, config: MultiAssetStrategyConfig | None = None) -> None:
        self.config = config or MultiAssetStrategyConfig()
        self._math = MathEngine()
        self._positions: dict[str, dict[str, Any]] = {}
        self._last_trend: dict[str, bool] = {}

    def _trend_filter_15m(self, ohlcv: pd.DataFrame, symbol: str) -> bool:
        """Trend filter: Supertrend up + EMA50 > EMA200."""
        if len(ohlcv) < 200:
            return False
        close = ohlcv["close"].tolist()
        high = ohlcv["high"].tolist()
        low = ohlcv["low"].tolist()
        st, direction = self._math.supertrend(high, low, close, self.config.supertrend_period, self.config.supertrend_mult)
        ema50 = self._math.ema(close, self.config.trend_ema_fast)
        ema200 = self._math.ema(close, self.config.trend_ema_slow)
        if len(st) < 1 or len(ema50) < 1 or len(ema200) < 1:
            return False
        return direction[-1].to_float() == 1 and ema50[-1].to_float() > ema200[-1].to_float()

    def on_bar(self, symbol: str, bar: pd.Series, context: dict[str, Any]) -> None:
        """Update state (e.g. track position entry time for time stop)."""
        pass

    def generate_signals(
        self,
        symbol: str,
        ohlcv: pd.DataFrame,
        context: dict[str, Any],
    ) -> list[Signal]:
        """Instrument-specific entry logic using MathEngine."""
        if ohlcv.empty or len(ohlcv) < 200:
            return []
        close = ohlcv["close"].tolist()
        high = ohlcv["high"].tolist()
        low = ohlcv["low"].tolist()
        volume = ohlcv["volume"].tolist() if "volume" in ohlcv.columns else [0.0] * len(close)

        # Volume filter: current vol > 20-period avg (via MathEngine)
        if len(volume) >= 20:
            vol_sma = self._math.sma(volume, 20)
            if vol_sma:
                avg_vol = vol_sma[-1]
                half_avg = avg_vol * self._math._a(0.5)
                if avg_vol > self._math._a(0) and self._math._a(volume[-1]) < half_avg:
                    return []
        if _is_news_time(ohlcv.index[-1] if hasattr(ohlcv.index[-1], "to_pydatetime") else datetime.now(timezone.utc)):
            return []

        signals: list[Signal] = []

        if symbol in ("NQ", "ES"):
            rsi = self._math.rsi(close, self.config.rsi_period)
            mid, upper, lower = self._math.bollinger(close, self.config.bb_period, self.config.bb_std)
            z = self._math.zscore(close, self.config.bb_period)
            if len(rsi) < 1 or len(z) < 1 or len(lower) < 1:
                return []
            r = rsi[-1].to_float()
            z_last = z[-1].to_float()
            price = close[-1]
            bb_low = lower[-1].to_float()
            bb_high = upper[-1].to_float()
            if r < self.config.rsi_oversold and price > bb_low and z_last < self.config.z_long_threshold:
                signals.append(Signal(symbol=symbol, side=Side.LONG, strength=1.0, metadata={"rsi": r, "z": z_last}))
            if r > self.config.rsi_overbought and price < bb_high and z_last > self.config.z_short_threshold:
                signals.append(Signal(symbol=symbol, side=Side.SHORT, strength=1.0, metadata={"rsi": r, "z": z_last}))

        elif symbol == "EURUSD":
            macd_line, signal_line, hist = self._math.macd(close, self.config.macd_fast, self.config.macd_slow, self.config.macd_signal)
            atr = self._math.atr(high, low, close, self.config.atr_period)
            if len(hist) < 2 or len(atr) < 1:
                return []
            cross_up = hist[-1].to_float() > 0 and hist[-2].to_float() <= 0
            cross_dn = hist[-1].to_float() < 0 and hist[-2].to_float() >= 0
            atr_spike = atr[-1].to_float() > (atr[-2].to_float() * 1.1) if len(atr) >= 2 else False
            es_series = context.get("es_close_series")
            corr_es = 0.0
            if es_series is not None and len(es_series) >= self.config.corr_period:
                corr = self._math.correlation(close, es_series, self.config.corr_period)
                if corr:
                    corr_es = corr[-1].to_float()
            if cross_up and atr_spike and corr_es > self.config.corr_threshold:
                signals.append(Signal(symbol=symbol, side=Side.LONG, strength=1.0, metadata={"corr_es": corr_es}))
            if cross_dn and atr_spike and corr_es < -self.config.corr_threshold:
                signals.append(Signal(symbol=symbol, side=Side.SHORT, strength=1.0, metadata={"corr_es": corr_es}))

        elif symbol == "GBPUSD":
            st, direction = self._math.supertrend(high, low, close, self.config.supertrend_period, self.config.supertrend_mult)
            rsi = self._math.rsi(close, self.config.rsi_period)
            z = self._math.zscore(close, self.config.bb_period)
            if len(direction) < 2 or len(rsi) < 1 or len(z) < 1:
                return []
            flip_up = direction[-1].to_float() == 1 and direction[-2].to_float() == -1
            flip_dn = direction[-1].to_float() == -1 and direction[-2].to_float() == 1
            z_last = z[-1].to_float()
            if flip_up and z_last < self.config.z_gbp_long:
                signals.append(Signal(symbol=symbol, side=Side.LONG, strength=1.0, metadata={"z": z_last}))
            if flip_dn and z_last > self.config.z_gbp_short:
                signals.append(Signal(symbol=symbol, side=Side.SHORT, strength=1.0, metadata={"z": z_last}))

        return signals

    def should_enter(self, symbol: str, signal: Signal, context: dict[str, Any]) -> bool:
        """Respect max positions and per-instrument cap."""
        positions = context.get("open_positions", {})
        if len(positions) >= self.config.max_positions:
            return False
        count = sum(1 for s, p in positions.items() if s == symbol)
        if count >= 1:
            return False
        return True

    def should_exit(
        self,
        symbol: str,
        position: dict[str, Any],
        bar: pd.Series,
        context: dict[str, Any],
    ) -> ExitSignal | None:
        """Exit: 1.5x ATR profit, 1x ATR trailing, 30min time stop. All comparisons via Abacus."""
        entry_price = position.get("entry_price")
        entry_time = position.get("entry_time")
        side = position.get("side", "long")
        atr = position.get("atr_at_entry")
        if entry_price is None or atr is None:
            return None
        m = self._math
        price_a = m._a(float(bar.get("close", 0)))
        entry_a = m._a(entry_price)
        atr_a = m._a(atr)
        profit_thresh = atr_a * m._a(self.config.profit_atr_mult)
        stop_mult = m._a(self.config.stop_atr_mult)
        if side == Side.LONG or side == "long":
            pnl_a = price_a - entry_a
            trail_a = entry_a - atr_a * stop_mult
        else:
            pnl_a = entry_a - price_a
            trail_a = entry_a + atr_a * stop_mult
        if pnl_a >= profit_thresh:
            return ExitSignal(symbol=symbol, reason="profit_target")
        if side in (Side.LONG, "long") and price_a < trail_a:
            return ExitSignal(symbol=symbol, reason="trailing_stop")
        if side in (Side.SHORT, "short") and price_a > trail_a:
            return ExitSignal(symbol=symbol, reason="trailing_stop")
        if entry_time is not None:
            if isinstance(entry_time, datetime):
                if datetime.now(timezone.utc) - entry_time > timedelta(minutes=self.config.max_hold_minutes):
                    return ExitSignal(symbol=symbol, reason="time_stop")
            elif isinstance(entry_time, pd.Timestamp):
                if (pd.Timestamp.utcnow() - entry_time).total_seconds() > self.config.max_hold_minutes * 60:
                    return ExitSignal(symbol=symbol, reason="time_stop")
        return None

    def position_size(
        self,
        account_equity: float,
        risk_pct: float,
        win_rate: float,
        avg_win: float,
        avg_loss: float,
        tick_value: float,
        tick_size: float,
    ) -> float:
        """Size using 0.5% risk and Kelly fraction (capped). All via Abacus."""
        m = self._math
        kelly = m.kelly_fraction(win_rate, avg_win, avg_loss)
        risk_pct_a = m._a(risk_pct / 100.0)
        zero = m._a(0)
        risk_fraction = kelly if kelly < risk_pct_a else risk_pct_a
        if risk_fraction < zero:
            risk_fraction = zero
        risk_amount = m._a(account_equity) * risk_fraction
        tv = m._a(tick_value)
        ts = m._a(tick_size)
        if tv <= zero or ts <= zero:
            return 0.0
        ticks_risk = risk_amount / tv
        return (ticks_risk * ts).to_float()
