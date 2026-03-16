#!/usr/bin/env python3
"""
ICT Crystalline v3.2 — Unified ICT PD Array Strategy

Merged from ict_crystalline_strategy.py (v1) and strategy.py (v3.1).
Original ICT had no custom NQ contract mechanics, session gap detection, or COT/macro
filters. Liquidity pools (BSL/SSL) and monthly flow effects exist in the original
for optional future use.

Framework: ICT PD Array Methodology (FVG, OB, MSS, killzones, AMD, lookback alignment).
- FVG = Fair Value Gap: 3-bar imbalance in price delivery.
- OB = Order Block: last candle before impulsive move; volume confirmation applied.
- MSS = Market Structure Shift: break of prev swing high/low; boosted at macro times.
- AMD = Accumulation → Manipulation → Distribution (ICT cycle).
- Macro times: institutional algos reprice at :00/:20/:40 each hour.
- Lookback alignment: price inside PD array at 3h/6h/9h anchor points.

Usage:
    pip install -r requirements.txt
    python ict_crystalline.py
    python ict_crystalline.py --version
    python ict_crystalline.py --ticker NQ=F --start 2024-01-01 --plot --save-csv

CLI: --ticker, --start, --end, --capital, --interval (5m|15m|30m|1h), --save-csv, --plot, --version

Chart: ict_crystalline_chart.png is written only when --plot is used and matplotlib
is installed (pip install -r requirements.txt).
"""

from __future__ import annotations

import argparse
import warnings
from datetime import datetime

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

try:
    import yfinance as yf
    YFINANCE_OK = True
except ImportError:
    YFINANCE_OK = False

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    MATPLOTLIB_OK = True
except ImportError:
    MATPLOTLIB_OK = False


def _bars_per_year(interval: str) -> float:
    """Annual bar count from INTERVAL for annualization (5m/15m/30m/1h)."""
    # Trading hours per year ≈ 252 * 6.5; bars per hour from interval
    bars_per_hour = {"5m": 12, "15m": 4, "30m": 2, "1h": 1}.get(
        interval.strip().lower(), 4
    )
    return 252 * 6.5 * bars_per_hour


# ══════════════════════════════════════════════════════════════════════
# 1. CONFIG
# ══════════════════════════════════════════════════════════════════════
class Config:
    """
    All tunable strategy parameters from both source files.
    No magic numbers in logic; single place for constants.
    """

    # ── Data ─────────────────────────────────────────────────────────
    TICKER     = "NQ=F"
    INTERVAL   = "15m"  # 5m | 15m | 30m | 1h
    START      = "2024-01-01"
    END        = datetime.today().strftime("%Y-%m-%d")
    CAPITAL    = 100_000
    EST_OFFSET = 5

    # Legacy from original ICT (reference; tiered brake replaces single MAX_DRAWDOWN)
    TARGET_VOL    = 0.15
    MAX_DRAWDOWN  = 0.20
    LONG_ONLY     = False
    SIGNAL_THRESHOLD_LEGACY = 0.25

    # Original valid entry hours (EST): 3am | 6am | 9am | 12pm | 3pm | 6pm | 9pm
    ENTRY_HOURS_EST = (3, 6, 9, 12, 15, 18, 21)
    USE_LEGACY_ENTRY_HOURS = False  # True = restrict to ENTRY_HOURS_EST; False = macro :00/:20/:40

    # Macro time windows (:00/:20/:40 of the hour)
    MACRO_MINUTES    = {0, 20, 40}
    MACRO_BOOST_MIN  = {0, 30}
    MACRO_BOOST_MULT = 1.15

    # Exponential lookback alignment (3h / 6h / 9h at 15-min: 12/24/36 bars)
    LOOKBACKS = [
        (12, 1.00, "3h"),
        (24, 0.50, "6h"),
        (36, 0.25, "9h"),
    ]
    PROX_BARS  = 2
    CONF_MULTS = {0: 1.00, 1: 1.10, 2: 1.40, 3: 1.80}

    # FVG detection
    FVG_MIN_GAP_PCT = 0.0003
    FVG_DECAY_RATE  = 0.12
    FVG_WINDOW      = 16

    # Order Block detection (volume confirmation: OB only when vol >= OB_VOL_THRESH * avg_vol)
    OB_IMPULSE_MULT = 1.30
    OB_VOL_THRESH   = 0.80
    OB_DECAY_RATE   = 0.10
    OB_WINDOW       = 16

    # MSS detection (MSS_MACRO_MULT = 2.0 at macro times)
    MSS_LOOKBACK     = 8
    MSS_BASE_SCALE   = 0.001
    MSS_STRENGTH_CAP = 1.50
    MSS_MACRO_MULT   = 2.00
    MSS_DECAY_RATE   = 0.15
    MSS_DECAY_WINDOW = 16

    # Market structure
    STRUCTURE_SWING_HALF = 4

    # Premium / Discount zone
    PD_ZONE_WINDOW = 16
    PD_ZONE_BUFFER = 0.001

    # Killzone definitions (EST hour): (label, hours_set, kz_weight, amd_phase, amd_scalar)
    KILLZONES = [
        ("SB_AM",  {10},              1.00, "distribution", 1.00),
        ("SB_PM",  {14},              0.90, "distribution", 1.00),
        ("NY_AM",  set(range(8, 12)), 0.85, "distribution", 1.00),
        ("NY_PM",  set(range(13, 16)), 0.85, "distribution", 1.00),
        ("London", set(range(2, 5)),   0.80, "manipulation", 0.55),
        ("Asian",  {21, 22, 23, 0, 1, 5, 6, 7}, 0.40, "accumulation", 0.45),
    ]
    KZ_DEFAULT = ("off_sess", 0.25, "accumulation", 0.45)

    # ICT score weights
    W_ALIGN  = 0.25
    W_FVG    = 0.20
    W_MSS    = 0.20
    W_STRUCT = 0.15
    W_PD     = 0.10
    W_BASE   = 0.10

    # Signal threshold (vol-adaptive)
    THRESH_LOW_VOL   = 0.15
    THRESH_HIGH_VOL  = 0.25
    VOL_THRESH_PIVOT = 0.20

    # Volatility targeting
    VOL_TARGET   = 0.12
    VOL_LOOKBACK = 56
    MAX_LEVERAGE = 2.00
    MIN_SIZE     = 0.05

    # VIX scalar (4-tier, smooth)
    VIX_TIERS = [
        (0.45, 0.00),
        (0.30, 0.30),
        (0.20, 0.65),
        (0.00, 1.00),
    ]

    # Trend filter (50-day MA: no longs below MA)
    MA50D_BARS  = 200
    TSMOM_FAST  = 84
    TSMOM_SLOW  = 1092

    # Tiered drawdown brake (4 levels: 5/10/15/20%)
    DD_TIERS = [
        (-0.20, 0.00),
        (-0.15, 0.10),
        (-0.10, 0.40),
        (-0.05, 0.70),
        (0.00, 1.00),
    ]

    # Equity curve filter (half size when below rolling MA)
    EC_MA_BARS   = 80
    EC_BUFFER    = 0.995
    EC_REDUCTION = 0.50

    # Multi-asset (from original) for optional scanner
    ASSET_UNIVERSE = {
        "futures": {"ES=F": "E-mini S&P 500", "NQ=F": "E-mini NASDAQ", "GC=F": "Gold Futures"},
        "forex":   {"EURUSD=X": "EUR/USD", "XAUUSD=X": "XAU/USD"},
        "stocks":  {"SPY": "S&P 500 ETF"},
        "crypto":  {"BTC-USD": "Bitcoin"},
    }
    SELECTED_PORTFOLIO = {
        "futures": {"ES=F": "E-mini S&P 500", "NQ=F": "E-mini NASDAQ"},
        "forex":   {"EURUSD=X": "EUR/USD", "XAUUSD=X": "Gold"},
        "crypto":  {"BTC-USD": "Bitcoin"},
        "stocks":  {"SPY": "S&P 500 ETF"},
    }


