"""
RocketBot dashboard server: Flask-SocketIO, REST API, WebSocket events.
Run with: python -m quantbot.server
Dashboard http://localhost:8080, metrics on :9090.
"""
from __future__ import annotations

import os
import sys
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from flask import Flask, jsonify, render_template, request
    HAS_FLASK = True
except ImportError:
    HAS_FLASK = False

try:
    from flask_socketio import SocketIO
    HAS_SOCKETIO = True
except ImportError:
    HAS_SOCKETIO = False

# Singleton bot runner
_bot_runner: "BotRunner | None" = None
_backtest_runner: "BacktestRunner | None" = None


def get_bot_runner() -> "BotRunner":
    global _bot_runner
    if _bot_runner is None:
        from quantbot.webapp.bot_runner import BotRunner
        _bot_runner = BotRunner(initial_equity=100_000.0)
    return _bot_runner


def get_backtest_runner() -> "BacktestRunner":
    global _backtest_runner
    if _backtest_runner is None:
        from quantbot.webapp.backtest_runner import BacktestRunner
        _backtest_runner = BacktestRunner()
    return _backtest_runner


def create_app() -> "Flask":
    if not HAS_FLASK:
        raise RuntimeError("Flask not installed; pip install flask")
    app = Flask(__name__, template_folder=Path(__file__).parent / "templates", static_folder=Path(__file__).parent / "static")
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading") if HAS_SOCKETIO else None

    @app.route("/")
    def index() -> str:
        return render_template("index.html")

    @app.route("/health")
    def health() -> tuple[str, int]:
        return "ok", 200

    @app.route("/api/state")
    def api_state():
        runner = get_bot_runner()
        return jsonify(runner.get_state())

    @app.route("/api/prices")
    def api_prices():
        runner = get_bot_runner()
        state = runner.get_state()
        return jsonify(state.get("prices", {}))

    @app.route("/api/bot/start", methods=["POST"])
    def api_bot_start():
        runner = get_bot_runner()
        if socketio is None:
            return jsonify({"ok": False, "error": "SocketIO not available"}), 500
        result = runner.start(socketio)
        if result and not result.get("ok"):
            return jsonify(result), 400
        return jsonify({"ok": True})

    @app.route("/api/bot/stop", methods=["POST"])
    def api_bot_stop():
        runner = get_bot_runner()
        runner.stop()
        return jsonify({"ok": True})

    @app.route("/api/strategies")
    def api_strategies():
        from quantbot.signals.registry import get_strategy_options
        runner = get_bot_runner()
        settings = runner.get_settings()
        current = settings.get("strategy_id", "multi_asset")
        return jsonify({"current": current, "options": get_strategy_options()})

    @app.route("/api/strategy", methods=["PATCH"])
    def api_strategy_patch():
        runner = get_bot_runner()
        try:
            data = request.get_json(force=True, silent=True) or {}
            strategy_id = data.get("strategy_id")
            if strategy_id is None:
                return jsonify({"ok": False, "error": "strategy_id required"}), 400
            runner.update_settings({"strategy_id": strategy_id})
            return jsonify({"ok": True, "strategy_id": strategy_id})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    @app.route("/api/symbols", methods=["POST"])
    def api_symbols_post():
        runner = get_bot_runner()
        try:
            data = request.get_json(force=True, silent=True) or {}
            action = data.get("action")
            symbol = (data.get("symbol") or "").strip().upper()
            if not symbol:
                return jsonify({"ok": False, "error": "symbol required"}), 400
            if action == "add":
                ok = runner.add_symbol(symbol)
                return jsonify({"ok": ok, "symbol": symbol, "message": "Added" if ok else "Already exists or failed"})
            if action == "remove":
                ok = runner.remove_symbol(symbol)
                return jsonify({"ok": ok, "symbol": symbol, "message": "Removed" if ok else "Not found or cannot remove last"})
            return jsonify({"ok": False, "error": "action must be add or remove"}), 400
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    @app.route("/api/timeframe", methods=["POST"])
    def api_timeframe():
        runner = get_bot_runner()
        try:
            data = request.get_json(force=True, silent=True) or {}
            interval = (data.get("interval") or "").strip().lower()
            if not interval:
                return jsonify({"ok": False, "error": "interval required"}), 400
            ok = runner.set_chart_interval(interval)
            if not ok:
                return jsonify({"ok": False, "error": f"Invalid interval: {interval}. Valid: 30m, 1h, 4h, 1d"}), 400
            bars = runner.fetch_chart_bars_immediate()
            return jsonify({"ok": True, "interval": interval, "bars": bars})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    @app.route("/api/feed", methods=["GET"])
    def api_feed_get():
        runner = get_bot_runner()
        return jsonify({
            "provider": runner.get_feed_provider(),
            "available": ["yahoo", "finnhub", "massive"],
        })

    @app.route("/api/feed", methods=["POST"])
    def api_feed_post():
        runner = get_bot_runner()
        try:
            data = request.get_json(force=True, silent=True) or {}
            provider = (data.get("provider") or "").strip().lower()
            if not provider:
                return jsonify({"ok": False, "error": "provider required"}), 400
            api_key = (data.get("api_key") or "").strip() or None
            runner.set_feed_provider(provider, api_key=api_key)
            bars = runner.fetch_chart_bars_immediate()
            return jsonify({
                "ok": True,
                "provider": runner.get_feed_provider(),
                "bars": bars,
            })
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    @app.route("/api/settings", methods=["GET"])
    def api_settings_get():
        runner = get_bot_runner()
        return jsonify(runner.get_settings())

    @app.route("/api/settings", methods=["POST"])
    def api_settings_post():
        runner = get_bot_runner()
        try:
            data = request.get_json(force=True, silent=True) or {}
            runner.update_settings(data)
            return jsonify({"ok": True, "settings": runner.get_settings()})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

    @app.route("/api/mode", methods=["GET"])
    def api_mode_get():
        runner = get_bot_runner()
        return jsonify({
            "mode": runner.get_mode(),
            "broker": runner.get_broker_config(),
            "running": runner._running,
        })

    @app.route("/api/mode", methods=["POST"])
    def api_mode_post():
        runner = get_bot_runner()
        try:
            data = request.get_json(force=True, silent=True) or {}
            mode = (data.get("mode") or "").strip().lower()
            broker_config = data.get("broker") or {}
            result = runner.set_mode(mode, broker_config)
            return jsonify(result), 200 if result.get("ok") else 400
        except Exception as exc:
            return jsonify({"ok": False, "message": str(exc)}), 400

    @app.route("/api/broker/test", methods=["POST"])
    def api_broker_test():
        try:
            data = request.get_json(force=True, silent=True) or {}
            from quantbot.webapp.bot_runner import BotRunner
            result = BotRunner.test_broker_connection(data)
            return jsonify(result), 200 if result.get("ok") else 400
        except Exception as exc:
            return jsonify({"ok": False, "message": str(exc)}), 500

    @app.route("/api/backtest/run", methods=["POST"])
    def api_backtest_run():
        if socketio is None:
            return jsonify({"ok": False, "error": "SocketIO not available"}), 500
        bt_runner = get_backtest_runner()
        if bt_runner.is_running():
            return jsonify({"ok": False, "error": "Backtest already running"}), 409
        try:
            data = request.get_json(force=True, silent=True) or {}
            from quantbot.webapp.backtest_runner import BacktestParams
            params = BacktestParams(
                symbol=str(data.get("symbol", "NQ")).strip().upper(),
                interval=str(data.get("interval", "15m")).strip(),
                period=str(data.get("period", "14d")).strip(),
                initial_equity=float(data.get("initial_equity", 100_000)),
                rsi_period=int(data.get("rsi_period", 14)),
                rsi_oversold=float(data.get("rsi_oversold", 30.0)),
                rsi_overbought=float(data.get("rsi_overbought", 70.0)),
                z_long_threshold=float(data.get("z_long_threshold", -2.0)),
                z_short_threshold=float(data.get("z_short_threshold", 2.0)),
                bb_period=int(data.get("bb_period", 20)),
                bb_std=float(data.get("bb_std", 2.0)),
                atr_period=int(data.get("atr_period", 14)),
                profit_atr_mult=float(data.get("profit_atr_mult", 1.5)),
                stop_atr_mult=float(data.get("stop_atr_mult", 1.0)),
                max_hold_minutes=int(data.get("max_hold_minutes", 30)),
                volume_filter=bool(data.get("volume_filter", True)),
            )
            result = bt_runner.start(params, socketio)
            status_code = 200 if result.get("ok") else 400
            return jsonify(result), status_code
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400

    @app.route("/api/backtest/status", methods=["GET"])
    def api_backtest_status():
        bt_runner = get_backtest_runner()
        return jsonify(bt_runner.get_status())

    if socketio is not None:

        @socketio.on("connect")
        def on_connect():
            pass

        @socketio.on("disconnect")
        def on_disconnect():
            pass

    app._socketio = socketio
    return app


