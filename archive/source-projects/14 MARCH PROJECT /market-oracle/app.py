"""
Market Oracle - Flask web app for price predictions with optional Math A integration.
"""

import logging
import os
import re
import sys

# ==================== CUSTOM MATH A INTEGRATION ====================
# Add the Math A folder so your prediction library can be imported.
# If your code lives in Math A/python (e.g. recovery package), use:
#   sys.path.insert(0, os.path.join(os.path.dirname(__file__), "Math A", "python"))
# If your prediction module is at Math A root, use the line below.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "Math A"))
# REPLACE THIS SECTION WITH YOUR LIBRARY CALLS when ready, e.g.:
# from recovery import signal
# from your_prediction_module import predict_market
# ==================== END MATH A INTEGRATION ========================

from flask import Flask, render_template, request, jsonify
import math
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")

# Allow only valid ticker characters (letters, digits, hyphen, dot); max length
TICKER_MAX_LEN = 20
TICKER_PATTERN = re.compile(r"^[A-Za-z0-9.\-]+$")


def _validate_ticker(value: str) -> str:
    """Return sanitized ticker (uppercase, max length, safe chars) or raise ValueError."""
    if not value or not isinstance(value, str):
        raise ValueError("Ticker is required")
    cleaned = value.strip().upper()[:TICKER_MAX_LEN]
    if not cleaned:
        raise ValueError("Ticker is required")
    base = cleaned.replace("-USD", "") or cleaned
    if not TICKER_PATTERN.match(base):
        raise ValueError("Ticker contains invalid characters")
    return cleaned


# Optional: use yfinance for live data. Set to False and provide your own data source if needed.
USE_YFINANCE = True
if USE_YFINANCE:
    import yfinance as yf


def fetch_historical_data(ticker: str, asset_type: str, period_days: int = 365) -> pd.DataFrame:
    """Fetch ~1 year of historical OHLCV. Crypto tickers get -USD suffix."""
    if not USE_YFINANCE:
        raise NotImplementedError("yfinance is disabled. Provide your own data in predict() and set USE_YFINANCE=False.")
    symbol = ticker.strip().upper()
    if asset_type == "crypto" and not symbol.endswith("-USD"):
        symbol = f"{symbol}-USD"
    end = datetime.now()
    start = end - timedelta(days=period_days)
    df = yf.download(symbol, start=start, end=end, progress=False, auto_adjust=True)
    if df.empty or len(df) < 2:
        raise ValueError(f"No or insufficient data for {ticker}")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0].lower() if isinstance(c, tuple) else c for c in df.columns]
    return df


# ==================== CRYSTALLINE PREDICTION ENGINE (MATH A THESIS) ====================
# Implements clock lattice, Crystalline score, Fibonacci / golden ratio, phi extensions.
# ==================== END CRYSTALLINE SECTION ====================

# Thesis constants (custom_math/constants.py, golden_ratio.py, fibonacci.py)
# Pi and pi*phi per PI_PHI_INVESTIGATION and thesis chapter 9
PI = math.pi
PHI = 1.61803398874989484820
PI_TIMES_PHI = PI * PHI  # ~5.08318530717958
FIB_RETRACEMENTS = (0.236, 0.382, 0.5, 0.618, 0.786)
# Phi^3 through phi^8 with pi*phi at index 1 (thesis derivation)
PHI_EXTENSIONS = (PHI ** 3, PI_TIMES_PHI, PHI ** 4, PHI ** 5, PHI ** 6, PHI ** 7, PHI ** 8)
TREND_PCT_HIGH = 2.5
TREND_PCT_LOW = -2.5
PRIME_POSITIONS = {3, 6, 9}


def _get_closes_ohlc(historical_df: pd.DataFrame):
    """Return close series and high/low series for recent window."""
    close = historical_df["close"] if "close" in historical_df.columns else historical_df["Close"]
    high = historical_df["high"] if "high" in historical_df.columns else historical_df["High"] if "High" in historical_df.columns else close
    low = historical_df["low"] if "low" in historical_df.columns else historical_df["Low"] if "Low" in historical_df.columns else close
    close = pd.Series(close).dropna().astype(float)
    high = pd.Series(high, index=close.index).ffill().astype(float)
    low = pd.Series(low, index=close.index).ffill().astype(float)
    return close, high, low