# ══════════════════════════════════════════════════════════════════════
# 2. DATA LOADER
# ══════════════════════════════════════════════════════════════════════
class DataLoader:
    """
    Fetches OHLCV via yfinance or generates synthetic data when unavailable.
    Synthetic bar frequency follows Config.INTERVAL (5m/15m/30m/1h).
    """

    def __init__(self, cfg: Config):
        self.cfg = cfg

    def load(self) -> pd.DataFrame:
        """Load real or synthetic OHLCV; adds hour_utc, minute, hour_est."""
        if YFINANCE_OK:
            df = self._fetch_yfinance()
            if df is not None and len(df) > 500:
                print(f"  [DATA] Real {self.cfg.TICKER} | {len(df):,} bars "
                      f"| {df.index[0].date()} → {df.index[-1].date()}")
                return self._add_time_cols(df)
            # Fallback: for 15m, try 1h and resample to 15m (yfinance 1h often allows ~730 days)
            if self.cfg.INTERVAL.strip().lower() == "15m":
                df_1h = self._fetch_yfinance_interval("1h")
                if df_1h is not None and len(df_1h) > 100:
                    df = self._resample_1h_to_15m(df_1h)
                    if df is not None and len(df) > 500:
                        print(f"  [DATA] Real {self.cfg.TICKER} | {len(df):,} bars (1h→15m) "
                              f"| {df.index[0].date()} → {df.index[-1].date()}")
                        return self._add_time_cols(df)
        print("  [DATA] Using synthetic data (anchored to real milestones)")
        return self._synthetic()

    def _fetch_yfinance(self) -> pd.DataFrame | None:
        """Download OHLCV from yfinance for TICKER and INTERVAL."""
        return self._fetch_yfinance_interval(self.cfg.INTERVAL)

    def _fetch_yfinance_interval(self, interval: str) -> pd.DataFrame | None:
        """Download OHLCV for a specific interval (e.g. '1h' for fallback)."""
        try:
            tk = yf.Ticker(self.cfg.TICKER)
            df = tk.history(
                start=self.cfg.START,
                end=self.cfg.END,
                interval=interval,
                auto_adjust=True,
            )
            if df.empty:
                return None
            df.index = pd.to_datetime(df.index, utc=True).tz_convert("America/New_York")
            df.index = df.index.tz_localize(None)
            df.columns = [c.lower() for c in df.columns]
            return df[["open", "high", "low", "close", "volume"]].dropna()
        except Exception as e:
            print(f"  [WARN] yfinance error ({interval}): {e}")
            return None

    @staticmethod
    def _resample_1h_to_15m(df_1h: pd.DataFrame) -> pd.DataFrame | None:
        """Expand 1h bars to 15m: each 1h bar becomes 4 x 15m bars (:00/:15/:30/:45), same OHLC."""
        if df_1h is None or len(df_1h) == 0:
            return None
        index_15m = pd.date_range(
            start=df_1h.index[0], periods=len(df_1h) * 4, freq="15min"
        )
        rows = []
        for _, row in df_1h.iterrows():
            vol = row["volume"] / 4 if pd.notna(row["volume"]) else 0
            for _ in range(4):
                rows.append({
                    "open": row["open"], "high": row["high"],
                    "low": row["low"], "close": row["close"], "volume": vol,
                })
        df_15m = pd.DataFrame(rows, index=index_15m)
        return df_15m

    def _synthetic(self) -> pd.DataFrame:
        """Generate synthetic OHLCV with freq from INTERVAL."""
        np.random.seed(2024)
        cfg = self.cfg
        freq_map = {"5m": "5min", "15m": "15min", "30m": "30min", "1h": "1h"}
        freq = freq_map.get(cfg.INTERVAL.strip().lower(), "15min")
        dates = pd.date_range(cfg.START, cfg.END + " 23:45", freq=freq)
        n = len(dates)

        anchors = [
            (0.000, 16780, 0.014), (0.070, 17200, 0.012), (0.180, 18400, 0.013),
            (0.250, 19500, 0.014), (0.320, 18000, 0.022), (0.380, 19800, 0.014),
            (0.460, 21100, 0.012), (0.520, 22000, 0.011), (0.560, 21200, 0.013),
            (0.600, 21800, 0.013), (0.640, 17800, 0.038), (0.680, 19200, 0.022),
            (0.720, 20000, 0.016), (0.760, 20500, 0.013), (0.820, 21200, 0.012),
            (0.880, 21800, 0.012), (0.940, 21500, 0.013), (1.000, 21000, 0.014),
        ]
        af = np.array([a[0] for a in anchors])
        ap = np.array([a[1] for a in anchors])
        av = np.array([a[2] for a in anchors])
        bf = np.linspace(0, 1, n)
        ilp = np.interp(bf, af, np.log(ap))
        ivol = np.interp(bf, af, av) / np.sqrt(252 * 6.5 * 4)
        noise = np.random.normal(0, ivol)
        noise = noise - 0.02 * (np.cumsum(noise) - (ilp - ilp[0]))
        prices = np.exp(ilp[0] + np.cumsum(noise))
        for i, (frac, target, _) in enumerate(anchors[1:], 1):
            idx = int(frac * (n - 1))
            adj = np.log(target) - np.log(prices[idx])
            dec = np.exp(-np.arange(min(200, n - idx)) * 0.015)
            ei = min(idx + len(dec), n)
            prices[idx:ei] *= np.exp(adj * dec[: ei - idx])
        prices = np.clip(prices, 10000, 30000)
        irng = np.maximum(prices * ivol * 2, 10)
        df = pd.DataFrame({
            "open": prices * np.exp(np.random.normal(0, 0.0005, n)),
            "high": prices + irng * np.random.uniform(0.4, 1.2, n),
            "low": prices - irng * np.random.uniform(0.4, 1.2, n),
            "close": prices,
            "volume": np.random.randint(3000, 12000, n).astype(float),
        }, index=dates)
        df["high"] = df[["open", "high", "close"]].max(axis=1)
        df["low"] = df[["open", "low", "close"]].min(axis=1)
        return self._add_time_cols(df)

    @staticmethod
    def _add_time_cols(df: pd.DataFrame) -> pd.DataFrame:
        """Add hour_utc, minute, hour_est for killzone and macro time."""
        df = df.copy()
        df["hour_utc"] = df.index.hour
        df["minute"] = df.index.minute
        df["hour_est"] = (df.index.hour - 5) % 24
        return df


