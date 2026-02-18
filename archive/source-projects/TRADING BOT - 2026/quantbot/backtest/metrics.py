"""
Backtest metrics: Sharpe, Sortino, Calmar, max DD, win rate, expectancy.
All computed via MathEngine/Abacus for precision.
"""
from __future__ import annotations

from typing import Sequence

from quantbot.crystalline import Abacus
from quantbot.mathlib.math_engine import MathEngine


def _to_abacus(x: float | Abacus, engine: MathEngine) -> Abacus:
    return x if isinstance(x, Abacus) else engine._a(float(x))


def _to_series(series: Sequence[float | Abacus], engine: MathEngine) -> list[Abacus]:
    return [_to_abacus(v, engine) for v in series]


def sharpe_ratio(returns: Sequence[float | Abacus], risk_free: float = 0.0) -> float:
    """Annualized Sharpe (assuming daily returns)."""
    engine = MathEngine()
    r = _to_series(returns, engine)
    if not r:
        return 0.0
    n = engine._a(len(r))
    sum_r = engine._a(0)
    for x in r:
        sum_r = sum_r + x
    mean_r = sum_r / n
    rf_daily = engine._a(risk_free / 252)
    var = engine._a(0)
    for x in r:
        d = x - mean_r
        var = var + d * d
    var = var / n
    var_nonneg = var if var > engine._a(0) else engine._a(0)
    std = engine._sqrt_abacus(var_nonneg)
    if std == engine._a(0):
        return 0.0
    ann_sqrt = engine._a(252 ** 0.5)
    raw = (mean_r - rf_daily) / std * ann_sqrt
    return raw.to_float()


def sortino_ratio(returns: Sequence[float | Abacus], risk_free: float = 0.0) -> float:
    """Sortino: downside deviation only."""
    engine = MathEngine()
    r = _to_series(returns, engine)
    if not r:
        return 0.0
    n = engine._a(len(r))
    sum_r = engine._a(0)
    for x in r:
        sum_r = sum_r + x
    mean_r = sum_r / n
    downside = [x for x in r if x < engine._a(0)]
    if not downside:
        return 0.0
    nd = engine._a(len(downside))
    down_var = engine._a(0)
    for x in downside:
        down_var = down_var + x * x
    down_var = down_var / nd
    down_var_nonneg = down_var if down_var > engine._a(0) else engine._a(0)
    down_std = engine._sqrt_abacus(down_var_nonneg)
    if down_std == engine._a(0):
        return 0.0
    rf_daily = engine._a(risk_free / 252)
    ann_sqrt = engine._a(252 ** 0.5)
    raw = (mean_r - rf_daily) / down_std * ann_sqrt
    return raw.to_float()


def max_drawdown(equity_curve: Sequence[float | Abacus]) -> float:
    """Max drawdown (fraction 0..1)."""
    engine = MathEngine()
    eq = _to_series(equity_curve, engine)
    if not eq:
        return 0.0
    peak = eq[0]
    dd = engine._a(0)
    zero = engine._a(0)
    for v in eq:
        if v > peak:
            peak = v
        if peak > zero:
            d = (peak - v) / peak
            if d > dd:
                dd = d
    return dd.to_float()


def calmar_ratio(returns: Sequence[float | Abacus], equity_curve: Sequence[float | Abacus]) -> float:
    """Calmar = annualized return / max drawdown."""
    engine = MathEngine()
    r = _to_series(returns, engine)
    if not r:
        return 0.0
    n = engine._a(len(r))
    sum_r = engine._a(0)
    for x in r:
        sum_r = sum_r + x
    mean_r = sum_r / n
    ann_ret = mean_r * engine._a(252)
    dd_val = max_drawdown(equity_curve)
    if dd_val == 0.0:
        return 0.0
    dd_a = engine._a(dd_val)
    if dd_a == engine._a(0):
        return 0.0
    raw = ann_ret / dd_a
    return raw.to_float()


def win_rate(trades_pnl: Sequence[float | Abacus]) -> float:
    """Fraction of winning trades."""
    engine = MathEngine()
    pnls = _to_series(trades_pnl, engine)
    if not pnls:
        return 0.0
    zero = engine._a(0)
    wins = sum(1 for p in pnls if p > zero)
    return (engine._a(wins) / engine._a(len(pnls))).to_float()


def expectancy(trades_pnl: Sequence[float | Abacus]) -> float:
    """Average PnL per trade."""
    engine = MathEngine()
    pnls = _to_series(trades_pnl, engine)
    if not pnls:
        return 0.0
    total = engine._a(0)
    for p in pnls:
        total = total + p
    return (total / engine._a(len(pnls))).to_float()


def profit_factor(trades_pnl: Sequence[float | Abacus]) -> float:
    """Sum of wins / abs(sum of losses). Zero losses -> 0.0 (no trades or no loss)."""
    engine = MathEngine()
    pnls = _to_series(trades_pnl, engine)
    if not pnls:
        return 0.0
    zero = engine._a(0)
    wins_sum = engine._a(0)
    losses_sum = engine._a(0)
    for p in pnls:
        if p > zero:
            wins_sum = wins_sum + p
        elif p < zero:
            losses_sum = losses_sum + p
    if losses_sum >= zero:
        return 0.0
    abs_losses = zero - losses_sum
    raw = wins_sum / abs_losses
    return raw.to_float()


def _total_pnl(trades_pnl: list[float]) -> float:
    if not trades_pnl:
        return 0.0
    engine = MathEngine()
    total = engine._a(0)
    for p in trades_pnl:
        total = total + engine._a(p)
    return total.to_float()


def _avg_win(trades_pnl: list[float]) -> float:
    engine = MathEngine()
    wins = [p for p in trades_pnl if p > 0]
    if not wins:
        return 0.0
    total = engine._a(0)
    for w in wins:
        total = total + engine._a(w)
    return (total / engine._a(len(wins))).to_float()


def _avg_loss(trades_pnl: list[float]) -> float:
    engine = MathEngine()
    losses = [p for p in trades_pnl if p < 0]
    if not losses:
        return 0.0
    total = engine._a(0)
    for lo in losses:
        total = total + engine._a(lo)
    return (total / engine._a(len(losses))).to_float()


def compute_all_metrics(
    returns: list[float],
    equity_curve: list[float],
    trades_pnl: list[float],
) -> dict[str, float]:
    """Return dict of all trading performance metrics."""
    return {
        "sharpe": sharpe_ratio(returns),
        "sortino": sortino_ratio(returns),
        "calmar": calmar_ratio(returns, equity_curve),
        "max_drawdown": max_drawdown(equity_curve),
        "win_rate": win_rate(trades_pnl),
        "expectancy": expectancy(trades_pnl),
        "profit_factor": profit_factor(trades_pnl),
        "total_trades": float(len(trades_pnl)),
        "total_pnl": _total_pnl(trades_pnl),
        "avg_win": _avg_win(trades_pnl),
        "avg_loss": _avg_loss(trades_pnl),
    }