def main() -> None:
    import argparse
    p = argparse.ArgumentParser(description="RocketBot dashboard server")
    p.add_argument("--port", type=int, default=8080, help="Dashboard port")
    p.add_argument("--metrics-port", type=int, default=9090, help="Prometheus metrics port")
    p.add_argument("--no-browser", action="store_true", help="Do not open browser")
    args = p.parse_args()

    if not HAS_FLASK:
        print("Install Flask: pip install flask")
        sys.exit(1)
    if not HAS_SOCKETIO:
        print("Install Flask-SocketIO: pip install flask-socketio")
        sys.exit(1)

    os.environ.setdefault("QUANTBOT_TELEMETRY", "1")
    try:
        from quantbot.utils.telemetry import init_telemetry
        if init_telemetry(args.metrics_port):
            print(f"Metrics: http://localhost:{args.metrics_port}/metrics")
    except Exception:
        pass

    app = create_app()
    socketio = getattr(app, "_socketio", None)
    url = f"http://127.0.0.1:{args.port}"
    if not args.no_browser:
        webbrowser.open(url)
    print(f"Dashboard: {url}")
    if socketio is not None:
        socketio.run(app, host="0.0.0.0", port=args.port, debug=False, allow_unsafe_werkzeug=True)
    else:
        app.run(host="0.0.0.0", port=args.port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