# ══════════════════════════════════════════════════════════════════════
# 3. ICT SIGNALS
# ══════════════════════════════════════════════════════════════════════
class ICTSignals:
    """
    Computes all ICT PD Array signals (FVG, OB, MSS, structure, PD zone,
    killzone, lookback alignment). Macro time columns must run before MSS.
    """

    def __init__(self, cfg: Config):
        self.cfg = cfg

    def compute_all(self, df: pd.DataFrame) -> pd.DataFrame:
        """Run full signal pipeline; order: macro_cols before _mss (MSS uses macro_time)."""
        df = df.copy()
        df = self._killzone(df)
        df = self._market_structure(df)
        df = self._pd_zone(df)
        df = self._fvg_zones(df)
        df = self._ob_zones(df)
        df = self._fvg_rolling_score(df)
        df = self._macro_cols(df)
        df = self._mss(df)
        df = self._lookback_alignment(df)
        df = self._vol_trend_filters(df)
        df = self._ict_composite(df)
        return df

    def _killzone(self, df: pd.DataFrame) -> pd.DataFrame:
        """Label killzone and AMD phase/scalar per bar from hour_est."""
        cfg = self.cfg
        kz_label, kz_w, amd_ph, amd_sc = [], [], [], []
        for h in df["hour_est"]:
            matched = False
            for label, hours, w, phase, scalar in cfg.KILLZONES:
                if h in hours:
                    kz_label.append(label)
                    kz_w.append(w)
                    amd_ph.append(phase)
                    amd_sc.append(scalar)
                    matched = True
                    break
            if not matched:
                kz_label.append(cfg.KZ_DEFAULT[0])
                kz_w.append(cfg.KZ_DEFAULT[1])
                amd_ph.append(cfg.KZ_DEFAULT[2])
                amd_sc.append(cfg.KZ_DEFAULT[3])
        df["killzone"] = kz_label
        df["kz_weight"] = kz_w
        df["amd_phase"] = amd_ph
        df["amd_scalar"] = amd_sc
        return df

    def _market_structure(self, df: pd.DataFrame) -> pd.DataFrame:
        """Swing high/low and structure (+1 bullish / -1 bearish)."""
        c = df["close"].values
        n = len(c)
        hw = self.cfg.STRUCTURE_SWING_HALF
        structure = np.zeros(n)
        sh = [i for i in range(hw, n - hw) if c[i] > c[i - 1] and c[i] > c[i + 1]]
        sl = [i for i in range(hw, n - hw) if c[i] < c[i - 1] and c[i] < c[i + 1]]
        for i in range(40, n):
            rh = [c[j] for j in sh if j < i][-5:]
            rl = [c[j] for j in sl if j < i][-5:]
            if len(rh) >= 2 and len(rl) >= 2:
                if rh[-1] > rh[-2] and rl[-1] > rl[-2]:
                    structure[i] = 1
                elif rh[-1] < rh[-2] and rl[-1] < rl[-2]:
                    structure[i] = -1
        df["structure"] = structure
        self._sh_idx = sh
        self._sl_idx = sl
        return df

    def _pd_zone(self, df: pd.DataFrame) -> pd.DataFrame:
        """Premium (+1) / discount (-1) / equilibrium (0) from rolling range."""
        cfg = self.cfg
        w, buf = cfg.PD_ZONE_WINDOW, cfg.PD_ZONE_BUFFER
        rh = df["high"].rolling(w).max()
        rl = df["low"].rolling(w).min()
        eq = (rh + rl) / 2
        df["pd_zone"] = np.where(
            df["close"] > eq * (1 + buf), 1,
            np.where(df["close"] < eq * (1 - buf), -1, 0),
        )
        return df

    def _fvg_zones(self, df: pd.DataFrame) -> pd.DataFrame:
        """Raw FVG zone arrays for lookback engine (bull/bear lo/hi)."""
        cfg = self.cfg
        n = len(df)
        H = df["high"].values
        L = df["low"].values
        C = df["close"].values
        fvg_bull_lo = np.full(n, np.nan)
        fvg_bull_hi = np.full(n, np.nan)
        fvg_bear_lo = np.full(n, np.nan)
        fvg_bear_hi = np.full(n, np.nan)
        for i in range(2, n):
            if H[i - 2] < L[i]:
                gap = L[i] - H[i - 2]
                if gap / C[i] >= cfg.FVG_MIN_GAP_PCT:
                    fvg_bull_lo[i] = H[i - 2]
                    fvg_bull_hi[i] = L[i]
            if L[i - 2] > H[i]:
                gap = L[i - 2] - H[i]
                if gap / C[i] >= cfg.FVG_MIN_GAP_PCT:
                    fvg_bear_lo[i] = H[i]
                    fvg_bear_hi[i] = L[i - 2]
        self._fvg_bull_lo, self._fvg_bull_hi = fvg_bull_lo, fvg_bull_hi
        self._fvg_bear_lo, self._fvg_bear_hi = fvg_bear_lo, fvg_bear_hi
        return df

    def _ob_zones(self, df: pd.DataFrame) -> pd.DataFrame:
        """Raw OB zone arrays; volume confirmation: only set OB when vol >= OB_VOL_THRESH * avg_vol."""
        cfg = self.cfg
        n = len(df)
        H = df["high"].values
        L = df["low"].values
        C = df["close"].values
        O = df["open"].values
        V = df["volume"].values
        avg_rng = pd.Series(H - L).rolling(16).mean().values
        avg_vol = pd.Series(V).rolling(16).mean().values
        ob_bull_lo = np.full(n, np.nan)
        ob_bull_hi = np.full(n, np.nan)
        ob_bear_lo = np.full(n, np.nan)
        ob_bear_hi = np.full(n, np.nan)
        for i in range(2, n - 2):
            ar = avg_rng[i] if not np.isnan(avg_rng[i]) else 20
            av = avg_vol[i] if not np.isnan(avg_vol[i]) else 5000
            if V[i] < cfg.OB_VOL_THRESH * av:
                continue
            nxt_rng = H[i + 1] - L[i + 1]
            is_imp = nxt_rng > cfg.OB_IMPULSE_MULT * ar
            if not is_imp:
                continue
            if C[i] < O[i] and C[i + 1] > O[i + 1]:
                ob_bull_lo[i], ob_bull_hi[i] = L[i], H[i]
            elif C[i] > O[i] and C[i + 1] < O[i + 1]:
                ob_bear_lo[i], ob_bear_hi[i] = L[i], H[i]
        self._ob_bull_lo, self._ob_bull_hi = ob_bull_lo, ob_bull_hi
        self._ob_bear_lo, self._ob_bear_hi = ob_bear_lo, ob_bear_hi
        return df

    def _fvg_rolling_score(self, df: pd.DataFrame) -> pd.DataFrame:
        """Exponential decay rolling FVG influence (fvg_bull_score, fvg_bear_score)."""
        cfg = self.cfg
        n = len(df)
        C = df["close"].values
        bull_score = np.zeros(n)
        bear_score = np.zeros(n)
        for i in range(2, n, 2):
            if not np.isnan(self._fvg_bull_lo[i]):
                s = (self._fvg_bull_hi[i] - self._fvg_bull_lo[i]) / C[i] / 0.002
                s = min(s, 2.0)
                decay = np.exp(-np.arange(min(cfg.FVG_WINDOW, n - i)) * cfg.FVG_DECAY_RATE)
                bull_score[i : i + len(decay)] += s * decay
            if not np.isnan(self._fvg_bear_lo[i]):
                s = (self._fvg_bear_hi[i] - self._fvg_bear_lo[i]) / C[i] / 0.002
                s = min(s, 2.0)
                decay = np.exp(-np.arange(min(cfg.FVG_WINDOW, n - i)) * cfg.FVG_DECAY_RATE)
                bear_score[i : i + len(decay)] += s * decay
        df["fvg_bull_score"] = np.clip(bull_score, 0, 2)
        df["fvg_bear_score"] = np.clip(bear_score, 0, 2)
        return df

    def _macro_cols(self, df: pd.DataFrame) -> pd.DataFrame:
        """Macro time flag (:00/:20/:40) and macro_boost for position sizing."""
        cfg = self.cfg
        df["macro_time"] = df["minute"].isin(cfg.MACRO_MINUTES).astype(int)
        df["macro_boost"] = np.where(
            df["minute"].isin(cfg.MACRO_BOOST_MIN), cfg.MACRO_BOOST_MULT, 1.0
        )
        return df

    def _mss(self, df: pd.DataFrame) -> pd.DataFrame:
        """Market Structure Shift score; MSS_MACRO_MULT at macro times."""
        cfg = self.cfg
        n = len(df)
        C = df["close"].values
        sh, sl = self._sh_idx, self._sl_idx
        raw = np.zeros(n)
        for i in range(40, n, 4):
            recent_h = [C[j] for j in sh if i - cfg.MSS_LOOKBACK <= j < i]
            recent_l = [C[j] for j in sl if i - cfg.MSS_LOOKBACK <= j < i]
            if not recent_h or not recent_l:
                continue
            ph, pl = max(recent_h), min(recent_l)
            macro = cfg.MSS_MACRO_MULT if df["macro_time"].iloc[i] == 1 else 1.0
            if C[i] > ph:
                strength = (C[i] - ph) / ph / cfg.MSS_BASE_SCALE
                raw[i] = min(strength, cfg.MSS_STRENGTH_CAP) * macro
            elif C[i] < pl:
                strength = (pl - C[i]) / pl / cfg.MSS_BASE_SCALE
                raw[i] = -min(strength, cfg.MSS_STRENGTH_CAP) * macro
        decayed = np.zeros(n)
        for i in range(n):
            if raw[i] != 0:
                d = np.exp(-np.arange(min(cfg.MSS_DECAY_WINDOW, n - i)) * cfg.MSS_DECAY_RATE)
                decayed[i : i + len(d)] += raw[i] * d
        df["mss_score"] = decayed
        return df

    def _lookback_alignment(self, df: pd.DataFrame) -> pd.DataFrame:
        """Exponential lookback alignment at 3h/6h/9h anchors; conf_hits and conf_mult."""
        cfg = self.cfg
        n = len(df)
        C = df["close"].values
        prox = cfg.PROX_BARS
        align_bull = np.zeros(n)
        align_bear = np.zeros(n)
        lb_hits = np.zeros((n, len(cfg.LOOKBACKS)))
        for lb_idx, (bars_back, weight, _) in enumerate(cfg.LOOKBACKS):
            for i in range(bars_back, n):
                anchor = i - bars_back
                price = C[i]
                ab, ae = 0.0, 0.0
                for offset in range(-prox, prox + 1):
                    a = anchor + offset
                    if a < 0 or a >= n:
                        continue
                    pw = weight * (1.0 - abs(offset) / (prox + 1))
                    if not np.isnan(self._fvg_bull_lo[a]) and self._fvg_bull_lo[a] <= price <= self._fvg_bull_hi[a]:
                        gap = (self._fvg_bull_hi[a] - self._fvg_bull_lo[a]) / price
                        ab += pw * min(gap / 0.002, 2.0) * (1.3 if offset == 0 else 1.0)
                    if not np.isnan(self._fvg_bear_lo[a]) and self._fvg_bear_lo[a] <= price <= self._fvg_bear_hi[a]:
                        gap = (self._fvg_bear_hi[a] - self._fvg_bear_lo[a]) / price
                        ae += pw * min(gap / 0.002, 2.0) * (1.3 if offset == 0 else 1.0)
                    if not np.isnan(self._ob_bull_lo[a]) and self._ob_bull_lo[a] <= price <= self._ob_bull_hi[a]:
                        ob_sz = (self._ob_bull_hi[a] - self._ob_bull_lo[a]) / price
                        ab += pw * 0.7 * min(ob_sz / 0.002, 2.0)
                    if not np.isnan(self._ob_bear_lo[a]) and self._ob_bear_lo[a] <= price <= self._ob_bear_hi[a]:
                        ob_sz = (self._ob_bear_hi[a] - self._ob_bear_lo[a]) / price
                        ae += pw * 0.7 * min(ob_sz / 0.002, 2.0)
                align_bull[i] += ab
                align_bear[i] += ae
                lb_hits[i, lb_idx] = 1 if (ab + ae) > 0 else 0
        hits = lb_hits.sum(axis=1)
        df["align_bull"] = np.clip(align_bull, 0, 3)
        df["align_bear"] = np.clip(align_bear, 0, 3)
        df["align_total"] = df["align_bull"] + df["align_bear"]
        df["align_3h"] = lb_hits[:, 0]
        df["align_6h"] = lb_hits[:, 1]
        df["align_9h"] = lb_hits[:, 2]
        df["conf_hits"] = hits
        df["conf_mult"] = df["conf_hits"].astype(int).map(
            lambda x: cfg.CONF_MULTS.get(x, 1.0)
        )
        return df

    def _vol_trend_filters(self, df: pd.DataFrame) -> pd.DataFrame:
        """VIX scalar, vol-target scalar, MA50, TSMOM, sig_thresh."""
        cfg = self.cfg
        ret = df["close"].pct_change()
        bpy = _bars_per_year(cfg.INTERVAL)
        rv14 = ret.rolling(cfg.VOL_LOOKBACK).std() * np.sqrt(bpy)
        df["rv14"] = rv14
        vix_scl = np.ones(len(df))
        for thresh, scl in sorted(cfg.VIX_TIERS, reverse=True):
            vix_scl = np.where(rv14 >= thresh, scl, vix_scl)
        df["vix_scl"] = vix_scl
        df["ma50d"] = df["close"].rolling(cfg.MA50D_BARS).mean()
        df["tsmom"] = (
            df["close"].shift(cfg.TSMOM_FAST) / df["close"].shift(cfg.TSMOM_SLOW) - 1
        )
        df["tsmom_ok"] = (df["tsmom"] >= 0).astype(int)
        df["above_ma50"] = (df["close"] > df["ma50d"]).astype(int)
        df["sig_thresh"] = np.where(
            rv14 >= cfg.VOL_THRESH_PIVOT, cfg.THRESH_HIGH_VOL, cfg.THRESH_LOW_VOL
        )
        min_std = ret.rolling(cfg.VOL_LOOKBACK).std()
        ann_vol = (min_std * np.sqrt(bpy)).clip(0.03, 1.50)
        df["vol_scl"] = (cfg.VOL_TARGET / ann_vol).clip(cfg.MIN_SIZE, cfg.MAX_LEVERAGE)
        return df

    def _ict_composite(self, df: pd.DataFrame) -> pd.DataFrame:
        """Composite ICT score (bull - bear) * conf_mult."""
        cfg = self.cfg
        W = cfg
        bull = (
            (df["pd_zone"] == -1).astype(float) * W.W_PD
            + (df["structure"] == 1).astype(float) * W.W_STRUCT
            + df["fvg_bull_score"] * W.W_FVG
            + np.clip(df["mss_score"], 0, 2) * W.W_MSS
            + df["align_bull"] * W.W_ALIGN
            + W.W_BASE
        ) * df["kz_weight"]
        bear = (
            (df["pd_zone"] == 1).astype(float) * W.W_PD
            + (df["structure"] == -1).astype(float) * W.W_STRUCT
            + df["fvg_bear_score"] * W.W_FVG
            + np.clip(-df["mss_score"], 0, 2) * W.W_MSS
            + df["align_bear"] * W.W_ALIGN
            + W.W_BASE
        ) * df["kz_weight"]
        df["ict_score"] = (bull - bear) * df["conf_mult"]
        return df


