"""
Price series denoiser using FFT-based filtering.
Wraps math/python/recovery/signal.py denoise() and calculate_snr().
"""
from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Threshold defaults
DEFAULT_DENOISE_THRESHOLD = 0.1
DEFAULT_SNR_NOISE_FLOOR = 1e-6  # Fallback only; SNR uses signal/noise decomposition
DEFAULT_SNR_MIN = -20.0


def _fft_denoise(signal: np.ndarray, threshold: float = DEFAULT_DENOISE_THRESHOLD) -> np.ndarray:
    """FFT-based denoising — zeroes frequency components below threshold * max magnitude."""
    if len(signal) < 4:
        return signal.copy()
    fft = np.fft.fft(signal)
    magnitude = np.abs(fft)
    max_mag = np.max(magnitude)
    if max_mag <= 0:
        return signal.copy()
    fft[magnitude < threshold * max_mag] = 0
    denoised = np.fft.ifft(fft).real
    return denoised


def _calculate_snr(signal: np.ndarray, noise_floor: float = DEFAULT_SNR_NOISE_FLOOR) -> float:
    """Signal-to-noise ratio in dB using signal/noise decomposition."""
    if len(signal) < 20:
        return 0.0
    # Smooth with a short window to extract the trend (signal component)
    window = min(20, len(signal) // 4)
    kernel = np.ones(window) / window
    smoothed = np.convolve(signal, kernel, mode="valid")
    residuals = signal[window - 1 :] - smoothed
    signal_power = max(float(np.var(smoothed)), 1e-20)
    noise_power = max(float(np.var(residuals)), 1e-20)
    return float(10.0 * np.log10(signal_power / noise_power))


def denoise_ohlcv(df: pd.DataFrame, threshold: float = DEFAULT_DENOISE_THRESHOLD) -> pd.DataFrame:
    """Apply FFT denoising to the close series of an OHLCV DataFrame.

    Returns a copy with a 'close_denoised' column appended.
    The original columns are preserved unchanged.
    """
    if df.empty or "close" not in df.columns:
        return df.copy()
    close = df["close"].values.astype(np.float64)
    denoised = _fft_denoise(close, threshold)
    result = df.copy()
    result["close_denoised"] = denoised
    return result


def calculate_signal_quality(series: list[float] | np.ndarray, noise_floor: float = DEFAULT_SNR_NOISE_FLOOR) -> float:
    """Compute signal-to-noise ratio (dB) of a price series.

    Higher values indicate a cleaner signal. Trading should be skipped
    when the return is below a configurable minimum (e.g. -5 dB).
    """
    arr = np.asarray(series, dtype=np.float64)
    if len(arr) < 25:
        return 0.0
    returns = np.diff(arr) / arr[:-1]
    returns = returns[np.isfinite(returns)]
    if len(returns) < 20:
        return 0.0
    return _calculate_snr(returns, noise_floor)


def should_skip_noisy(series: list[float] | np.ndarray, snr_min: float = DEFAULT_SNR_MIN) -> bool:
    """Return True if the price series is too noisy to trade."""
    snr = calculate_signal_quality(series)
    return snr < snr_min
