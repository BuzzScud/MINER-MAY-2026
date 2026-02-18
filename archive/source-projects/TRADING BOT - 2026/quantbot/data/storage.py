"""
Storage: SQLite metadata + Parquet OHLCV cache, replay capability,
trade/signal/daily-metrics persistence for adaptive learning.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

import pandas as pd


def get_sqlite_path(cache_dir: Path) -> Path:
    return cache_dir / "meta.sqlite"


def _get_conn(cache_dir: Path) -> sqlite3.Connection:
    """Return a connection with WAL mode for concurrent read safety."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(get_sqlite_path(cache_dir), timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


def init_db(cache_dir: Path) -> None:
    """Create all SQLite tables (idempotent)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    conn = _get_conn(cache_dir)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ohlcv_meta (
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            start_ts TEXT NOT NULL,
            end_ts TEXT NOT NULL,
            parquet_path TEXT NOT NULL,
            PRIMARY KEY (symbol, timeframe)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            entry_price REAL NOT NULL,
            exit_price REAL NOT NULL,
            quantity REAL NOT NULL,
            entry_time TEXT NOT NULL,
            exit_time TEXT NOT NULL,
            pnl REAL NOT NULL,
            exit_reason TEXT NOT NULL DEFAULT '',
            atr_at_entry REAL NOT NULL DEFAULT 0.0,
            regime_at_entry TEXT NOT NULL DEFAULT '',
            signal_metadata TEXT NOT NULL DEFAULT '{}',
            strategy_params TEXT NOT NULL DEFAULT '{}'
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            strength REAL NOT NULL,
            acted_on INTEGER NOT NULL DEFAULT 0,
            skip_reason TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            regime TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_metrics (
            date TEXT PRIMARY KEY,
            equity REAL NOT NULL,
            sharpe REAL NOT NULL DEFAULT 0.0,
            sortino REAL NOT NULL DEFAULT 0.0,
            max_drawdown REAL NOT NULL DEFAULT 0.0,
            win_rate REAL NOT NULL DEFAULT 0.0,
            expectancy REAL NOT NULL DEFAULT 0.0,
            profit_factor REAL NOT NULL DEFAULT 0.0,
            total_pnl REAL NOT NULL DEFAULT 0.0,
            trade_count INTEGER NOT NULL DEFAULT 0,
            regime_summary TEXT NOT NULL DEFAULT '{}'
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS adaptive_weights (
            signal_type TEXT PRIMARY KEY,
            weight REAL NOT NULL DEFAULT 1.0,
            win_rate REAL NOT NULL DEFAULT 0.0,
            avg_pnl REAL NOT NULL DEFAULT 0.0,
            kelly REAL NOT NULL DEFAULT 0.0,
            trade_count INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.commit()
    conn.close()


# ── Trade persistence ──────────────────────────────────────────────

def save_trade(cache_dir: Path, trade: dict[str, Any]) -> None:
    """Persist a closed trade to SQLite."""
    init_db(cache_dir)
    conn = _get_conn(cache_dir)
    conn.execute(
        """INSERT INTO trades
           (symbol, side, entry_price, exit_price, quantity,
            entry_time, exit_time, pnl, exit_reason, atr_at_entry,
            regime_at_entry, signal_metadata, strategy_params)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            trade["symbol"],
            trade["side"],
            trade["entry_price"],
            trade["exit_price"],
            trade["quantity"],
            trade["entry_time"],
            trade["exit_time"],
            trade["pnl"],
            trade.get("exit_reason", ""),
            trade.get("atr_at_entry", 0.0),
            trade.get("regime_at_entry", ""),
            json.dumps(trade.get("signal_metadata", {})),
            json.dumps(trade.get("strategy_params", {})),
        ),
    )
    conn.commit()
    conn.close()


