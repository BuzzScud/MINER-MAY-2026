"""
Daily review: end-of-day learning cycle.

1. Compute and persist daily performance metrics.
2. Run performance attribution by symbol, regime, signal type.
3. Update adaptive signal weights.
4. On the configured day (default Sunday), run walk-forward optimization.
5. Log a summary to the activity log.
"""
from __future__ import annotations

import dataclasses
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from quantbot.backtest.metrics import compute_all_metrics
from quantbot.data.storage import load_trades, save_daily_metrics
from quantbot.optimization.walk_forward import run_walk_forward
from quantbot.signals.adaptive_weights import AdaptiveWeightManager, signal_type_for_symbol

logger = logging.getLogger(__name__)


def _compute_attribution(trades: list[dict[str, Any]]) -> dict[str, Any]:
    """Group trades by symbol, regime, and signal type and compute per-group stats."""
    groups: dict[str, list[float]] = {}
    for t in trades:
        sym = t.get("symbol", "?")
        regime = t.get("regime_at_entry", "unknown")
        sig_type = signal_type_for_symbol(sym)
        pnl = t.get("pnl", 0.0)
        for key in [f"sym:{sym}", f"regime:{regime}", f"signal:{sig_type}"]:
            groups.setdefault(key, []).append(pnl)
    result: dict[str, Any] = {}
    for key, pnls in groups.items():
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p < 0]
        result[key] = {
            "trades": len(pnls),
            "total_pnl": round(sum(pnls), 2),
            "win_rate": round(len(wins) / len(pnls), 4) if pnls else 0.0,
            "avg_pnl": round(sum(pnls) / len(pnls), 2) if pnls else 0.0,
        }
    return result


def run_daily_review(
    cache_dir: Path,
    equity: float,
    equity_curve: list[float],
    adaptive_weights: AdaptiveWeightManager,
    current_strategy_params: dict[str, Any],
    learning_cfg: Any | None = None,
) -> dict[str, Any]:
    """Execute the end-of-day review cycle. Returns a summary dict."""
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    trades_today = load_trades(cache_dir, days_back=1)
    trades_month = load_trades(cache_dir, days_back=30)

    trades_pnl = [t["pnl"] for t in trades_month]
    eq_vals = equity_curve if equity_curve else [equity]
    if len(eq_vals) > 1:
        returns = []
        for i in range(1, len(eq_vals)):
            prev = eq_vals[i - 1]
            if prev > 0:
                returns.append((eq_vals[i] - prev) / prev)
            else:
                returns.append(0.0)
    else:
        returns = []

    metrics = compute_all_metrics(returns, eq_vals, trades_pnl)
    metrics["date"] = today_str
    metrics["equity"] = equity
    metrics["trade_count"] = len(trades_today)

    attribution = _compute_attribution(trades_month)
    metrics["regime_summary"] = attribution

    try:
        save_daily_metrics(cache_dir, metrics)
    except Exception as exc:
        logger.warning("Failed to save daily metrics: %s", exc)

    for t in trades_today:
        adaptive_weights.update(t)

    optimizer_result = None
    weekly_day = 6
    if learning_cfg is not None:
        weekly_day = getattr(learning_cfg, "weekly_optimize_day", 6)
    if datetime.now(timezone.utc).weekday() == weekly_day:
        try:
            training_weeks = getattr(learning_cfg, "optimizer_training_weeks", 4) if learning_cfg else 4
            validation_weeks = getattr(learning_cfg, "optimizer_validation_weeks", 1) if learning_cfg else 1
            min_trades = getattr(learning_cfg, "optimizer_min_trades", 30) if learning_cfg else 30
            sharpe_improvement = getattr(learning_cfg, "optimizer_sharpe_improvement", 0.1) if learning_cfg else 0.1
            opt = run_walk_forward(
                cache_dir=cache_dir,
                current_params=current_strategy_params,
                training_weeks=training_weeks,
                validation_weeks=validation_weeks,
                min_trades=min_trades,
                sharpe_improvement=sharpe_improvement,
            )
            optimizer_result = {
                "adopted": opt.adopted,
                "reason": opt.reason,
                "best_params": opt.best_params,
                "validation_sharpe": opt.validation_sharpe,
                "current_sharpe": opt.current_sharpe,
                "mc_p_value": opt.monte_carlo_p_value,
            }
        except Exception as exc:
            logger.warning("Walk-forward optimizer failed: %s", exc)
            optimizer_result = {"adopted": False, "reason": f"error:{exc}"}

    summary = {
        "date": today_str,
        "equity": equity,
        "trades_today": len(trades_today),
        "metrics": metrics,
        "attribution": attribution,
        "weights": adaptive_weights.get_all_weights(),
        "optimizer": optimizer_result,
    }
    logger.info("Daily review complete: %s", today_str)
    return summary