# ══════════════════════════════════════════════════════════════════════
# 4. SIGNAL GENERATOR
# ══════════════════════════════════════════════════════════════════════
class SignalGenerator:
    """
    Converts ICT composite score to raw signal and position size.
    Entry at macro times (:00/:20/:40) or, if USE_LEGACY_ENTRY_HOURS, at ENTRY_HOURS_EST only.
    """

    def __init__(self, cfg: Config):
        self.cfg = cfg

    def generate(self, df: pd.DataFrame) -> pd.DataFrame:
        """Raw signal and position with full multiplier stack; clip to MAX_LEVERAGE."""
        cfg = self.cfg
        df = df.copy()
        valid = (df["macro_time"] == 1).values
        if cfg.USE_LEGACY_ENTRY_HOURS:
            valid = valid & df["hour_est"].isin(cfg.ENTRY_HOURS_EST).values
        raw = np.where(
            valid & (df["ict_score"].values > df["sig_thresh"].values),
            1,
            np.where(
                valid & (df["ict_score"].values < -df["sig_thresh"].values),
                -1,
                np.nan,
            ),
        )
        raw = pd.Series(raw, index=df.index).ffill().fillna(0)
        raw = np.where((raw > 0) & (df["above_ma50"].values == 0), 0, raw.values)
        align_boost = df["conf_hits"].astype(int).map(
            lambda x: cfg.CONF_MULTS.get(x, 1.0)
        )
        pos = (
            raw * df["amd_scalar"].values * df["kz_weight"].values * df["macro_boost"].values * align_boost.values
        )
        pos = np.clip(pos, -1.8, 1.8)
        pos = pos * df["vix_scl"].values * df["vol_scl"].values * df["tsmom_ok"].values
        pos = np.clip(pos, -cfg.MAX_LEVERAGE, cfg.MAX_LEVERAGE)
        if cfg.LONG_ONLY:
            pos = np.clip(pos, 0, cfg.MAX_LEVERAGE)
        df["raw_sig"] = raw
        df["position"] = pos
        return df