def load_trades(cache_dir: Path, days_back: int = 30) -> list[dict[str, Any]]:
    """Load closed trades from the last N days."""
    init_db(cache_dir)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
    conn = _get_conn(cache_dir)
    rows = conn.execute(
        "SELECT * FROM trades WHERE exit_time >= ? ORDER BY exit_time",
        (cutoff,),
    ).fetchall()
    conn.close()
    result: list[dict[str, Any]] = []
    for r in rows:
        result.append({
            "id": r["id"],
            "symbol": r["symbol"],
            "side": r["side"],
            "entry_price": r["entry_price"],
            "exit_price": r["exit_price"],
            "quantity": r["quantity"],
            "entry_time": r["entry_time"],
            "exit_time": r["exit_time"],
            "pnl": r["pnl"],
            "exit_reason": r["exit_reason"],
            "atr_at_entry": r["atr_at_entry"],
            "regime_at_entry": r["regime_at_entry"],
            "signal_metadata": json.loads(r["signal_metadata"]),
            "strategy_params": json.loads(r["strategy_params"]),
        })
    return result


# ── Signal persistence ─────────────────────────────────────────────

def save_signal(cache_dir: Path, sig: dict[str, Any]) -> None:
    """Persist a generated signal (acted-on or skipped)."""
    init_db(cache_dir)
    conn = _get_conn(cache_dir)
    conn.execute(
        """INSERT INTO signals
           (timestamp, symbol, side, strength, acted_on, skip_reason, metadata, regime)
           VALUES (?,?,?,?,?,?,?,?)""",
        (
            sig["timestamp"],
            sig["symbol"],
            sig["side"],
            sig["strength"],
            1 if sig.get("acted_on", False) else 0,
            sig.get("skip_reason", ""),
            json.dumps(sig.get("metadata", {})),
            sig.get("regime", ""),
        ),
    )
    conn.commit()
    conn.close()


def load_signals(cache_dir: Path, days_back: int = 30) -> list[dict[str, Any]]:
    """Load signals from the last N days."""
    init_db(cache_dir)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
    conn = _get_conn(cache_dir)
    rows = conn.execute(
        "SELECT * FROM signals WHERE timestamp >= ? ORDER BY timestamp",
        (cutoff,),
    ).fetchall()
    conn.close()
    result: list[dict[str, Any]] = []
    for r in rows:
        result.append({
            "id": r["id"],
            "timestamp": r["timestamp"],
            "symbol": r["symbol"],
            "side": r["side"],
            "strength": r["strength"],
            "acted_on": bool(r["acted_on"]),
            "skip_reason": r["skip_reason"],
            "metadata": json.loads(r["metadata"]),
            "regime": r["regime"],
        })
    return result


# ── Daily metrics persistence ──────────────────────────────────────

