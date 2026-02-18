"""
MathEngine: all indicators implemented via crystalline Abacus.
Inputs: list[Abacus] or list[float] (auto-converted). Outputs: list[Abacus].
"""
from __future__ import annotations

from typing import Sequence

from quantbot.crystalline import Abacus
from quantbot.crystalline._bindings import math_sqrt


def _to_abacus(x: float | Abacus) -> Abacus:
    return x if isinstance(x, Abacus) else Abacus(float(x))


def _to_series(series: Sequence[float | Abacus]) -> list[Abacus]:
    return [_to_abacus(v) for v in series]


class MathEngine:
    """All technical indicators via crystalline primitives."""

    def __init__(self, base: int = 10, precision: int = 20) -> None:
        self._base = base
        self._precision = precision

    def _a(self, value: float | int) -> Abacus:
        return Abacus(value, self._base, self._precision)

    def _sqrt_abacus(self, x: Abacus) -> Abacus:
        """Square root via crystalline C math_sqrt."""
        val = max(0.0, x.to_float())
        return Abacus(math_sqrt(val), self._base, self._precision)

    def ema(self, series: Sequence[float | Abacus], period: int) -> list[Abacus]:
        """Exponential moving average: multiplier = 2/(period+1), EMA = mult*price + (1-mult)*EMA_prev."""
        s = _to_series(series)
        if not s or period < 1:
            return []
        mult = self._a(2) / (self._a(period) + self._a(1))
        one_minus = self._a(1) - mult
        out: list[Abacus] = []
        ema_prev = s[0]
        out.append(ema_prev)
        for i in range(1, len(s)):
            ema_prev = mult * s[i] + one_minus * ema_prev
            out.append(ema_prev)
        return out

    def sma(self, series: Sequence[float | Abacus], period: int) -> list[Abacus]:
        """Simple moving average: sliding window sum / period."""
        s = _to_series(series)
        if not s or period < 1 or len(s) < period:
            return []
        out: list[Abacus] = []
        for i in range(len(s)):
            if i + 1 < period:
                out.append(Abacus(0.0, self._base, self._precision))
                continue
            total = self._a(0)
            for j in range(i - period + 1, i + 1):
                total = total + s[j]
            out.append(total / self._a(period))
        return out

    def rsi(self, series: Sequence[float | Abacus], period: int = 14) -> list[Abacus]:
        """RSI = 100 - (100 / (1 + RS)) where RS = EMA(gains) / EMA(losses)."""
        s = _to_series(series)
        if not s or period < 1 or len(s) < 2:
            return []
        gains: list[Abacus] = []
        losses: list[Abacus] = []
        zero = self._a(0)
        for i in range(1, len(s)):
            ch = s[i] - s[i - 1]
            gains.append(ch if ch > zero else zero)
            losses.append((zero - ch) if ch < zero else zero)
        ema_g = self.ema(gains, period)
        ema_l = self.ema(losses, period)
        out: list[Abacus] = [self._a(50.0)]
        hundred = self._a(100)
        one = self._a(1)
        for i in range(len(ema_g)):
            if ema_l[i] == self._a(0):
                out.append(hundred)
            else:
                rs = ema_g[i] / ema_l[i]
                out.append(hundred - (hundred / (one + rs)))
        return out

    def macd(
        self,
        series: Sequence[float | Abacus],
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
    ) -> tuple[list[Abacus], list[Abacus], list[Abacus]]:
        """MACD line = EMA(fast) - EMA(slow), signal = EMA(MACD), histogram = MACD - signal."""
        s = _to_series(series)
        if not s or fast < 1 or slow < 1 or signal < 1:
            return ([], [], [])
        ema_f = self.ema(s, fast)
        ema_s = self.ema(s, slow)
        macd_line: list[Abacus] = []
        for i in range(len(s)):
            macd_line.append(ema_f[i] - ema_s[i])
        signal_line = self.ema(macd_line, signal)
        hist: list[Abacus] = []
        for i in range(len(macd_line)):
            hist.append(macd_line[i] - signal_line[i])
        return (macd_line, signal_line, hist)

    def bollinger(
        self,
        series: Sequence[float | Abacus],
        period: int = 20,
        std_mult: float | Abacus = 2.0,
    ) -> tuple[list[Abacus], list[Abacus], list[Abacus]]:
        """Middle = SMA(series), Upper = Middle + mult*std, Lower = Middle - mult*std."""
        s = _to_series(series)
        mult = _to_abacus(std_mult)
        if not s or period < 1:
            return ([], [], [])
        mid = self.sma(s, period)
        upper: list[Abacus] = []
        lower: list[Abacus] = []
        for i in range(len(s)):
            if i + 1 < period:
                upper.append(s[i])
                lower.append(s[i])
                continue
            window = s[i - period + 1 : i + 1]
            mean = mid[i]
            var = self._a(0)
            for v in window:
                d = v - mean
                var = var + d * d
            var = var / self._a(period)
            var_nonneg = var if var > self._a(0) else self._a(0)
            std = self._sqrt_abacus(var_nonneg)
            upper.append(mean + mult * std)
            lower.append(mean - mult * std)
        return (mid, upper, lower)

    def atr(
        self,
        high: Sequence[float | Abacus],
        low: Sequence[float | Abacus],
        close: Sequence[float | Abacus],
        period: int = 14,
    ) -> list[Abacus]:
        """True range = max(H-L, |H-prevC|, |L-prevC|); ATR = EMA(TR)."""
        h = _to_series(high)
        l = _to_series(low)
        c = _to_series(close)
        n = min(len(h), len(l), len(c))
        if n < 2 or period < 1:
            return []
        tr: list[Abacus] = []
        for i in range(n):
            if i == 0:
                tr.append(h[i] - l[i])
            else:
                zero = self._a(0)
                a = h[i] - l[i]
                diff_hc = h[i] - c[i - 1]
                diff_lc = l[i] - c[i - 1]
                b_ab = (zero - diff_hc) if diff_hc < zero else diff_hc
                c_ab = (zero - diff_lc) if diff_lc < zero else diff_lc
                m1 = a if a > b_ab else b_ab
                m2 = m1 if m1 > c_ab else c_ab
                tr.append(m2)
        return self.ema(tr, period)

    def supertrend(
        self,
        high: Sequence[float | Abacus],
        low: Sequence[float | Abacus],
        close: Sequence[float | Abacus],
        period: int = 10,
        multiplier: float | Abacus = 3.0,
    ) -> tuple[list[Abacus], list[Abacus]]:
        """Supertrend: ATR-based bands; direction flips when price crosses band."""
        h = _to_series(high)
        l = _to_series(low)
        c = _to_series(close)
        atr_series = self.atr(h, l, c, period)
        n = min(len(h), len(l), len(c), len(atr_series))
        if n == 0:
            return ([], [])
        mult = _to_abacus(multiplier)
        hl2: list[Abacus] = []
        for i in range(n):
            hl2.append((h[i] + l[i]) / self._a(2))
        upper_band: list[Abacus] = []
        lower_band: list[Abacus] = []
        for i in range(n):
            ub = hl2[i] + mult * atr_series[i]
            lb = hl2[i] - mult * atr_series[i]
            upper_band.append(ub)
            lower_band.append(lb)
        supertrend: list[Abacus] = []
        direction: list[Abacus] = []
        for i in range(n):
            if i == 0:
                supertrend.append(lower_band[0])
                direction.append(self._a(1))
                continue
            prev_st = supertrend[i - 1]
            prev_d = direction[i - 1].to_float()
            if prev_d == 1:
                st = lower_band[i]
                if lower_band[i].to_float() > prev_st.to_float():
                    st = lower_band[i]
                if close[i] < st:
                    direction.append(self._a(-1))
                    supertrend.append(upper_band[i])
                else:
                    direction.append(self._a(1))
                    supertrend.append(st)
            else:
                st = upper_band[i]
                if upper_band[i].to_float() < prev_st.to_float():
                    st = upper_band[i]
                if close[i] > st:
                    direction.append(self._a(1))
                    supertrend.append(lower_band[i])
                else:
                    direction.append(self._a(-1))
                    supertrend.append(st)
        return (supertrend, direction)

    def zscore(self, series: Sequence[float | Abacus], period: int) -> list[Abacus]:
        """Z-score = (x - mean) / stddev over rolling window."""
        s = _to_series(series)
        if not s or period < 1:
            return []
        sma_series = self.sma(s, period)
        out: list[Abacus] = []
        for i in range(len(s)):
            if i + 1 < period:
                out.append(self._a(0))
                continue
            window = s[i - period + 1 : i + 1]
            mean = sma_series[i]
            var = self._a(0)
            for v in window:
                d = v - mean
                var = var + d * d
            var = var / self._a(period)
            var_nonneg = var if var > self._a(0) else self._a(0)
            std = self._sqrt_abacus(var_nonneg)
            if std == self._a(0):
                out.append(self._a(0))
            else:
                out.append((s[i] - mean) / std)
        return out

    def correlation(
        self,
        x: Sequence[float | Abacus],
        y: Sequence[float | Abacus],
        period: int,
    ) -> list[Abacus]:
        """Pearson correlation over rolling window."""
        xs = _to_series(x)
        ys = _to_series(y)
        n = min(len(xs), len(ys))
        if n < period or period < 1:
            return []
        out: list[Abacus] = []
        for i in range(n):
            if i + 1 < period:
                out.append(self._a(0))
                continue
            wx = xs[i - period + 1 : i + 1]
            wy = ys[i - period + 1 : i + 1]
            sum_x = self._a(0)
            sum_y = self._a(0)
            for v in wx:
                sum_x = sum_x + v
            for v in wy:
                sum_y = sum_y + v
            mx_a = sum_x / self._a(period)
            my_a = sum_y / self._a(period)
            cov = self._a(0)
            sx = self._a(0)
            sy = self._a(0)
            for j in range(period):
                dx = wx[j] - mx_a
                dy = wy[j] - my_a
                cov = cov + dx * dy
                sx = sx + dx * dx
                sy = sy + dy * dy
            cov = cov / self._a(period)
            sx_nonneg = sx if sx > self._a(0) else self._a(0)
            sy_nonneg = sy if sy > self._a(0) else self._a(0)
            sx_sqrt = self._sqrt_abacus(sx_nonneg)
            sy_sqrt = self._sqrt_abacus(sy_nonneg)
            if sx_sqrt == self._a(0) or sy_sqrt == self._a(0):
                out.append(self._a(0))
            else:
                out.append(cov / (sx_sqrt * sy_sqrt))
        return out

    def kelly_fraction(
        self,
        win_rate: float | Abacus,
        avg_win: float | Abacus,
        avg_loss: float | Abacus,
    ) -> Abacus:
        """Kelly % = win_rate - (1-win_rate)/win_loss_ratio, where win_loss_ratio = avg_win/avg_loss."""
        w = _to_abacus(win_rate)
        aw = _to_abacus(avg_win)
        al = _to_abacus(avg_loss)
        if al.to_float() == 0:
            return self._a(0)
        win_loss_ratio = aw / al
        one = self._a(1)
        return w - (one - w) / win_loss_ratio