# ══════════════════════════════════════════════════════════════════════
# 5. RISK ENGINE
# ══════════════════════════════════════════════════════════════════════
class RiskEngine:
    """
    Two-pass risk: tiered drawdown brake then equity-curve filter, then re-brake.
    Replaces single-level circuit breaker from original ICT.
    """

    def __init__(self, cfg: Config):
        self.cfg = cfg

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        """Apply tiered DD brake and EC filter; output strat_ret_final, equity_final, dd_final."""
        cfg = self.cfg
        df = df.copy()
        ret_asset = df["close"].pct_change()
        ret_strat0 = df["position"].shift(1) * ret_asset
        df["asset_ret"] = ret_asset
        df["strat_ret0"] = ret_strat0
        df.dropna(subset=["strat_ret0", "asset_ret"], inplace=True)
        mask1, eq1 = self._tiered_brake(df["strat_ret0"].values)
        df["dd_mask_p1"] = mask1
        df["equity_p1"] = eq1 * cfg.CAPITAL
        eq_ma = df["equity_p1"].rolling(cfg.EC_MA_BARS).mean()
        df["ec_filter"] = np.where(
            df["equity_p1"] < eq_ma * cfg.EC_BUFFER, cfg.EC_REDUCTION, 1.0
        )
        ret2 = df["strat_ret0"] * mask1 * df["ec_filter"]
        mask2, eq2 = self._tiered_brake(ret2.values)
        df["dd_mask"] = mask2
        df["strat_ret_final"] = ret2 * mask2
        df["equity_final"] = eq2 * cfg.CAPITAL
        df["buy_hold"] = (1 + df["asset_ret"]).cumprod() * cfg.CAPITAL
        df["dd_final"] = (df["equity_final"] / df["equity_final"].cummax()) - 1
        df["bh_dd"] = (df["buy_hold"] / df["buy_hold"].cummax()) - 1
        return df

    def _tiered_brake(self, sr: np.ndarray) -> tuple:
        """Tiered drawdown scale (DD_TIERS); returns mask and equity curve."""
        tiers = sorted(self.cfg.DD_TIERS, key=lambda x: x[0])
        eq = np.ones(len(sr))
        mk = np.ones(len(sr))
        pk = 1.0
        for i, r in enumerate(sr):
            if i == 0:
                eq[i] = 1 + r * mk[i]
                pk = max(pk, eq[i])
                continue
            dd = (eq[i - 1] / pk) - 1
            m = 1.0
            for thresh, scl in tiers:
                if dd <= thresh:
                    m = scl
                    break
            mk[i] = m
            eq[i] = eq[i - 1] * (1 + r * m)
            pk = max(pk, eq[i])
        return mk, eq


