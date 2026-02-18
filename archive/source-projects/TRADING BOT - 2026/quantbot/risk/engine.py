"""
Risk engine: pre-trade checks (margin, exposure), correlation matrix via MathEngine.
"""
from __future__ import annotations

from typing import Any

from quantbot.mathlib.math_engine import MathEngine


class RiskEngine:
    """Pre-trade risk checks."""

    def __init__(
        self,
        max_daily_loss_pct: float = 10.0,
        max_vol_adjusted_exposure_pct: float = 2.0,
        max_portfolio_pct_per_instrument: float = 20.0,
    ) -> None:
        self._max_daily_loss_pct = max_daily_loss_pct
        self._max_vol_adjusted_exposure_pct = max_vol_adjusted_exposure_pct
        self._max_pct_per_instrument = max_portfolio_pct_per_instrument
        self._math = MathEngine()

    def check_trade(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
        account_equity: float,
        positions: dict[str, float],
        daily_pnl_pct: float,
        volatility_series: list[float] | None = None,
    ) -> tuple[bool, str]:
        """
        Return (allowed, reason). All numeric checks via Abacus.
        """
        m = self._math
        zero = m._a(0)
        daily_pnl_a = m._a(daily_pnl_pct)
        max_loss_a = m._a(-self._max_daily_loss_pct)
        if daily_pnl_a <= max_loss_a:
            return False, "daily_loss_limit"
        notional = m._a(quantity) * m._a(price)
        equity_a = m._a(account_equity)
        if equity_a <= zero:
            return False, "no_equity"
        exposure_pct = (notional / equity_a) * m._a(100)
        if exposure_pct > m._a(self._max_pct_per_instrument):
            return False, "instrument_exposure_limit"
        if volatility_series and len(volatility_series) >= 20:
            vol_sum = zero
            for v in volatility_series[-20:]:
                vol_sum = vol_sum + m._a(v)
            vol = vol_sum / m._a(20)
            if vol > zero:
                vol_adj = (notional * vol) / equity_a * m._a(100)
                if vol_adj > m._a(self._max_vol_adjusted_exposure_pct):
                    return False, "vol_adjusted_exposure"
        return True, "ok"

    def correlation_matrix(self, series_by_symbol: dict[str, list[float]], period: int = 20) -> dict[str, dict[str, float]]:
        """Compute pairwise correlation matrix using MathEngine."""
        symbols = list(series_by_symbol.keys())
        out: dict[str, dict[str, float]] = {s: {} for s in symbols}
        for i, a in enumerate(symbols):
            for b in symbols[i:]:
                x = series_by_symbol[a]
                y = series_by_symbol[b]
                if len(x) < period or len(y) < period:
                    continue
                corr = self._math.correlation(x, y, period)
                if corr:
                    r = corr[-1].to_float()
                    out[a][b] = r
                    out[b][a] = r
        return out