def predict_with_crystalline(historical_df: pd.DataFrame, horizon_days: int) -> dict:
    """
    Crystalline predictor per Math A thesis: half-series trend, volatility shift,
    risk ratio, clock lattice prime alignment, Fibonacci levels, phi-extension targets.
    Returns predicted_price, confidence, direction, predicted_dates, predicted_prices,
    upper_band, lower_band, fib_levels (for chart).
    """
    close, high, low = _get_closes_ohlc(historical_df)
    n = len(close)
    if n < 20:
        raise ValueError("Insufficient history for Crystalline model (need at least 20 points)")
    current_price = float(close.iloc[-1])
    mean_all = float(close.mean())
    std_all = float(close.std())
    if mean_all <= 0:
        mean_all = current_price
    # ---- Crystalline score: half-series trend ----
    half = n // 2
    mean1 = float(close.iloc[:half].mean())
    mean2 = float(close.iloc[half:].mean())
    mean_diff_pct = (mean2 - mean1) / mean_all * 100.0
    if mean_diff_pct > TREND_PCT_HIGH:
        trend = 2
    elif mean_diff_pct > 0:
        trend = 1
    elif mean_diff_pct > TREND_PCT_LOW:
        trend = -1
    else:
        trend = -2
    # ---- Volatility shift (scale-invariant: normalize by mean) ----
    std1 = float(close.iloc[:half].std()) if half > 1 else 0.0
    std2 = float(close.iloc[half:].std()) if (n - half) > 1 else 0.0
    vol_diff = std2 - std1
    vol_diff_pct = (vol_diff / mean_all * 100.0) if mean_all else 0.0
    vol_score = 1 if vol_diff_pct < -2 else (-1 if vol_diff_pct > 2 else 0)
    # ---- Risk ratio ----
    risk_ratio = std_all / mean_all if mean_all else 0.1
    risk_score = 1 if risk_ratio < 0.05 else (-1 if risk_ratio > 0.15 else 0)
    crystalline_score = trend + vol_score + risk_score
    # ---- Clock lattice prime alignment and phase (theta = 2*pi*position/12) ----
    span_price = float(close.max() - close.min())
    if span_price <= 0:
        span_price = 1.0
    normalized = (current_price - float(close.min())) / span_price
    position = int(normalized * 12) % 12
    on_prime = position in PRIME_POSITIONS
    theta = 2.0 * PI * position / 12.0
    # Pi*phi resonance: position aligns with pi*phi cycle (thesis interference_position)
    position_continuous = normalized * 12.0
    pi_phi_resonance = abs((position_continuous % PI_TIMES_PHI)) < 0.5 or abs((position_continuous % PI_TIMES_PHI) - PI_TIMES_PHI) < 0.5
    # ---- Fibonacci levels (recent swing) ----
    swing_high = float(high.iloc[-min(30, n):].max())
    swing_low = float(low.iloc[-min(30, n):].min())
    span = swing_high - swing_low
    if span <= 0:
        span = current_price * 0.01
    fib_levels = {r: float(swing_high - r * span) for r in FIB_RETRACEMENTS}
    eq50 = (swing_high + swing_low) / 2.0
    in_discount = current_price <= eq50
    in_ote = abs(current_price - fib_levels[0.618]) < 0.02 * span or abs(current_price - fib_levels[0.786]) < 0.02 * span
    fib_bull_confluence = in_discount or in_ote
    fib_bear_confluence = (current_price >= eq50) or (abs(current_price - fib_levels[0.382]) < 0.02 * span)
    # ---- Phi-extension target (scale = ATR-like), phase-modulated per thesis ----
    returns = close.pct_change().dropna()
    vol_annual = float(returns.std() * (252 ** 0.5)) if len(returns) else 0.15
    atr_scale = std_all if std_all > 0 else current_price * 0.01
    horizon_annual = horizon_days / 252.0
    vol_horizon = vol_annual * (horizon_annual ** 0.5)
    # First phi extension as target magnitude; phase modulation cos(theta) per thesis ch9
    ext = float(PHI_EXTENSIONS[0])
    phase_mod = 1.0 + 0.1 * math.cos(theta)
    target_delta = (ext / 100.0) * atr_scale * phase_mod
    direction_mult = 1 if crystalline_score >= 0 else -1
    phi_target = current_price + direction_mult * target_delta
    target_price = phi_target
    # Dampen by trend strength and horizon
    trend_strength = min(2.0, abs(mean_diff_pct) / max(1.0, TREND_PCT_HIGH))
    target_price = current_price + (target_price - current_price) * min(1.0, trend_strength * 0.5 * (horizon_days / 30.0))
    predicted_price = max(current_price * 0.5, min(current_price * 2.0, target_price))
    pct_change = (predicted_price - current_price) / current_price
    direction = "bullish" if pct_change >= 0 else "bearish"
    # ---- Confidence from thesis signals (incl. pi*phi resonance boost) ----
    score_strength = min(1.0, abs(crystalline_score) / 4.0)
    prime_boost = 0.08 if on_prime else 0.0
    fib_boost = 0.06 if (crystalline_score >= 0 and fib_bull_confluence) or (crystalline_score < 0 and fib_bear_confluence) else 0.0
    resonance_boost = 0.05 if pi_phi_resonance else 0.0
    vol_penalty = 0.0 if risk_ratio < 0.15 else -0.1
    confidence = 50.0 + score_strength * 35.0 + prime_boost * 100 + fib_boost * 100 + resonance_boost * 100 + vol_penalty * 100
    confidence = min(95.0, max(40.0, confidence))
    # ---- Predicted curve with visible path and confidence bands ----
    days = np.arange(1, horizon_days + 1, dtype=float)
    t = days / max(1, horizon_days)
    center = current_price + (predicted_price - current_price) * (t ** 0.7)
    band_width = current_price * vol_horizon * 0.6
    upper_band = center + band_width * (1 - t * 0.3)
    lower_band = center - band_width * (1 - t * 0.3)
    last_ts = close.index[-1]
    last_dt = pd.Timestamp(last_ts).to_pydatetime() if hasattr(pd.Timestamp(last_ts), "to_pydatetime") else datetime.now()
    predicted_dates = [(last_dt + timedelta(days=int(d))).strftime("%Y-%m-%d") for d in days]
    fib_prices_for_chart = [fib_levels[r] for r in FIB_RETRACEMENTS]
    fib_levels_dict = {str(r): float(fib_levels[r]) for r in FIB_RETRACEMENTS}
    return {
        "current_price": current_price,
        "predicted_price": float(predicted_price),
        "pct_change": float(pct_change),
        "confidence": round(float(confidence), 1),
        "direction": direction,
        "predicted_dates": predicted_dates,
        "predicted_prices": [float(p) for p in center],
        "upper_band": [float(p) for p in upper_band],
        "lower_band": [float(p) for p in lower_band],
        "fib_levels": fib_prices_for_chart,
        "crystalline_score": crystalline_score,
        "trend_score": trend,
        "vol_score": vol_score,
        "risk_score": risk_score,
        "risk_ratio": round(float(risk_ratio), 6),
        "volatility_annual": round(float(vol_annual), 4),
        "clock_position": position,
        "on_prime": on_prime,
        "fib_bull_confluence": fib_bull_confluence,
        "fib_bear_confluence": fib_bear_confluence,
        "swing_high": round(float(swing_high), 4),
        "swing_low": round(float(swing_low), 4),
        "fib_levels_dict": fib_levels_dict,
        "phi_target": round(float(phi_target), 4),
        "mean_diff_pct": round(float(mean_diff_pct), 2),
        "pi_phi_resonance": pi_phi_resonance,
    }


