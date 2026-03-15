# Sentiment Indicator Thesis Improvements – Implementation Log

Plan: Improve Market Sentiment Indicator per thesis (Math FEB 19 + Lunar PDF). Single implementation path; no parallel pipelines.

---

## 1. Dependencies

**Done.** Added `numpy>=1.24.0` and `scipy>=1.11.0` to `backend/requirements.txt`. No imports from the `math/` folder; backend uses only numpy/scipy for aggregation and smoothing.

---

## 2. Strategy extension

**Done.** Extended `backend/sentiment/strategies/base.py` with optional methods: `get_use_time_decay()`, `get_decay_half_life_hours()`, `get_aggregation_mode()`, `get_use_prime_modular_thresholds()`, `get_use_prime_modular_window()`, `get_include_uncertainty()`. Default strategy in `backend/sentiment/strategies/default.py` supports prime-modular mode via env `SENTIMENT_PRIME_MODULAR=1`: entry 0.29, exit -0.31, 29-day staleness window (Lunar-thesis alignment).

---

## 3. Analyzer aggregation and uncertainty

**Done.** In `backend/sentiment/analyzer.py`: time-decay weighting (`_time_decay_weight`), robust aggregation (`_robust_aggregate`: mean / trimmed_mean / median with numpy/scipy), and optional uncertainty (sample std, 95% CI) on `AssetAggregate`. `analyze()` and `run_pipeline()` accept and pass through the new strategy options.

---

## 4. API current response

**Done.** `SentimentCurrentResponse` in `backend/sentiment/api.py` now includes optional `score_std`, `confidence_lower`, `confidence_upper`. On-demand current response passes these from the analyzer; DB path returns them as null when not stored (getattr fallback).

---

## 5. Historical smoothing

**Done.** Added `backend/sentiment/smoothing.py` with `smooth_scores(scores, kind)` for `ema` and `ma`. Historical endpoint accepts query param `smooth=ema|ma` and applies smoothing to `aggregated_score` before returning the same `HistoricalPoint` list.

---

## 6. Docs / plan log

**Done.** This file is the implementation log with “Done” and a two-line summary per step.
