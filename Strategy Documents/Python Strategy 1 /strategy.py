"""
Trading strategy: run_cycle on each new bar, custom_math hook, position sizing, risk flatten.
Decision windows: run signals 5 minutes before and 5 minutes after the 20- and 50-minute marks
each hour (minutes 15, 20, 25, 45, 50, 55). Works for stocks, crypto, and any Alpaca asset.
"""
from __future__ import annotations

import logging
import threading
from collections import defaultdict
from datetime import datetime, timezone
from queue import Queue
from typing import Any

from broker import AlpacaBroker, BarData, asset_type
from config import Config

logger = logging.getLogger(__name__)

# Optional custom math: returns "buy" | "sell" | "hold"
_custom_math_loaded = False
_your_signal_function = None


def _load_custom_math() -> bool:
    global _custom_math_loaded, _your_signal_function
    if _custom_math_loaded:
        return _your_signal_function is not None
    _custom_math_loaded = True
    try:
        from custom_math import your_signal_function
        _your_signal_function = your_signal_function
        logger.info("Custom math loaded: your_signal_function")
        return True
    except ImportError as e:
        logger.info("Custom math not used (import failed): %s", e)
        return False
    except AttributeError:
        logger.info("Custom math module has no your_signal_function")
        return False


class TradingStrategy:
    """
    Runs on each new bar: custom math signal, position sizing, risk check (flatten if unrealized loss >= max %).
    Pushes log/UI messages via ui_queue (dicts with type/text/color or type/data).
    """

    def __init__(
        self,
        broker: AlpacaBroker,
        watched_symbols: list[str],
        config: Config,
        ui_queue: Queue[dict[str, Any]] | None = None,
    ) -> None:
        self.broker = broker
        self.watched_symbols = watched_symbols
        self.config = config
        self.ui_queue = ui_queue or Queue()
        self._lock = threading.Lock()
        self._running = True
        self._bar_buffer: dict[str, BarData] = {}
        self._bar_history: dict[str, list[BarData]] = {}
        self._position_entry_time: dict[str, datetime] = {}  # normalized symbol -> UTC entry time
        self._asset_class_buy_rotation: list[str] = ["stock", "crypto"]  # order for preferring which class to buy
        self._last_buy_class_index: int = 0  # next class to prefer when multiple buys
        # Eager-load signal so first focus-minute bar can trade immediately
        _load_custom_math()
        if _your_signal_function is not None:
            self._log_ui("Strategy ready. Trading will execute on buy/sell signals in focus minutes.", "info")
        else:
            self._log_ui("Strategy ready but custom_math not loaded — no trades until signal is available.", "blue")

    def _log_ui(self, text: str, color: str = "info") -> None:
        if self.ui_queue is not None:
            self.ui_queue.put({"type": "log", "text": text, "color": color})

    def start(self) -> None:
        """Resume strategy after stop(); allows run_cycle to process bars again."""
        self._running = True

    def _can_trade(self) -> bool:
        """Check position count, account, and daily loss limit."""
        try:
            if self._daily_loss_limit_breached():
                self._log_ui("No new trades: daily loss limit reached.", "blue")
                return False
            positions = self.broker.get_positions()
            if len(positions) >= self.config.MAX_POSITIONS:
                self._log_ui(f"No new trades: max positions ({self.config.MAX_POSITIONS}) reached.", "blue")
                return False
            return True
        except Exception:
            return False

    def _compute_qty(self, symbol: str, side: str) -> float:
        """Position size: fixed qty or % of equity; capped by buying_power * MARGIN_SAFETY_FRACTION."""
        if self.config.FIXED_QTY is not None:
            base_qty = float(self.config.FIXED_QTY)
        else:
            try:
                account = self.broker.get_account()
                if account is None:
                    return 1.0
                equity = float(getattr(account, "equity", 0) or 0)
                if equity <= 0:
                    return 1.0
                pct = self.config.POSITION_SIZE_PCT / 100.0
                notional = equity * pct
                bar = self._bar_buffer.get(symbol)
                price = float(bar.close) if bar else 1.0
                if price <= 0:
                    return 1.0
                qty = notional / price
                base_qty = max(1, round(qty, 0)) if qty >= 1 else 1.0
            except Exception as e:
                logger.debug("_compute_qty: %s", e)
                return 1.0
        # Cap by margin: order notional must not exceed buying_power * safety fraction
        try:
            buying_power = self.broker.get_buying_power()
            if buying_power is not None and buying_power > 0:
                safety = getattr(self.config, "MARGIN_SAFETY_FRACTION", 0.95)
                max_notional = buying_power * safety
                bar = self._bar_buffer.get(symbol)
                price = float(bar.close) if bar else 1.0
                if price > 0:
                    max_qty = max_notional / price
                    if base_qty * price > max_notional:
                        base_qty = max(1, int(max_qty)) if max_qty >= 1 else (max_qty if asset_type(symbol) == "crypto" else 1.0)
                        logger.debug("_compute_qty: reduced qty for margin (symbol=%s)", symbol)
        except Exception as e:
            logger.debug("_compute_qty margin cap: %s", e)
        return base_qty

    def _daily_loss_limit_breached(self) -> bool:
        """True if day PnL is worse than MAX_DAILY_LOSS_PCT of previous equity.
        Uses Alpaca last_equity (previous trading day); if missing we use equity so day_pnl_pct is 0 and limit never triggers.
        """
        try:
            account = self.broker.get_account()
            if account is None:
                return False
            equity = float(getattr(account, "equity", 0) or 0)
            last_equity = float(getattr(account, "last_equity", 0) or 0) or equity
            if last_equity <= 0:
                return False
            day_pnl_pct = (equity - last_equity) / last_equity * 100.0
            max_daily = getattr(self.config, "MAX_DAILY_LOSS_PCT", 5.0)
            return day_pnl_pct <= -max_daily
        except Exception:
            return False

    def _record_position_entry_now(self, sym: str) -> None:
        """Set position entry time to now for symbol (first sight or new buy)."""
        key = self._normalize_symbol_key(sym)
        self._position_entry_time[key] = datetime.now(timezone.utc)

    def _clear_position_entry(self, sym: str) -> None:
        """Remove entry time when position is closed."""
        key = self._normalize_symbol_key(sym)
        self._position_entry_time.pop(key, None)

    def _risk_check(self) -> None:
        """Flatten by stop-loss / take-profit / max-hold; flatten all if daily loss limit breached."""
        try:
            max_hold_minutes = getattr(self.config, "MAX_HOLD_MINUTES", 30)
            positions = self.broker.get_positions()
            now_utc = datetime.now(timezone.utc)
            for pos in positions:
                sym = getattr(pos, "symbol", None) or getattr(pos, "symbol_id", "")
                if not sym:
                    continue
                key = self._normalize_symbol_key(sym)
                if key not in self._position_entry_time:
                    self._record_position_entry_now(sym)
                entry_time = self._position_entry_time.get(key)
                if entry_time is not None:
                    delta = now_utc - (entry_time if entry_time.tzinfo else entry_time.replace(tzinfo=timezone.utc))
                    elapsed_minutes = delta.total_seconds() / 60.0
                    if elapsed_minutes >= max_hold_minutes:
                        qty = float(getattr(pos, "qty", 0) or 0)
                        if qty != 0:
                            side = self._position_side(pos)
                            if side == "long":
                                self.broker.submit_order(sym, abs(qty), "sell")
                                self._log_ui(f"Max hold: closed long {abs(qty)} {sym} after {max_hold_minutes} min", "blue")
                            else:
                                self.broker.submit_order(sym, abs(qty), "buy")
                                self._log_ui(f"Max hold: covered short {abs(qty)} {sym} after {max_hold_minutes} min", "blue")
                            self._clear_position_entry(sym)
                            continue
            positions = self.broker.get_positions()
            if self._daily_loss_limit_breached():
                for pos in positions:
                    sym = getattr(pos, "symbol", None) or getattr(pos, "symbol_id", "")
                    qty = float(getattr(pos, "qty", 0) or 0)
                    if not sym or qty == 0:
                        continue
                    side = self._position_side(pos)
                    if side == "long":
                        self.broker.submit_order(sym, abs(qty), "sell")
                        self._log_ui(f"Daily loss limit: flattened long {abs(qty)} {sym}", "red")
                    else:
                        self.broker.submit_order(sym, abs(qty), "buy")
                        self._log_ui(f"Daily loss limit: covered short {abs(qty)} {sym}", "red")
                    self._clear_position_entry(sym)
                return
            max_loss_pct = getattr(self.config, "MAX_UNREALIZED_LOSS_PCT", 5.0)
            take_profit_pct = getattr(self.config, "TAKE_PROFIT_PCT", 0.0)
            positions = self.broker.get_positions()
            for pos in positions:
                sym = getattr(pos, "symbol", None) or getattr(pos, "symbol_id", "")
                if not sym:
                    continue
                unrealized_pct = float(getattr(pos, "unrealized_plpc", 0) or 0) * 100.0
                qty = float(getattr(pos, "qty", 0) or 0)
                if qty == 0:
                    continue
                side = self._position_side(pos)
                close_side = "sell" if side == "long" else "buy"
                if unrealized_pct <= -max_loss_pct:
                    self.broker.submit_order(sym, abs(qty), close_side)
                    self._clear_position_entry(sym)
                    self._log_ui(f"Risk flatten: closed {side} {abs(qty)} {sym} (loss %={unrealized_pct:.2f})", "red")
                elif take_profit_pct > 0 and unrealized_pct >= take_profit_pct:
                    self.broker.submit_order(sym, abs(qty), close_side)
                    self._clear_position_entry(sym)
                    self._log_ui(f"Take profit: closed {side} {abs(qty)} {sym} (gain %={unrealized_pct:.2f})", "green")
        except Exception as e:
            logger.exception("_risk_check: %s", e)

    @staticmethod
    def _symbol_eq(a: str, b: str) -> bool:
        """True if symbols refer to same asset (e.g. BTC/USD and BTCUSD)."""
        if a == b:
            return True
        return (a or "").replace("/", "").upper() == (b or "").replace("/", "").upper()

    @staticmethod
    def _position_side(pos: Any) -> str:
        """Return 'long' or 'short' from Alpaca position (side attribute or qty sign)."""
        side = (getattr(pos, "side", None) or "").__str__().strip().lower()
        if side == "short":
            return "short"
        qty = float(getattr(pos, "qty", 0) or 0)
        if qty < 0:
            return "short"
        return "long"

    @staticmethod
    def _normalize_symbol_key(symbol: str) -> str:
        """Canonical key for position entry time dict."""
        return (symbol or "").replace("/", "").upper()

    def _minute_of_hour(self, bar_data: BarData) -> int | None:
        """Parse bar timestamp; return minute (0-59) or None if unparseable."""
        ts = getattr(bar_data, "timestamp", "") or ""
        if not ts:
            return None
        try:
            if hasattr(bar_data.timestamp, "minute"):
                return bar_data.timestamp.minute
            s = str(ts).replace("Z", "+00:00")
            dt = datetime.fromisoformat(s)
            return dt.minute
        except Exception:
            return None

    def run_cycle(self, bar_data_dict: dict[str, BarData]) -> None:
        """
        Called on every new bar (or batch). Updates bar buffer and history, runs risk check.
        When TRADE_INTERVAL_MINUTES is set (e.g. 5), trades every 5 minutes (0, 5, 10, ..., 55).
        Otherwise uses FOCUS_MINUTES (e.g. 15, 20, 25, 45, 50, 55).
        """
        if not bar_data_dict:
            return
        interval = getattr(self.config, "TRADE_INTERVAL_MINUTES", 0) or 0
        if interval > 0:
            focus_minutes = tuple(range(0, 60, interval))
        else:
            focus_minutes = getattr(self.config, "FOCUS_MINUTES", (15, 20, 25, 45, 50, 55))
        max_history = getattr(self.config, "BAR_HISTORY_MAX", 120)

        with self._lock:
            self._bar_buffer.update(bar_data_dict)
            for symbol, bar_data in bar_data_dict.items():
                hist = self._bar_history.setdefault(symbol, [])
                hist.append(bar_data)
                if len(hist) > max_history:
                    self._bar_history[symbol] = hist[-max_history:]

        self._risk_check()
        if not self._running:
            return
        can_trade = self._can_trade()
        focus_results: list[tuple[str, str]] = []  # (symbol, signal) for visibility log
        buy_symbols: list[str] = []  # symbols with buy signal and no long yet (open long)
        sell_symbols: list[str] = []  # symbols with sell signal and no short yet (open short)

        for symbol, bar_data in bar_data_dict.items():
            minute = self._minute_of_hour(bar_data)
            if minute is not None and minute not in focus_minutes:
                continue
            with self._lock:
                history = list(self._bar_history.get(symbol, []))

            signal = "hold"
            if _your_signal_function is not None:
                try:
                    signal = _your_signal_function(
                        symbol, bar_data, self.broker, bar_history=history, config=self.config
                    )
                    if signal not in ("buy", "sell", "hold"):
                        signal = "hold"
                except Exception as e:
                    logger.exception("Custom math signal error for %s: %s", symbol, e)
                    signal = "hold"
            else:
                _load_custom_math()
                if _your_signal_function is None:
                    continue

            focus_results.append((symbol, signal))
            positions = self.broker.get_positions()

            if signal == "buy":
                has_position = False
                for pos in positions:
                    psym = getattr(pos, "symbol", None) or getattr(pos, "symbol_id", "")
                    if not self._symbol_eq(psym, symbol):
                        continue
                    has_position = True
                    qty = float(getattr(pos, "qty", 0) or 0)
                    if qty == 0:
                        continue
                    side = self._position_side(pos)
                    if side == "short":
                        try:
                            self.broker.submit_order(symbol, abs(qty), "buy")
                            self._clear_position_entry(symbol)
                            self._log_ui(f"Cover short {abs(qty)} {symbol}", "green")
                        except Exception as e:
                            self._log_ui(f"Cover failed {symbol}: {e}", "red")
                    break
                if not has_position:
                    buy_symbols.append(symbol)

            if signal == "sell":
                has_position = False
                for pos in positions:
                    psym = getattr(pos, "symbol", None) or getattr(pos, "symbol_id", "")
                    if not self._symbol_eq(psym, symbol):
                        continue
                    has_position = True
                    qty = float(getattr(pos, "qty", 0) or 0)
                    if qty == 0:
                        continue
                    side = self._position_side(pos)
                    if side == "long":
                        try:
                            self.broker.submit_order(symbol, abs(qty), "sell")
                            self._clear_position_entry(symbol)
                            self._log_ui(f"Sell long {abs(qty)} {symbol}", "red")
                        except Exception as e:
                            self._log_ui(f"Sell failed {symbol}: {e}", "red")
                    break
                if not has_position:
                    sell_symbols.append(symbol)

        # At most one new long per cycle; prefer symbol from under-traded asset class (rotation)
        if can_trade and buy_symbols:
            positions = self.broker.get_positions()
            position_count_by_class: dict[str, int] = defaultdict(int)
            for pos in positions:
                psym = getattr(pos, "symbol", None) or getattr(pos, "symbol_id", "")
                if psym:
                    position_count_by_class[asset_type(psym)] += 1
            classes = self._asset_class_buy_rotation
            idx = self._last_buy_class_index % len(classes) if classes else 0
            preferred_class = classes[idx]
            chosen = None
            for sym in buy_symbols:
                if asset_type(sym) == preferred_class:
                    chosen = sym
                    break
            if chosen is None:
                chosen = buy_symbols[0]
            else:
                self._last_buy_class_index = (idx + 1) % len(classes)
            qty = self._compute_qty(chosen, "buy")
            try:
                self.broker.submit_order(chosen, qty, "buy")
                self._record_position_entry_now(chosen)
                self._log_ui(f"Buy (long) {qty} {chosen}", "green")
            except Exception as e:
                self._log_ui(f"Buy failed {chosen}: {e}", "red")

        # At most one new short per cycle; same asset-class rotation as for longs
        if can_trade and sell_symbols:
            positions = self.broker.get_positions()
            position_count_by_class: dict[str, int] = defaultdict(int)
            for pos in positions:
                psym = getattr(pos, "symbol", None) or getattr(pos, "symbol_id", "")
                if psym:
                    position_count_by_class[asset_type(psym)] += 1
            classes = self._asset_class_buy_rotation
            idx = self._last_buy_class_index % len(classes) if classes else 0
            preferred_class = classes[idx]
            chosen = None
            for sym in sell_symbols:
                if asset_type(sym) == preferred_class:
                    chosen = sym
                    break
            if chosen is None:
                chosen = sell_symbols[0]
            else:
                self._last_buy_class_index = (idx + 1) % len(classes)
            qty = self._compute_qty(chosen, "sell")
            try:
                self.broker.submit_order(chosen, qty, "sell")
                self._record_position_entry_now(chosen)
                self._log_ui(f"Sell (short) {qty} {chosen}", "red")
            except Exception as e:
                self._log_ui(f"Short failed {chosen}: {e}", "red")

        if focus_results:
            parts = [f"{s} {sig}" for s, sig in focus_results]
            trades = sum(1 for _, sig in focus_results if sig in ("buy", "sell"))
            msg = f"Focus: {', '.join(parts)}"
            if trades:
                msg += f" ({trades} trade(s))"
            self._log_ui(msg, "info")

    def stop(self) -> None:
        self._running = False
        with self._lock:
            self._bar_buffer.clear()
            self._bar_history.clear()
            self._position_entry_time.clear()
