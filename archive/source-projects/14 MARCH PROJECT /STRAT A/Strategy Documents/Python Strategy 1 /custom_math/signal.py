"""
Crystalline-based signal: statistics, clock lattice, half-series trend, risk ratio,
ring distribution, Crystalline score (Custom Math thesis).
+ Golden/Fib retracements & extensions, lunar filter, Fib-time filter, ICT PD Array (plan).
Called in 5-min-before to 5-min-after windows around the 20- and 50-minute marks each hour.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from custom_math.statistics import statistics
from custom_math.clock_lattice import (
    price_change_to_ring,
    is_prime_aligned_position,
)
from custom_math import golden_ratio
from custom_math import fibonacci
from custom_math import lunar


def recent_swing_high_low(closes: list[float], lookback: int) -> tuple[float, float, int, int]:
    """
    Over the last lookback bars: min and max close and their indices.
    Returns (swing_low, swing_high, idx_low, idx_high). If len(closes) < 2 return (0, 0, 0, 0).
    """
    if len(closes) < 2:
        return (0.0, 0.0, 0, 0)
    use = closes[-lookback:] if lookback < len(closes) else closes
    if not use:
        return (0.0, 0.0, 0, 0)
    swing_low = min(use)
    swing_high = max(use)
    start = len(closes) - len(use)
    idx_low = start + use.index(swing_low)
    idx_high = start + use.index(swing_high)
    return (swing_low, swing_high, idx_low, idx_high)


def _atr_from_bars(bar_history: list[Any], current_bar: Any, period: int = 14) -> float:
    """Average True Range from high-low of bars. Fallback to 0 if no data."""
    bars = list(bar_history)
    if current_bar is not None:
        bars = (bars + [current_bar])[-(period + 1):]
    if len(bars) < 2:
        return 0.0
    ranges: list[float] = []
    for b in bars:
        h = float(getattr(b, "high", 0) or 0)
        l = float(getattr(b, "low", 0) or 0)
        if h > 0 and l >= 0:
            ranges.append(h - l)
    if not ranges:
        return 0.0
    return sum(ranges[-period:]) / min(period, len(ranges))


def _symbol_eq(a: str, b: str) -> bool:
    """True if symbols refer to same asset (e.g. BTC/USD and BTCUSD)."""
    if a == b:
        return True
    return (a or "").replace("/", "").upper() == (b or "").replace("/", "").upper()


def _default_config() -> SimpleNamespace:
    return SimpleNamespace(
        USE_GOLDEN_FIB=True,
        USE_LUNAR_FILTER=False,
        USE_FIB_TIME_FILTER=False,
        LUNAR_BUY_RULE="any",
        LUNAR_SELL_RULE="any",
        FIB_ENTRY_TOLERANCE_PCT=2.0,
        PHI_EXTENSION_SCALE_ATR_MULT=1.0,
        BAR_HISTORY_MAX=120,
    )


def _dominant_ring(rings: list[int]) -> int:
    """Ring 0 = small/frequent, 1-2 = moderate, 3 = major swings (Custom Math section 7)."""
    if not rings:
        return 0
    counts = [0, 0, 0, 0]
    for r in rings:
        if 0 <= r <= 3:
            counts[r] += 1
    return int(max(range(4), key=lambda i: counts[i]))


# Scale-invariant trend thresholds (percent of mean price)
_CRYSTALLINE_TREND_PCT_HIGH = 2.5
_CRYSTALLINE_TREND_PCT_LOW = -2.5


def _crystalline_score(
    mean_diff_pct: float,
    vol_diff: float,
    risk_ratio: float,
) -> int:
    """
    Trend (+2 to -2) + volatility (+1 to -1) + risk (+1 to -1).
    mean_diff_pct is (second_half_mean - first_half_mean) / mean_p * 100 for scale invariance.
    """
    if mean_diff_pct > _CRYSTALLINE_TREND_PCT_HIGH:
        trend = 2
    elif mean_diff_pct > 0:
        trend = 1
    elif mean_diff_pct > _CRYSTALLINE_TREND_PCT_LOW:
        trend = -1
    else:
        trend = -2

    if vol_diff < -2:
        vol_score = 1
    elif vol_diff > 2:
        vol_score = -1
    else:
        vol_score = 0

    if risk_ratio < 0.05:
        risk_score = 1
    elif risk_ratio > 0.15:
        risk_score = -1
    else:
        risk_score = 0

    return trend + vol_score + risk_score


def your_signal_function(
    symbol: str,
    bar_data: Any,
    broker: Any,
    bar_history: list[Any] | None = None,
    *,
    config: Any = None,
) -> str:
    """
    Crystalline + Golden/Fib/Lunar/ICT signal.
    Returns "buy" | "sell" | "hold". Optional config for USE_GOLDEN_FIB, USE_LUNAR_FILTER, etc.
    """
    if bar_history is None:
        bar_history = []
    cfg = config if config is not None else _default_config()
    use_golden_fib = getattr(cfg, "USE_GOLDEN_FIB", True)
    use_lunar = getattr(cfg, "USE_LUNAR_FILTER", False)
    use_fib_time = getattr(cfg, "USE_FIB_TIME_FILTER", False)
    lunar_buy_rule = getattr(cfg, "LUNAR_BUY_RULE", "any") or "any"
    lunar_sell_rule = getattr(cfg, "LUNAR_SELL_RULE", "any") or "any"
    tolerance_pct = getattr(cfg, "FIB_ENTRY_TOLERANCE_PCT", 2.0)
    phi_atr_mult = getattr(cfg, "PHI_EXTENSION_SCALE_ATR_MULT", 1.0)

    closes = [getattr(b, "close", 0) or 0 for b in bar_history]
    current_close = getattr(bar_data, "close", 0) or 0
    if current_close and current_close == current_close:
        closes = (closes + [current_close])[-120:]
    if len(closes) < 2:
        return "hold"

    # ----- Target exits (phi extensions) -----
    if use_golden_fib:
        try:
            positions = broker.get_positions() if hasattr(broker, "get_positions") else []
            for pos in positions:
                psym = getattr(pos, "symbol", None) or getattr(pos, "symbol_id", "")
                if not _symbol_eq(psym, symbol):
                    continue
                avg_entry = float(getattr(pos, "avg_entry_price", 0) or 0)
                qty = float(getattr(pos, "qty", 0) or 0)
                if avg_entry <= 0 or qty == 0:
                    continue
                atr = _atr_from_bars(bar_history, bar_data)
                scale = (atr * phi_atr_mult) if (phi_atr_mult > 0 and atr > 0) else (max(closes) - min(closes)) if closes else 0
                if scale <= 0:
                    scale = avg_entry * 0.01
                if qty > 0:  # long
                    levels_above = golden_ratio.extension_levels(avg_entry, scale, "above")
                    for level in levels_above:
                        if level > avg_entry and current_close >= level:
                            return "sell"
                else:  # short
                    levels_below = golden_ratio.extension_levels(avg_entry, scale, "below")
                    for level in levels_below:
                        if level < avg_entry and current_close <= level:
                            return "buy"
                break
        except Exception:
            pass

    lookback = min(30, max(2, len(closes) // 2))
    swing_low, swing_high, idx_low, idx_high = recent_swing_high_low(closes, lookback)
    swing_range_ok = swing_high > swing_low

    # ----- Fib-time filter -----
    if use_fib_time and swing_range_ok:
        current_idx = len(closes) - 1
        swing_index = max(idx_low, idx_high)
        fib_indices = fibonacci.fib_time_indices_from_swing(swing_index)
        if current_idx not in fib_indices:
            return "hold"

    stats = statistics(closes)
    mean_p = stats["mean"]
    std_p = stats["std_dev"]
    risk_ratio = (std_p / mean_p) if mean_p and mean_p > 0 else 0

    half = max(1, len(closes) // 2)
    first_half = closes[:half]
    second_half = closes[half:]
    s1 = statistics(first_half)
    s2 = statistics(second_half)
    mean_diff = s2["mean"] - s1["mean"]
    vol_diff = s2["std_dev"] - s1["std_dev"]
    mean_diff_pct = (mean_diff / mean_p * 100.0) if mean_p and mean_p > 0 else 0.0

    score = _crystalline_score(mean_diff_pct, vol_diff, risk_ratio)

    rings_list: list[int] = []
    for i in range(1, len(closes)):
        delta = closes[i] - closes[i - 1]
        r = price_change_to_ring(delta)
        if r is not None:
            rings_list.append(r)
    dominant_ring = _dominant_ring(rings_list)
    high_vol_regime = dominant_ring >= 3

    buy_threshold = 2 if high_vol_regime else 1
    sell_threshold = -2 if high_vol_regime else -1

    if risk_ratio > 0.15:
        return "hold"

    # Clock position from recent range so prime alignment is comparable across symbols
    span = max(closes) - min(closes) if closes else 0.0
    if span > 0:
        normalized = (current_close - min(closes)) / span
        position = int(normalized * 12) % 12
        on_prime = is_prime_aligned_position(position)
    else:
        on_prime = False

    # ----- Lunar filter (before returning buy/sell) -----
    def _lunar_allows_buy() -> bool:
        if not use_lunar:
            return True
        dt = lunar._parse_timestamp(getattr(bar_data, "timestamp", None))
        if dt is None:
            return True
        phase = lunar.lunar_phase(dt)
        return lunar.moon_filter_allows_buy(phase, lunar_buy_rule)

    def _lunar_allows_sell() -> bool:
        if not use_lunar:
            return True
        dt = lunar._parse_timestamp(getattr(bar_data, "timestamp", None))
        if dt is None:
            return True
        phase = lunar.lunar_phase(dt)
        return lunar.moon_filter_allows_sell(phase, lunar_sell_rule)

    # Primary: Crystalline score
    if score >= buy_threshold:
        if _lunar_allows_buy():
            return "buy"
        return "hold"
    if score <= sell_threshold:
        if _lunar_allows_sell():
            return "sell"
        return "hold"

    # Fib/PD Array confluence: boost borderline to buy/sell when at key level (OTE band 61.8-78.6%)
    if use_golden_fib and swing_range_ok:
        in_discount = fibonacci.in_discount_zone(current_close, swing_high, swing_low)
        in_ote_zone = fibonacci.price_in_ote_zone(current_close, swing_high, swing_low, tolerance_pct)
        in_premium = fibonacci.in_premium_zone(current_close, swing_high, swing_low)
        fib_levels = fibonacci.fib_retracement_levels(swing_high, swing_low)
        near_382 = golden_ratio.price_near_level(
            current_close, fib_levels.get("0.382", current_close), tolerance_pct
        ) if fib_levels else False

        if score >= 0 and mean_diff > 0 and (in_discount or in_ote_zone) and _lunar_allows_buy():
            return "buy"
        if score <= 0 and mean_diff < 0 and (in_premium or near_382) and _lunar_allows_sell():
            return "sell"

    # Fallback: trend + prime alignment
    if mean_diff > 0 and on_prime and current_close <= mean_p + std_p:
        if _lunar_allows_buy():
            return "buy"
    if mean_diff < 0 and on_prime and current_close >= mean_p - std_p:
        if _lunar_allows_sell():
            return "sell"
    if mean_diff > std_p and vol_diff < 0:
        if _lunar_allows_buy():
            return "buy"
    if mean_diff < -std_p and vol_diff > 0:
        if _lunar_allows_sell():
            return "sell"

    return "hold"