@app.after_request
def _security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/predict", methods=["POST"])
def api_predict():
    try:
        if request.content_type and "application/json" not in request.content_type:
            return jsonify({"error": "Content-Type must be application/json"}), 415
        data = request.get_json(silent=True) or {}
        ticker = _validate_ticker(data.get("ticker") or "AAPL")
        asset_type = (data.get("asset_type") or "stock").strip().lower()
        if asset_type not in ("stock", "crypto"):
            asset_type = "stock"
        horizon_map = {"7": 7, "30": 30, "90": 90}
        horizon_days = horizon_map.get(str(data.get("horizon", "30")).strip(), 30)

        historical_df = fetch_historical_data(ticker, asset_type, period_days=365)
        close = historical_df["close"] if "close" in historical_df.columns else historical_df["Close"]
        close = pd.Series(close).dropna()
        current_price = float(close.iloc[-1])

        # ==================== CUSTOM MATH A INTEGRATION ====================
        # REPLACE WITH YOUR ACTUAL MATH A IMPORT AND CALL, e.g.:
        # from recovery import signal
        # price_array = close.values.astype(np.float64)
        # recovered, result = signal.recover_time_series(price_array)
        # prediction = your_module.predict_market(historical_df, horizon_days)
        # Then build predicted_dates, predicted_prices, confidence, direction from prediction.
        # ==================== END MATH A INTEGRATION ====================

        out = predict_with_crystalline(historical_df, horizon_days)
        out["current_price"] = current_price

        # Serialize historical for chart
        hist_dates = close.index
        hist_dates = [pd.Timestamp(d).strftime("%Y-%m-%d") for d in hist_dates]
        out["historical_dates"] = hist_dates
        out["historical_prices"] = [float(x) for x in close.tolist()]

        # Summary sentence
        pct = out["pct_change"] * 100
        dir_label = "Bullish" if out["direction"] == "bullish" else "Bearish"
        out["summary"] = (
            f"{dir_label} outlook: {ticker} is projected to move {pct:+.1f}% over the next {horizon_days} days "
            f"with {out['confidence']:.0f}% model confidence."
        )
        return jsonify(out)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("Prediction failed")
        return jsonify({"error": "Prediction failed. Please try again."}), 400


# ==================== HOW TO RUN & CUSTOMIZE ====================
# 1. Install: pip install -r requirements.txt
# 2. Run: python app.py  (server at http://localhost:5000)
# 3. Swap in Math A: In this file, uncomment/add your import at the top (Math A section),
#    then in api_predict() replace the call to predict_with_crystalline() with your
#    function that returns current_price, predicted_price, pct_change, confidence,
#    direction, predicted_dates, predicted_prices. Keep historical_dates/historical_prices
#    and summary as-is or adapt to your output.
# 4. Remove yfinance: Set USE_YFINANCE = False and in fetch_historical_data() (or
#    api_predict()) load your own DataFrame (e.g. from CSV/DB) with a 'close' or 'Close'
#    column and same index format.
# ==================== END HOW TO RUN & CUSTOMIZE ====================

if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ("1", "true", "yes")
    if debug:
        logger.warning("Running in debug mode; do not use in production.")
    print("HOW TO RUN: pip install -r requirements.txt && python app.py")
    print("Server: http://localhost:5000")
    app.run(debug=debug, port=int(os.environ.get("PORT", "5000")))
