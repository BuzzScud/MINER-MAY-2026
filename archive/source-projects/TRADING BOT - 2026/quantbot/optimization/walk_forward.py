"""
Walk-forward parameter optimizer.

Uses a training window of historical trades to grid-search over
MultiAssetStrategyConfig parameters, validates on an out-of-sample
window, and applies Monte Carlo validation before adoption.
"""
from __future__ import annotations

import itertools
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np

from quantbot.backtest.metrics import compute_all_metrics
from quantbot.data.storage import load_trades

logger = logging.getLogger(__name__)

# Parameter grid definitions (name -> list of candidate values)
PARAM_GRID: dict[str, list[float]] = {
    "rsi_oversold": [20.0, 25.0, 30.0, 35.0, 40.0],
    "rsi_overbought": [60.0, 65.0, 70.0, 75.0, 80.0],
    "z_long_threshold": [-3.0, -2.5, -2.0, -1.5, -1.0],
    "z_short_threshold": [1.0, 1.5, 2.0, 2.5, 3.0],
    "profit_atr_mult": [1.0, 1.5, 2.0, 2.5, 3.0],
    "stop_atr_mult": [0.5, 0.75, 1.0, 1.25, 1.5],
    "corr_threshold": [0.3, 0.5, 0.7, 0.9],
}


@dataclass
class OptimizationResult:
    """Result of a walk-forward optimization run."""
    best_params: dict[str, float]
    training_sharpe: float
    validation_sharpe: float
    current_sharpe: float
    adopted: bool
    reason: str
    monte_carlo_p_value: float


def _simulate_trades_with_params(
    trades: list[dict[str, Any]],
    param_set: dict[str, float],
) -> list[float]:
    """Filter trades that would have been taken under the given parameters.

    This is a simplified replay: for NQ/ES trades, check if the signal metadata
    RSI and Z-score would have triggered with the new thresholds.
    Returns a list of PnL values for matching trades.
    """
    pnls: list[float] = []
    for t in trades:
        meta = t.get("signal_metadata", {})
        symbol = t.get("symbol", "")
        side = t.get("side", "")
        rsi = meta.get("rsi")
        z = meta.get("z")
        corr_es = meta.get("corr_es")

        if symbol in ("NQ", "ES") and rsi is not None and z is not None:
            if side == "long":
                if rsi < param_set.get("rsi_oversold", 30) and z < param_set.get("z_long_threshold", -2.0):
                    pnls.append(t["pnl"])
            elif side == "short":
                if rsi > param_set.get("rsi_overbought", 70) and z > param_set.get("z_short_threshold", 2.0):
                    pnls.append(t["pnl"])
        elif symbol == "EURUSD" and corr_es is not None:
            threshold = param_set.get("corr_threshold", 0.7)
            if (side == "long" and corr_es > threshold) or (side == "short" and corr_es < -threshold):
                pnls.append(t["pnl"])
        elif symbol == "GBPUSD" and z is not None:
            z_long = param_set.get("z_long_threshold", -2.0) + 0.5
            z_short = param_set.get("z_short_threshold", 2.0) - 0.5
            if (side == "long" and z < z_long) or (side == "short" and z > z_short):
                pnls.append(t["pnl"])
        else:
            pnls.append(t["pnl"])
    return pnls


def _compute_sharpe_from_pnls(pnls: list[float]) -> float:
    """Annualized Sharpe ratio from a list of trade PnLs."""
    if len(pnls) < 3:
        return 0.0
    arr = np.array(pnls, dtype=np.float64)
    mean_pnl = float(np.mean(arr))
    std_pnl = float(np.std(arr, ddof=1))
    if std_pnl == 0:
        return 0.0
    return mean_pnl / std_pnl * np.sqrt(252)


def _monte_carlo_validate(
    baseline_pnls: list[float],
    candidate_pnls: list[float],
    n_trials: int = 5000,
) -> float:
    """Monte Carlo p-value: is the candidate Sharpe significantly better?

    Shuffles the combined PnL pool and checks how often a random split
    produces an improvement as large as the candidate's.
    """
    if not baseline_pnls or not candidate_pnls:
        return 1.0
    baseline_sharpe = _compute_sharpe_from_pnls(baseline_pnls)
    candidate_sharpe = _compute_sharpe_from_pnls(candidate_pnls)
    observed_diff = candidate_sharpe - baseline_sharpe
    if observed_diff <= 0:
        return 1.0
    combined = np.array(baseline_pnls + candidate_pnls, dtype=np.float64)
    n_cand = len(candidate_pnls)
    rng = np.random.default_rng(42)
    count_ge = 0
    for _ in range(n_trials):
        rng.shuffle(combined)
        sim_cand = combined[:n_cand]
        sim_base = combined[n_cand:]
        sim_diff = _compute_sharpe_from_pnls(sim_cand.tolist()) - _compute_sharpe_from_pnls(sim_base.tolist())
        if sim_diff >= observed_diff:
            count_ge += 1
    return count_ge / n_trials


