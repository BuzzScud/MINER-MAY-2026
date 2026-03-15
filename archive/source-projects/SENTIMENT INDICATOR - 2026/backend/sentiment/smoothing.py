"""Optional smoothing of historical sentiment series (EMA, MA) for chart display."""
from typing import Literal

import numpy as np

SmoothKind = Literal["ema", "ma"]

EMA_SPAN = 5
MA_WINDOW = 5


def smooth_scores(scores: np.ndarray, kind: SmoothKind) -> np.ndarray:
    """
    Return smoothed copy of scores. Same length as input.
    ema: exponential moving average with span EMA_SPAN (alpha = 2/(span+1)).
    ma: simple moving average with window MA_WINDOW (boundary: pad so output length unchanged).
    """
    if len(scores) == 0:
        return scores.copy()
    if kind == "ema":
        alpha = 2.0 / (EMA_SPAN + 1.0)
        out = np.empty_like(scores)
        out[0] = scores[0]
        for i in range(1, len(scores)):
            out[i] = alpha * scores[i] + (1.0 - alpha) * out[i - 1]
        return out
    if kind == "ma":
        w = min(MA_WINDOW, len(scores))
        if w <= 1:
            return scores.copy()
        # Same-length output: use 'same' mode (pad with edge values)
        kernel = np.ones(w) / w
        padded = np.pad(scores.astype(np.float64), (w // 2, w - 1 - w // 2), mode="edge")
        out = np.convolve(padded, kernel, mode="valid")
        assert len(out) == len(scores)
        return out
    return scores.copy()