# ══════════════════════════════════════════════════════════════════════
# 6. ANALYTICS
# ══════════════════════════════════════════════════════════════════════
class Analytics:
    """Performance metrics (CAGR, Sharpe, Sortino, max DD, Calmar, win rate, etc.)."""

    @staticmethod
    def metrics(r: pd.Series, bars_per_year: float | None = None) -> dict:
        """Compute strategy metrics; bars_per_year from INTERVAL if not provided."""
        r = r.dropna()
        bpy = bars_per_year or 252 * 6.5 * 4
        tot = (1 + r).prod() - 1
        ny = len(r) / bpy
        cagr = (1 + tot) ** (1 / max(ny, 0.001)) - 1
        std = r.std()
        sh = r.mean() / std * np.sqrt(bpy) if std > 0 else 0
        dn = r[r < 0].std()
        so = r.mean() / dn * np.sqrt(bpy) if dn > 0 else 0
        eq = (1 + r).cumprod()
        dd = ((eq - eq.cummax()) / eq.cummax()).min()
        cal = abs(cagr / dd) if dd != 0 else 0
        wins, los = r[r > 0], r[r < 0]
        wr = len(wins) / max(len(r[r != 0]), 1)
        pf = wins.sum() / abs(los.sum()) if los.sum() != 0 else float("inf")
        mo = r.resample("ME").apply(lambda x: (1 + x).prod() - 1)
        return dict(
            total_return=tot, cagr=cagr, sharpe=sh, sortino=so,
            max_dd=dd, calmar=cal, win_rate=wr, profit_factor=pf,
            pct_pos_months=(mo > 0).mean(), avg_monthly=mo.mean(), years=ny,
        )

    @staticmethod
    def print_table(sm: dict, bm: dict) -> None:
        """Print strategy vs buy-and-hold metric table."""
        pf_s = "∞" if sm["profit_factor"] == float("inf") else f"{sm['profit_factor']:.2f}"
        pf_b = "∞" if bm["profit_factor"] == float("inf") else f"{bm['profit_factor']:.2f}"
        print(f"\n{'─'*56}")
        print(f"  {'Metric':<24} {'ICT v3.2':>10}  {'B&H':>10}")
        print(f"{'─'*56}")
        for name, sk, bk in [
            ("Total Return", f"{sm['total_return']:>10.2%}", f"{bm['total_return']:>10.2%}"),
            ("CAGR", f"{sm['cagr']:>10.2%}", f"{bm['cagr']:>10.2%}"),
            ("Sharpe", f"{sm['sharpe']:>10.2f}", f"{bm['sharpe']:>10.2f}"),
            ("Sortino", f"{sm['sortino']:>10.2f}", f"{bm['sortino']:>10.2f}"),
            ("Max Drawdown", f"{sm['max_dd']:>10.2%}", f"{bm['max_dd']:>10.2%}"),
            ("Calmar", f"{sm['calmar']:>10.2f}", f"{bm['calmar']:>10.2f}"),
            ("Win Rate", f"{sm['win_rate']:>10.2%}", f"{bm['win_rate']:>10.2%}"),
            ("Profit Factor", f"{pf_s:>10}", f"{pf_b:>10}"),
            ("% Pos Months", f"{sm['pct_pos_months']:>10.2%}", f"{bm['pct_pos_months']:>10.2%}"),
        ]:
            print(f"  {name:<24} {sk}  {bk}")
        print(f"{'─'*56}\n")


