"""
Regime detector: classifies the current market state as
trending, mean_reverting, or volatile.

Uses ATR, Bollinger width, EMA alignment, and K-S / chi-square
distribution shift tests inspired by math/tools/statistical_analysis.py.
"""
from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

from quantbot.mathlib.math_engine import MathEngine

logger = logging.getLogger(__name__)

REGIME_TRENDING = "trending"
REGIME_MEAN_REVERTING = "mean_reverting"
REGIME_VOLATILE = "volatile"


class RegimeDetector:
    """Classify market regime from OHLCV data."""

    def __init__(
        self,
        atr_period: int = 14,
        bb_period: int = 20,
        ema_fast: int = 50,
        ema_slow: int = 200,
        adx_trend_threshold: float = 25.0,
        adx_mean_rev_threshold: float = 20.0,
        atr_spike_mult: float = 2.0,
        ks_lookback: int = 100,
        ks_alpha: float = 0.05,
    ) -> None:
        self._math = MathEngine()
        self._atr_period = atr_period
        self._bb_period = bb_period
        self._ema_fast = ema_fast
        self._ema_slow = ema_slow
        self._adx_trend_threshold = adx_trend_threshold
        self._adx_mean_rev_threshold = adx_mean_rev_threshold
        self._atr_spike_mult = atr_spike_mult
        self._ks_lookback = ks_lookback
        self._ks_alpha = ks_alpha

    def _compute_adx(self, high: list[float], low: list[float], close: list[float], period: int = 14) -> float:
        """Compute ADX from raw OHLCV data using ATR and directional movement."""
        n = len(close)
        if n < period + 1:
            return 0.0
        plus_dm = []
        minus_dm = []
        tr_list = []
        for i in range(1, n):
            up = high[i] - high[i - 1]
            down = low[i - 1] - low[i]
            plus_dm.append(up if up > down and up > 0 else 0.0)
            minus_dm.append(down if down > up and down > 0 else 0.0)
            tr_val = max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1]))
            tr_list.append(tr_val)
        if len(tr_list) < period:
            return 0.0
        smooth_tr = sum(tr_list[:period])
        smooth_plus = sum(plus_dm[:period])
        smooth_minus = sum(minus_dm[:period])
        dx_values = []
        for i in range(period, len(tr_list)):
            smooth_tr = smooth_tr - smooth_tr / period + tr_list[i]
            smooth_plus = smooth_plus - smooth_plus / period + plus_dm[i]
            smooth_minus = smooth_minus - smooth_minus / period + minus_dm[i]
            if smooth_tr == 0:
                continue
            plus_di = 100.0 * smooth_plus / smooth_tr
            minus_di = 100.0 * smooth_minus / smooth_tr
            di_sum = plus_di + minus_di
            if di_sum == 0:
                dx_values.append(0.0)
            else:
                dx_values.append(100.0 * abs(plus_di - minus_di) / di_sum)
        if not dx_values:
            return 0.0
        if len(dx_values) < period:
            return float(np.mean(dx_values))
        adx = float(np.mean(dx_values[-period:]))
        return adx

    def _detect_distribution_shift(self, close: list[float]) -> bool:
        """K-S test comparing recent returns vs. older returns to detect regime change."""
        n = len(close)
        lookback = min(self._ks_lookback, n // 2)
        if lookback < 20:
            return False
        returns = np.diff(close) / np.array(close[:-1])
        returns = returns[np.isfinite(returns)]
        if len(returns) < lookback * 2:
            return False
        recent = returns[-lookback:]
        older = returns[-lookback * 2:-lookback]
        try:
            stat, p_value = sp_stats.ks_2samp(recent, older)
            return p_value < self._ks_alpha
        except Exception:
            return False

    def classify(self, ohlcv: pd.DataFrame) -> str:
        """Classify the current regime from OHLCV data.

        Returns one of: 'trending', 'mean_reverting', 'volatile'.
        """
        if ohlcv.empty or len(ohlcv) < self._ema_slow:
            return REGIME_MEAN_REVERTING

        close = ohlcv["close"].tolist()
        high = ohlcv["high"].tolist()
        low = ohlcv["low"].tolist()

        adx = self._compute_adx(high, low, close, self._atr_period)

        atr_series = self._math.atr(high, low, close, self._atr_period)
        atr_spike = False
        if len(atr_series) >= 20:
            current_atr = atr_series[-1].to_float()
            avg_atr = float(np.mean([a.to_float() for a in atr_series[-20:]]))
            if avg_atr > 0:
                atr_spike = current_atr > self._atr_spike_mult * avg_atr

        dist_shift = self._detect_distribution_shift(close)

        if atr_spike or dist_shift:
            return REGIME_VOLATILE
        if adx >= self._adx_trend_threshold:
            return REGIME_TRENDING
        if adx <= self._adx_mean_rev_threshold:
            return REGIME_MEAN_REVERTING
        return REGIME_MEAN_REVERTING

    def get_regime_adjustments(self, regime: str) -> dict[str, Any]:
        """Return parameter adjustments for the given regime."""
        if regime == REGIME_TRENDING:
            return {
                "z_long_threshold_adj": -0.5,
                "z_short_threshold_adj": 0.5,
                "profit_atr_mult_override": 2.0,
                "stop_atr_mult_override": None,
                "position_scale": 1.0,
            }
        if regime == REGIME_VOLATILE:
            return {
                "z_long_threshold_adj": 0.0,
                "z_short_threshold_adj": 0.0,
                "profit_atr_mult_override": None,
                "stop_atr_mult_override": 0.75,
                "position_scale": 0.5,
            }
        return {
            "z_long_threshold_adj": 0.0,
            "z_short_threshold_adj": 0.0,
            "profit_atr_mult_override": None,
            "stop_atr_mult_override": None,
            "position_scale": 1.0,
        }
