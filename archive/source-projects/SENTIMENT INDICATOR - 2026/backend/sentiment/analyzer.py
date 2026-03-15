"""VADER sentiment scoring, aggregation per asset, and entry/exit/staleness rules."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

import numpy as np
from pydantic import BaseModel

from backend.sentiment.gatherers import RawSignal
from backend.sentiment.strategies.base import AggregationMode

# Lazy NLTK VADER
_analyzer = None


def _get_analyzer():
    global _analyzer
    if _analyzer is None:
        try:
            from nltk.sentiment.vader import SentimentIntensityAnalyzer
            _analyzer = SentimentIntensityAnalyzer()
        except LookupError:
            import nltk
            nltk.download("vader_lexicon", quiet=True)
            from nltk.sentiment.vader import SentimentIntensityAnalyzer
            _analyzer = SentimentIntensityAnalyzer()
    return _analyzer


def score_text(text: str) -> float:
    """Return VADER compound score in [-1, 1]."""
    if not (text and text.strip()):
        return 0.0
    analyzer = _get_analyzer()
    scores = analyzer.polarity_scores(text)
    return float(scores.get("compound", 0.0))


class ScoredSignal(BaseModel):
    asset_symbol: str
    source: str
    sentiment_score: float
    reason: Optional[str] = None
    timestamp: datetime


class AssetAggregate(BaseModel):
    asset_symbol: str
    aggregated_score: float
    signal_count: int
    entry_signal: bool
    exit_signal: bool
    stale: bool
    window_start: datetime
    window_end: datetime
    score_std: Optional[float] = None
    confidence_lower: Optional[float] = None
    confidence_upper: Optional[float] = None


class AnalysisResult(BaseModel):
    scored_signals: List[ScoredSignal]
    aggregates: List[AssetAggregate]


def _time_decay_weight(age_hours: float, half_life_hours: float) -> float:
    """Exponential decay: w = exp(-ln(2) * age_hours / half_life_hours)."""
    if half_life_hours <= 0:
        return 1.0
    return math.exp(-math.log(2) * age_hours / half_life_hours)


def _robust_aggregate(scores: np.ndarray, weights: np.ndarray, mode: AggregationMode) -> float:
    """Compute aggregate from scores and weights. Fallback to weighted mean when n < 5 for robust modes."""
    n = len(scores)
    if n == 0:
        return 0.0
    if mode == "mean" or (mode in ("trimmed_mean", "median") and n < 5):
        total_w = float(np.sum(weights))
        if total_w <= 0:
            return 0.0
        return float(np.average(scores, weights=weights))
    if mode == "median":
        return float(np.median(scores))
    if mode == "trimmed_mean":
        from scipy import stats as scipy_stats
        trimmed = scipy_stats.trim_mean(scores, proportiontocut=0.1)
        return float(trimmed)
    return float(np.average(scores, weights=weights))


def analyze(
    raw_signals: List[RawSignal],
    source_weight: Callable[[str], float],
    entry_threshold: float,
    exit_threshold: float,
    staleness_hours: float,
    min_volume: int,
    window_end: Optional[datetime] = None,
    use_time_decay: bool = False,
    decay_half_life_hours: float = 12.0,
    aggregation_mode: AggregationMode = "mean",
    include_uncertainty: bool = True,
) -> AnalysisResult:
    """
    Score each signal with VADER, aggregate per asset with source weights and freshness.
    Apply entry/exit/staleness rules and min volume. Return scored signals and per-asset aggregates.
    Optional: time-decay weighting, robust aggregation (trimmed_mean/median), uncertainty (std, 95% CI).
    """
    if window_end is None:
        window_end = datetime.now(timezone.utc)
    window_start = window_end - timedelta(minutes=15)
    cutoff = window_end - timedelta(hours=staleness_hours)

    scored: List[ScoredSignal] = []
    for raw in raw_signals:
        if raw["timestamp"] and raw["timestamp"] < cutoff:
            continue
        pre_scored = raw.get("sentiment_score")
        compound = float(pre_scored) if isinstance(pre_scored, (int, float)) else score_text(raw["text"])
        reason = (raw["text"][:500] + "..." if len(raw["text"]) > 500 else raw["text"]) or None
        scored.append(
            ScoredSignal(
                asset_symbol=raw["asset_symbol"],
                source=raw["source"],
                sentiment_score=compound,
                reason=reason,
                timestamp=raw["timestamp"],
            )
        )

    by_asset: Dict[str, List[ScoredSignal]] = {}
    for s in scored:
        by_asset.setdefault(s.asset_symbol, []).append(s)

    aggregates: List[AssetAggregate] = []
    for asset, signals in by_asset.items():
        if len(signals) < min_volume:
            continue
        latest_ts: Optional[datetime] = None
        scores_arr = np.array([s.sentiment_score for s in signals], dtype=np.float64)
        base_weights = np.array([source_weight(s.source) for s in signals], dtype=np.float64)
        if use_time_decay and decay_half_life_hours > 0:
            ages_hours = []
            for s in signals:
                if s.timestamp is None:
                    ages_hours.append(0.0)
                else:
                    delta = window_end - (s.timestamp if s.timestamp.tzinfo else s.timestamp.replace(tzinfo=timezone.utc))
                    ages_hours.append(max(0.0, delta.total_seconds() / 3600.0))
                if latest_ts is None or (s.timestamp and s.timestamp > latest_ts):
                    latest_ts = s.timestamp
            decay = np.array([_time_decay_weight(h, decay_half_life_hours) for h in ages_hours], dtype=np.float64)
            weights = base_weights * decay
        else:
            weights = base_weights
            for s in signals:
                if latest_ts is None or (s.timestamp and s.timestamp > latest_ts):
                    latest_ts = s.timestamp
        total_weight = float(np.sum(weights))
        if total_weight <= 0:
            continue
        agg_score = _robust_aggregate(scores_arr, weights, aggregation_mode)
        agg_score = max(-1.0, min(1.0, agg_score))
        entry = agg_score > entry_threshold
        exit_ = agg_score < exit_threshold
        stale = latest_ts is not None and latest_ts < cutoff

        score_std: Optional[float] = None
        confidence_lower: Optional[float] = None
        confidence_upper: Optional[float] = None
        if include_uncertainty and len(signals) >= 2:
            score_std = float(np.std(scores_arr, ddof=1))
            n = len(signals)
            margin = 1.96 * (score_std / math.sqrt(n)) if n > 0 else 0.0
            mean_score = float(np.mean(scores_arr))
            confidence_lower = max(-1.0, mean_score - margin)
            confidence_upper = min(1.0, mean_score + margin)

        aggregates.append(
            AssetAggregate(
                asset_symbol=asset,
                aggregated_score=round(agg_score, 4),
                signal_count=len(signals),
                entry_signal=entry,
                exit_signal=exit_,
                stale=stale,
                window_start=window_start,
                window_end=window_end,
                score_std=round(score_std, 4) if score_std is not None else None,
                confidence_lower=round(confidence_lower, 4) if confidence_lower is not None else None,
                confidence_upper=round(confidence_upper, 4) if confidence_upper is not None else None,
            )
        )

    return AnalysisResult(scored_signals=scored, aggregates=aggregates)


def run_pipeline(
    strategy: Any,
    symbols: Optional[List[str]] = None,
) -> AnalysisResult:
    """Run gatherers with strategy, then analyze with strategy params. Returns result for DB persistence."""
    from backend.sentiment.gatherers import DEFAULT_SYMBOLS

    symbols = symbols or DEFAULT_SYMBOLS
    raw: List[RawSignal] = []
    for g in strategy.get_gatherers():
        raw.extend(g(symbols))

    return analyze(
        raw_signals=raw,
        source_weight=strategy.get_source_weight,
        entry_threshold=strategy.get_entry_threshold(),
        exit_threshold=strategy.get_exit_threshold(),
        staleness_hours=strategy.get_staleness_hours(),
        min_volume=strategy.get_min_volume(),
        use_time_decay=strategy.get_use_time_decay(),
        decay_half_life_hours=strategy.get_decay_half_life_hours(),
        aggregation_mode=strategy.get_aggregation_mode(),
        include_uncertainty=strategy.get_include_uncertainty(),
    )