def save_daily_metrics(cache_dir: Path, metrics: dict[str, Any]) -> None:
    """Persist an end-of-day metrics snapshot."""
    init_db(cache_dir)
    conn = _get_conn(cache_dir)
    conn.execute(
        """INSERT OR REPLACE INTO daily_metrics
           (date, equity, sharpe, sortino, max_drawdown, win_rate,
            expectancy, profit_factor, total_pnl, trade_count, regime_summary)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            metrics["date"],
            metrics["equity"],
            metrics.get("sharpe", 0.0),
            metrics.get("sortino", 0.0),
            metrics.get("max_drawdown", 0.0),
            metrics.get("win_rate", 0.0),
            metrics.get("expectancy", 0.0),
            metrics.get("profit_factor", 0.0),
            metrics.get("total_pnl", 0.0),
            metrics.get("trade_count", 0),
            json.dumps(metrics.get("regime_summary", {})),
        ),
    )
    conn.commit()
    conn.close()


def load_daily_metrics(cache_dir: Path, days_back: int = 90) -> list[dict[str, Any]]:
    """Load daily metrics from the last N days."""
    init_db(cache_dir)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
    conn = _get_conn(cache_dir)
    rows = conn.execute(
        "SELECT * FROM daily_metrics WHERE date >= ? ORDER BY date",
        (cutoff,),
    ).fetchall()
    conn.close()
    result: list[dict[str, Any]] = []
    for r in rows:
        result.append({
            "date": r["date"],
            "equity": r["equity"],
            "sharpe": r["sharpe"],
            "sortino": r["sortino"],
            "max_drawdown": r["max_drawdown"],
            "win_rate": r["win_rate"],
            "expectancy": r["expectancy"],
            "profit_factor": r["profit_factor"],
            "total_pnl": r["total_pnl"],
            "trade_count": r["trade_count"],
            "regime_summary": json.loads(r["regime_summary"]),
        })
    return result


# ── Adaptive weights persistence ───────────────────────────────────

def save_adaptive_weights(cache_dir: Path, weights: dict[str, dict[str, Any]]) -> None:
    """Persist adaptive signal weights."""
    init_db(cache_dir)
    conn = _get_conn(cache_dir)
    now_iso = datetime.now(timezone.utc).isoformat()
    for signal_type, data in weights.items():
        conn.execute(
            """INSERT OR REPLACE INTO adaptive_weights
               (signal_type, weight, win_rate, avg_pnl, kelly, trade_count, updated_at)
               VALUES (?,?,?,?,?,?,?)""",
            (
                signal_type,
                data.get("weight", 1.0),
                data.get("win_rate", 0.0),
                data.get("avg_pnl", 0.0),
                data.get("kelly", 0.0),
                data.get("trade_count", 0),
                now_iso,
            ),
        )
    conn.commit()
    conn.close()


def load_adaptive_weights(cache_dir: Path) -> dict[str, dict[str, Any]]:
    """Load persisted adaptive weights."""
    init_db(cache_dir)
    conn = _get_conn(cache_dir)
    rows = conn.execute("SELECT * FROM adaptive_weights").fetchall()
    conn.close()
    result: dict[str, dict[str, Any]] = {}
    for r in rows:
        result[r["signal_type"]] = {
            "weight": r["weight"],
            "win_rate": r["win_rate"],
            "avg_pnl": r["avg_pnl"],
            "kelly": r["kelly"],
            "trade_count": r["trade_count"],
            "updated_at": r["updated_at"],
        }
    return result


def write_ohlcv(cache_dir: Path, symbol: str, timeframe: str, df: pd.DataFrame) -> None:
    """Write OHLCV DataFrame to Parquet and register in SQLite."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    init_db(cache_dir)
    path = cache_dir / f"{symbol}_{timeframe}.parquet"
    df.to_parquet(path, index=True)
    if not df.empty:
        start_ts = str(df.index.min())
        end_ts = str(df.index.max())
    else:
        start_ts = end_ts = ""
    conn = sqlite3.connect(get_sqlite_path(cache_dir))
    conn.execute(
        "INSERT OR REPLACE INTO ohlcv_meta (symbol, timeframe, start_ts, end_ts, parquet_path) VALUES (?,?,?,?,?)",
        (symbol, timeframe, start_ts, end_ts, str(path)),
    )
    conn.commit()
    conn.close()


def read_ohlcv(cache_dir: Path, symbol: str, timeframe: str) -> pd.DataFrame:
    """Read OHLCV from Parquet if exists."""
    path = cache_dir / f"{symbol}_{timeframe}.parquet"
    if not path.exists():
        return pd.DataFrame(
            columns=["open", "high", "low", "close", "volume"],
            index=pd.DatetimeIndex([], name="timestamp"),
        )
    return pd.read_parquet(path)


def list_cached(cache_dir: Path) -> list[tuple[str, str]]:
    """List (symbol, timeframe) pairs in cache."""
    init_db(cache_dir)
    conn = sqlite3.connect(get_sqlite_path(cache_dir))
    rows = conn.execute("SELECT symbol, timeframe FROM ohlcv_meta").fetchall()
    conn.close()
    return [(r[0], r[1]) for r in rows]


def replay_bars(cache_dir: Path, symbol: str, timeframe: str) -> Iterator[tuple[pd.Timestamp, pd.Series]]:
    """Yield (timestamp, row) for replay backtest."""
    df = read_ohlcv(cache_dir, symbol, timeframe)
    if df.empty:
        return
    for ts, row in df.iterrows():
        yield ts, row