# ══════════════════════════════════════════════════════════════════════
# 7. REPORTER
# ══════════════════════════════════════════════════════════════════════
class Reporter:
    """Writes TXT report (with VERSION HISTORY), CSV export, and PNG chart."""

    def __init__(self, cfg: Config):
        self.cfg = cfg

    def write_txt(
        self,
        df: pd.DataFrame,
        sm: dict,
        bm: dict,
        filename: str = "ict_crystalline_results.txt",
    ) -> None:
        """Write full report including VERSION HISTORY section."""
        cfg = self.cfg
        pf_s = "∞" if sm["profit_factor"] == float("inf") else f"{sm['profit_factor']:.2f}"
        pf_b = "∞" if bm["profit_factor"] == float("inf") else f"{bm['profit_factor']:.2f}"
        mo_s = df["strat_ret_final"].resample("ME").apply(lambda x: (1 + x).prod() - 1)
        yr_s = df["strat_ret_final"].resample("YE").apply(lambda x: (1 + x).prod() - 1)
        yr_b = df["asset_ret"].resample("YE").apply(lambda x: (1 + x).prod() - 1)
        lines = [
            "╔══════════════════════════════════════════════════════════════════╗",
            "║  ICT CRYSTALLINE v3.2 — BACKTEST RESULTS                         ║",
            f"║  Generated: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}                                    ║",
            "╚══════════════════════════════════════════════════════════════════╝",
            "",
            "═" * 66,
            "  VERSION HISTORY",
            "═" * 66,
            "  v1.0 — Original ICT (hourly, binary FVG, hard circuit breaker)",
            "  v2.0 — Tiered DD brake, decay FVGs, equity curve filter",
            "  v3.0 — 15-min, MSS at macro times",
            "  v3.1 — Exponential lookback alignment (3h/6h/9h)",
            "  v3.2 — Merged (this file): unified from both source files",
            "",
            "═" * 66,
            "  EXECUTIVE SUMMARY",
            "═" * 66,
            f"  Ticker:        {cfg.TICKER}",
            f"  Capital:       ${cfg.CAPITAL:,}",
            f"  Period:        {df.index[0].date()} → {df.index[-1].date()}",
            f"  Bars:          {len(df):,} ({cfg.INTERVAL} resolution)",
            f"  Years:         {sm['years']:.2f}",
            "",
            f"  {'Metric':<20} {'ICT v3.2':>10}  {'B&H':>10}",
            "  " + "─" * 44,
            f"  {'Total Return':<20} {sm['total_return']:>10.2%}  {bm['total_return']:>10.2%}",
            f"  {'CAGR':<20} {sm['cagr']:>10.2%}  {bm['cagr']:>10.2%}",
            f"  {'Sharpe':<20} {sm['sharpe']:>10.2f}  {bm['sharpe']:>10.2f}",
            f"  {'Sortino':<20} {sm['sortino']:>10.2f}  {bm['sortino']:>10.2f}",
            f"  {'Max Drawdown':<20} {sm['max_dd']:>10.2%}  {bm['max_dd']:>10.2%}",
            f"  {'Calmar':<20} {sm['calmar']:>10.2f}  {bm['calmar']:>10.2f}",
            f"  {'Win Rate':<20} {sm['win_rate']:>10.2%}  {bm['win_rate']:>10.2%}",
            f"  {'Profit Factor':<20} {pf_s:>10}  {pf_b:>10}",
            f"  {'% Pos Months':<20} {sm['pct_pos_months']:>10.2%}  {bm['pct_pos_months']:>10.2%}",
            f"  {'Final Equity':<20} ${df['equity_final'].iloc[-1]:>9,.0f}  ${df['buy_hold'].iloc[-1]:>9,.0f}",
            "",
            "═" * 66,
            "  ANNUAL PERFORMANCE",
            "═" * 66,
            f"  {'Year':<8} {'Strategy':>10}  {'B&H':>10}  {'Alpha':>8}",
            "  " + "─" * 40,
        ]
        for t, sv in yr_s.items():
            bv = yr_b.loc[t]
            lines.append(f"  {t.year:<8} {sv:>10.2%}  {bv:>10.2%}  {sv-bv:>8.2%}")
        lines += [
            "",
            "═" * 66,
            "  CONFIGURATION",
            "═" * 66,
            f"  Interval:         {cfg.INTERVAL}",
            f"  Vol target:       {cfg.VOL_TARGET:.0%}",
            f"  Max leverage:     {cfg.MAX_LEVERAGE:.1f}×",
            f"  Lookbacks:        3h / 6h / 9h",
            f"  Confluence mult:  {cfg.CONF_MULTS}",
            f"  DD brake levels:  {cfg.DD_TIERS}",
            "  Macro entry times: :00, :20, :40 of each hour",
            "",
            "═" * 66,
            "  DISCLAIMER",
            "═" * 66,
            "  For educational purposes only. Past performance does not guarantee future results.",
            "END OF REPORT",
        ]
        with open(filename, "w") as f:
            f.write("\n".join(lines))
        print(f"  [SAVED] {filename}")

    def write_csv(self, df: pd.DataFrame, filename: str = "ict_crystalline_data.csv") -> None:
        """Export bar-by-bar CSV of key columns."""
        cols = [
            "open", "high", "low", "close", "volume",
            "hour_est", "minute", "killzone", "kz_weight", "amd_phase", "amd_scalar",
            "macro_time", "macro_boost", "structure", "pd_zone",
            "fvg_bull_score", "fvg_bear_score", "mss_score",
            "align_bull", "align_bear", "align_total", "align_3h", "align_6h", "align_9h",
            "conf_hits", "conf_mult", "ict_score", "sig_thresh", "raw_sig", "position",
            "rv14", "vix_scl", "vol_scl", "tsmom_ok", "above_ma50",
            "ec_filter", "dd_mask", "asset_ret", "strat_ret_final", "equity_final", "buy_hold",
            "dd_final", "bh_dd",
        ]
        available = [c for c in cols if c in df.columns]
        df[available].to_csv(filename)
        print(f"  [SAVED] {filename}  ({len(df):,} rows × {len(available)} cols)")

    def plot(self, df: pd.DataFrame, sm: dict, bm: dict) -> None:
        """Generate equity and drawdown PNG chart."""
        if not MATPLOTLIB_OK:
            print("  [SKIP] matplotlib not available for plotting.")
            return
        daily = df.resample("1D").agg({
            "equity_final": "last", "buy_hold": "last", "dd_final": "last", "bh_dd": "last",
        }).dropna()
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 9), gridspec_kw={"height_ratios": [2, 1]})
        fig.patch.set_facecolor("#1a1a2e")
        for ax in (ax1, ax2):
            ax.set_facecolor("#16213e")
            ax.tick_params(colors="white")
            ax.xaxis.label.set_color("white")
            ax.yaxis.label.set_color("white")
            ax.title.set_color("white")
            for spine in ax.spines.values():
                spine.set_edgecolor("#333")
        ax1.plot(daily.index, daily["equity_final"], color="#63ebb3", lw=2.0, label=f"ICT v3.2  (Sharpe {sm['sharpe']:.2f})")
        ax1.fill_between(daily.index, self.cfg.CAPITAL, daily["equity_final"], alpha=0.08, color="#63ebb3")
        ax1.plot(daily.index, daily["buy_hold"], color="#ff9a3c", lw=1.5, ls="--", label="Buy & Hold")
        ax1.axhline(self.cfg.CAPITAL, color="#555", lw=0.8, ls=":")
        ax1.set_title("ICT Crystalline v3.2 — Equity Curve", fontsize=13)
        ax1.set_ylabel("Equity ($)", color="white")
        ax1.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, _: f"${x:,.0f}"))
        ax1.legend(facecolor="#0d0d1a", edgecolor="#444", labelcolor="white", fontsize=10)
        ax1.grid(alpha=0.12)
        ax2.fill_between(daily.index, daily["bh_dd"] * 100, 0, alpha=0.25, color="#ef5350")
        ax2.plot(daily.index, daily["bh_dd"] * 100, color="#ef5350", lw=1.5, ls="--", label="B&H DD")
        ax2.fill_between(daily.index, daily["dd_final"] * 100, 0, alpha=0.20, color="#63ebb3")
        ax2.plot(daily.index, daily["dd_final"] * 100, color="#63ebb3", lw=2.0, label="Strategy DD")
        for lvl, col in [(-5, "#ffcc00"), (-10, "#ff8800"), (-15, "#ff4400")]:
            ax2.axhline(lvl, color=col, lw=0.7, ls=":", label=f"Brake {lvl}%")
        ax2.set_title("Drawdown Comparison", fontsize=11)
        ax2.set_ylabel("Drawdown %", color="white")
        ax2.set_xlabel("Date", color="white")
        ax2.legend(facecolor="#0d0d1a", edgecolor="#444", labelcolor="white", fontsize=9, ncol=3)
        ax2.grid(alpha=0.12)
        ax2.xaxis.set_major_formatter(mdates.DateFormatter("%b '%y"))
        ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
        plt.setp(ax2.xaxis.get_majorticklabels(), rotation=30, ha="right")
        plt.tight_layout()
        plt.savefig("ict_crystalline_chart.png", dpi=140, bbox_inches="tight", facecolor="#1a1a2e")
        print("  [SAVED] ict_crystalline_chart.png")
        plt.close()