def run_walk_forward(
    cache_dir: Path,
    current_params: dict[str, float],
    training_weeks: int = 4,
    validation_weeks: int = 1,
    min_trades: int = 30,
    sharpe_improvement: float = 0.1,
    mc_alpha: float = 0.05,
) -> OptimizationResult:
    """Run walk-forward optimization over persisted trade history.

    Returns an OptimizationResult indicating whether new params should be adopted.
    """
    total_days = (training_weeks + validation_weeks) * 7
    all_trades = load_trades(cache_dir, days_back=total_days)
    if len(all_trades) < min_trades:
        return OptimizationResult(
            best_params=current_params,
            training_sharpe=0.0,
            validation_sharpe=0.0,
            current_sharpe=0.0,
            adopted=False,
            reason=f"insufficient_trades:{len(all_trades)}<{min_trades}",
            monte_carlo_p_value=1.0,
        )

    cutoff = datetime.now(timezone.utc) - timedelta(weeks=validation_weeks)
    cutoff_iso = cutoff.isoformat()
    training_trades = [t for t in all_trades if t["exit_time"] < cutoff_iso]
    validation_trades = [t for t in all_trades if t["exit_time"] >= cutoff_iso]

    if len(training_trades) < min_trades // 2 or len(validation_trades) < 5:
        return OptimizationResult(
            best_params=current_params,
            training_sharpe=0.0,
            validation_sharpe=0.0,
            current_sharpe=0.0,
            adopted=False,
            reason="insufficient_train_or_val_trades",
            monte_carlo_p_value=1.0,
        )

    current_pnls = [t["pnl"] for t in all_trades]
    current_sharpe = _compute_sharpe_from_pnls(current_pnls)

    best_sharpe = -999.0
    best_params = dict(current_params)

    param_names = list(PARAM_GRID.keys())
    param_values = [PARAM_GRID[name] for name in param_names]

    for combo in itertools.product(*param_values):
        candidate = dict(zip(param_names, combo))
        train_pnls = _simulate_trades_with_params(training_trades, candidate)
        if len(train_pnls) < 5:
            continue
        sharpe = _compute_sharpe_from_pnls(train_pnls)
        if sharpe > best_sharpe:
            best_sharpe = sharpe
            best_params = candidate

    val_pnls = _simulate_trades_with_params(validation_trades, best_params)
    validation_sharpe = _compute_sharpe_from_pnls(val_pnls)

    if validation_sharpe <= current_sharpe + sharpe_improvement:
        return OptimizationResult(
            best_params=current_params,
            training_sharpe=best_sharpe,
            validation_sharpe=validation_sharpe,
            current_sharpe=current_sharpe,
            adopted=False,
            reason=f"no_improvement:val={validation_sharpe:.3f},current={current_sharpe:.3f}",
            monte_carlo_p_value=1.0,
        )

    mc_p = _monte_carlo_validate(current_pnls, val_pnls)
    if mc_p >= mc_alpha:
        return OptimizationResult(
            best_params=current_params,
            training_sharpe=best_sharpe,
            validation_sharpe=validation_sharpe,
            current_sharpe=current_sharpe,
            adopted=False,
            reason=f"mc_not_significant:p={mc_p:.4f}>={mc_alpha}",
            monte_carlo_p_value=mc_p,
        )

    logger.info(
        "Walk-forward adopted new params: val_sharpe=%.3f (current=%.3f), mc_p=%.4f",
        validation_sharpe, current_sharpe, mc_p,
    )
    return OptimizationResult(
        best_params=best_params,
        training_sharpe=best_sharpe,
        validation_sharpe=validation_sharpe,
        current_sharpe=current_sharpe,
        adopted=True,
        reason="adopted",
        monte_carlo_p_value=mc_p,
    )
