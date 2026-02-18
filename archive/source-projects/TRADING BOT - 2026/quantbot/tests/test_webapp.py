"""Tests for webapp: YahooFeed, PaperBroker, BotRunner state."""
from __future__ import annotations

import pytest

from quantbot.data.yahoo_feed import YahooFeed, YAHOO_SYMBOL_MAP
from quantbot.webapp.paper_broker import PaperBroker
from quantbot.webapp.bot_runner import BotRunner


def test_yahoo_symbol_map() -> None:
    assert YAHOO_SYMBOL_MAP["NQ"] == "NQ=F"
    assert YAHOO_SYMBOL_MAP["ES"] == "ES=F"
    assert YAHOO_SYMBOL_MAP["EURUSD"] == "EURUSD=X"
    assert YAHOO_SYMBOL_MAP["GBPUSD"] == "GBPUSD=X"


def test_yahoo_feed_fetch_ohlcv() -> None:
    feed = YahooFeed()
    try:
        df = feed.fetch_ohlcv("NQ", interval="1h", period="5d")
    except Exception as e:
        pytest.skip(f"yfinance fetch failed (network): {e}")
    if df.empty:
        pytest.skip("yfinance returned no data (market closed or symbol unavailable)")
    for col in ["open", "high", "low", "close", "volume"]:
        assert col in df.columns


def test_yahoo_feed_fetch_all_prices() -> None:
    feed = YahooFeed()
    prices = feed.fetch_all_prices(["NQ", "ES"])
    assert "NQ" in prices
    assert "ES" in prices
    assert isinstance(prices["NQ"], (int, float))


def test_paper_broker_open_close() -> None:
    broker = PaperBroker(initial_equity=100_000.0)
    assert broker.get_equity() == 100_000.0
    broker.open_position("NQ", "long", 20_000.0, 1.0, 100.0)
    positions = broker.get_open_positions({"NQ": 20_100.0})
    assert len(positions) == 1
    assert positions[0]["symbol"] == "NQ"
    assert positions[0]["side"] == "long"
    assert positions[0]["entry_price"] != 20_000.0  # slippage applied
    pnl = broker.close_position("NQ", 20_050.0)
    assert pnl is not None
    assert broker.get_equity() == 100_000.0 + pnl
    assert len(broker.get_open_positions()) == 0
    history = broker.get_trade_history()
    assert len(history) == 1
    assert history[0]["symbol"] == "NQ"
    assert history[0]["pnl"] == pnl


def test_paper_broker_get_positions_for_context() -> None:
    broker = PaperBroker(initial_equity=50_000.0)
    broker.open_position("ES", "short", 5500.0, 1.0, 25.0)
    ctx = broker.get_positions_for_context()
    assert "ES" in ctx
    assert ctx["ES"]["entry_price"] != 5500.0
    assert ctx["ES"]["side"] == "short"
    assert ctx["ES"]["atr_at_entry"] == 25.0


def test_bot_runner_get_state() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ", "ES"])
    state = runner.get_state()
    assert "running" in state
    assert state["running"] is False
    assert state["symbols"] == ["NQ", "ES"]
    assert "positions" in state
    assert "trades" in state
    assert "equity" in state
    assert "bars" in state
    assert "activity_log" in state
    assert state["positions"] == []
    assert state["trades"] == []
    assert all(s in state["bars"] for s in state["symbols"])


def test_bot_runner_state_includes_market_overview() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ", "ES"])
    state = runner.get_state()
    assert "market_overview" in state
    assert isinstance(state["market_overview"], list)
    assert len(state["market_overview"]) == 2
    for item in state["market_overview"]:
        assert "symbol" in item
        assert "price" in item
        assert "change_pct" in item


def test_bot_runner_state_no_orderbook() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ", "ES"])
    state = runner.get_state()
    assert "orderbook" not in state


def test_bot_runner_state_has_chart_interval() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ"])
    state = runner.get_state()
    assert "chart_interval" in state
    assert state["chart_interval"] == "1h"


def test_bot_runner_set_timeframe_updates_state() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ"])
    runner.set_chart_interval("1d")
    state = runner.get_state()
    assert state["chart_interval"] == "1d"


def _create_test_app():
    """Create a Flask test app for integration testing."""
    from quantbot.server import create_app, _bot_runner
    import quantbot.server as server_mod
    server_mod._bot_runner = None
    app = create_app()
    app.config["TESTING"] = True
    return app


def test_api_timeframe_endpoint_valid() -> None:
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.post(
            "/api/timeframe",
            json={"interval": "1d"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["interval"] == "1d"
        assert "bars" in data


def test_api_timeframe_endpoint_invalid() -> None:
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.post(
            "/api/timeframe",
            json={"interval": "bad"},
            content_type="application/json",
        )
        assert resp.status_code == 400
        data = resp.get_json()
        assert data["ok"] is False


def test_api_timeframe_endpoint_missing() -> None:
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.post(
            "/api/timeframe",
            json={},
            content_type="application/json",
        )
        assert resp.status_code == 400


def test_api_state_includes_market_overview() -> None:
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.get("/api/state")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "market_overview" in data
        assert isinstance(data["market_overview"], list)


def test_api_state_no_orderbook() -> None:
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.get("/api/state")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "orderbook" not in data


def test_bot_runner_get_mode_default() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ"])
    assert runner.get_mode() == "paper"


def test_bot_runner_state_includes_mode() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ"])
    state = runner.get_state()
    assert "mode" in state
    assert state["mode"] == "paper"


def test_bot_runner_set_mode_invalid() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ"])
    result = runner.set_mode("invalid_mode")
    assert result["ok"] is False
    assert "Invalid mode" in result["message"]


def test_bot_runner_set_mode_live_no_config() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ"])
    result = runner.set_mode("live")
    assert result["ok"] is False
    assert "Broker configuration required" in result["message"]


def test_bot_runner_set_mode_paper_from_paper() -> None:
    runner = BotRunner(initial_equity=75_000.0, symbols=["NQ"])
    result = runner.set_mode("paper")
    assert result["ok"] is True
    assert result["mode"] == "paper"
    assert runner.get_mode() == "paper"


def test_api_mode_get_default() -> None:
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.get("/api/mode")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["mode"] == "paper"
        assert isinstance(data["broker"], dict)


def test_api_mode_post_paper() -> None:
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.post(
            "/api/mode",
            json={"mode": "paper"},
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["mode"] == "paper"


def test_api_mode_post_invalid() -> None:
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.post(
            "/api/mode",
            json={"mode": "invalid"},
            content_type="application/json",
        )
        assert resp.status_code == 400
        data = resp.get_json()
        assert data["ok"] is False


def test_api_broker_test_no_gateway() -> None:
    """Test that broker test returns a clear error when IB Gateway is not running."""
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.post(
            "/api/broker/test",
            json={"ib_host": "127.0.0.1", "ib_port": 7497, "ib_client_id": 99},
            content_type="application/json",
        )
        data = resp.get_json()
        assert data["ok"] is False
        assert len(data["message"]) > 0


def test_api_state_includes_mode() -> None:
    app = _create_test_app()
    with app.test_client() as client:
        resp = client.get("/api/state")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "mode" in data
        assert data["mode"] == "paper"