# ══════════════════════════════════════════════════════════════════════
# 8. MAIN
# ══════════════════════════════════════════════════════════════════════
def main() -> None:
    """Orchestrate load → signals → position → risk → analytics → report."""
    parser = argparse.ArgumentParser(description="ICT Crystalline v3.2 — NQ Futures Strategy")
    parser.add_argument("--ticker", default="NQ=F")
    parser.add_argument("--start", default="2024-01-01")
    parser.add_argument("--end", default=datetime.today().strftime("%Y-%m-%d"))
    parser.add_argument("--capital", default=100_000, type=int)
    parser.add_argument("--interval", default="15m")
    parser.add_argument("--save-csv", action="store_true", help="Export bar-by-bar CSV")
    parser.add_argument("--plot", action="store_true", help="Generate equity/DD chart PNG (requires matplotlib)")
    parser.add_argument("--version", action="store_true", help="Print version and exit")
    args = parser.parse_args()

    if args.version:
        print("ICT Crystalline v3.2")
        return

    cfg = Config()
    cfg.TICKER = args.ticker
    cfg.START = args.start
    cfg.END = args.end
    cfg.CAPITAL = args.capital
    cfg.INTERVAL = args.interval

    print("╔══════════════════════════════════════╗")
    print("║  ICT CRYSTALLINE v3.2 — NQ Backtest ║")
    print("╚══════════════════════════════════════╝")
    print(f"  Ticker: {cfg.TICKER} | {cfg.START} → {cfg.END}")
    print(f"  Interval: {cfg.INTERVAL} | Capital: ${cfg.CAPITAL:,}\n")

    print("[1/5] Loading data...")
    loader = DataLoader(cfg)
    df = loader.load()

    print(f"[2/5] Computing ICT signals on {len(df):,} bars...")
    signals = ICTSignals(cfg)
    df = signals.compute_all(df)

    print("[3/5] Generating signals & positions...")
    sg = SignalGenerator(cfg)
    df = sg.generate(df)

    print("[4/5] Applying risk controls (tiered brake + EC filter)...")
    risk = RiskEngine(cfg)
    df = risk.apply(df)

    print("[5/5] Computing performance analytics...")
    bpy = _bars_per_year(cfg.INTERVAL)
    sm = Analytics.metrics(df["strat_ret_final"], bpy)
    bm = Analytics.metrics(df["asset_ret"], bpy)

    Analytics.print_table(sm, bm)
    yr_s = df["strat_ret_final"].resample("YE").apply(lambda x: (1 + x).prod() - 1)
    yr_b = df["asset_ret"].resample("YE").apply(lambda x: (1 + x).prod() - 1)
    print("  Annual Breakdown:")
    for t, sv in yr_s.items():
        bv = yr_b.get(t, 0)
        print(f"    {t.year}:  Strategy {sv:+.1%}  |  B&H {bv:+.1%}")
    print(f"\n  Final Equity: ${df['equity_final'].iloc[-1]:,.0f}")
    print(f"  B&H Equity:   ${df['buy_hold'].iloc[-1]:,.0f}\n")

    rep = Reporter(cfg)
    rep.write_txt(df, sm, bm)
    if args.save_csv:
        rep.write_csv(df)
    if args.plot:
        rep.plot(df, sm, bm)

    print("\n✅ Done. Files saved:")
    print("   ict_crystalline_results.txt")
    if args.save_csv:
        print("   ict_crystalline_data.csv")
    if args.plot:
        print("   ict_crystalline_chart.png")


if __name__ == "__main__":
    main()
