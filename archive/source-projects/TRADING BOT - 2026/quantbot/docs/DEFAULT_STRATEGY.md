# Default Trading Strategy (Thesis Default)

The quantbot’s **default strategy** is the **Multi-Asset** strategy, registered as `multi_asset`. It is the “thesis default” strategy: it uses the same numeric foundation (MathEngine / crystalline Abacus) as the project’s math thesis and is the strategy selected when the UI shows “Multi-Asset (default)”.

## Strategy ID

- **Registry id:** `multi_asset`
- **Display label:** Multi-Asset (default)

## Behaviour Summary

- **Instruments:** NQ, ES, EURUSD, GBPUSD (configurable).
- **Trend filter (15m):** Supertrend up and EMA50 > EMA200.
- **Entry (instrument-specific):**
  - **NQ/ES:** RSI oversold/overbought with Bollinger and Z-score (long: RSI &lt; oversold, price above lower BB, Z &lt; threshold; short: RSI &gt; overbought, price below upper BB, Z &gt; threshold).
  - **EURUSD:** MACD cross with ATR spike and correlation to ES above/below threshold.
  - **GBPUSD:** Supertrend flip with Z-score (long: flip up and Z &lt; threshold; short: flip down and Z &gt; threshold).
- **Exit:** 1.5× ATR profit target, 1× ATR trailing stop, 30-minute time stop. Comparisons use the Abacus (MathEngine).
- **Position sizing:** 0.5% risk per trade, Kelly fraction (capped), max 4 positions, max 20% per instrument.
- **Risk / circuit breaker:** Respects RiskEngine and CircuitBreaker limits (max daily loss %, drawdown %, etc.).

## Alignment with Thesis

The bot “follows the thesis” by:

1. Using **MathEngine** (crystalline Abacus) for all indicator and arithmetic operations (RSI, EMA, Supertrend, Bollinger, Z-score, MACD, ATR, correlation, Kelly).
2. Having this strategy explicitly documented as the **default strategy** that the UI and config use when no other strategy is selected.

No changes to the main math thesis content or to the micro model C code are required for “bot follows thesis” or for the default strategy selector.
