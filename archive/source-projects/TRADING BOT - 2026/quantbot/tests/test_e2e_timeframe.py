"""End-to-end tests: Flask test client + SocketIO test client.

Verifies timeframe switching, market overview, and socket events work together.
"""
from __future__ import annotations

import pytest

try:
    from flask_socketio import SocketIOTestClient
    HAS_SOCKETIO_TEST = True
except ImportError:
    HAS_SOCKETIO_TEST = False


def _create_app_and_socketio():
    """Create app and socketio for testing."""
    import quantbot.server as server_mod
    server_mod._bot_runner = None
    app = server_mod.create_app()
    app.config["TESTING"] = True
    socketio = getattr(app, "_socketio", None)
    return app, socketio


@pytest.fixture
def flask_client():
    app, _ = _create_app_and_socketio()
    with app.test_client() as client:
        yield client


@pytest.fixture
def socketio_client():
    if not HAS_SOCKETIO_TEST:
        pytest.skip("flask_socketio test client not available")
    app, socketio = _create_app_and_socketio()
    if socketio is None:
        pytest.skip("SocketIO not configured")
    client = socketio.test_client(app)
    yield client
    client.disconnect()


def test_health_endpoint(flask_client) -> None:
    resp = flask_client.get("/health")
    assert resp.status_code == 200


def test_state_endpoint_structure(flask_client) -> None:
    resp = flask_client.get("/api/state")
    assert resp.status_code == 200
    data = resp.get_json()
    required_keys = [
        "running", "symbols", "prices", "positions", "trades",
        "equity", "bars", "activity_log", "session_info",
        "market_overview", "chart_interval",
    ]
    for key in required_keys:
        assert key in data, f"Missing key: {key}"
    assert "orderbook" not in data


def test_timeframe_switch_roundtrip(flask_client) -> None:
    """Switch timeframe via API, then verify state reflects the new interval."""
    resp = flask_client.post(
        "/api/timeframe",
        json={"interval": "30m"},
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["interval"] == "30m"

    state_resp = flask_client.get("/api/state")
    state = state_resp.get_json()
    assert state["chart_interval"] == "30m"


def test_timeframe_all_valid_intervals(flask_client) -> None:
    """All four valid timeframes return 200 OK."""
    for tf in ["30m", "1h", "4h", "1d"]:
        resp = flask_client.post(
            "/api/timeframe",
            json={"interval": tf},
            content_type="application/json",
        )
        assert resp.status_code == 200, f"Failed for {tf}"
        data = resp.get_json()
        assert data["ok"] is True
        assert data["interval"] == tf


def test_timeframe_bars_in_response(flask_client) -> None:
    """Timeframe response includes bars dict keyed by symbol."""
    resp = flask_client.post(
        "/api/timeframe",
        json={"interval": "1h"},
        content_type="application/json",
    )
    data = resp.get_json()
    assert "bars" in data
    assert isinstance(data["bars"], dict)


def test_market_overview_in_state(flask_client) -> None:
    """State includes market_overview with correct structure."""
    resp = flask_client.get("/api/state")
    data = resp.get_json()
    overview = data["market_overview"]
    assert isinstance(overview, list)
    for item in overview:
        assert "symbol" in item
        assert "price" in item
        assert "change_pct" in item
        assert "day_high" in item
        assert "day_low" in item
        assert "volume" in item


def test_bot_start_stop(flask_client) -> None:
    """Bot can be started and stopped via API."""
    resp = flask_client.post("/api/bot/start")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True

    state = flask_client.get("/api/state").get_json()
    assert state["running"] is True

    resp = flask_client.post("/api/bot/stop")
    assert resp.status_code == 200

    state = flask_client.get("/api/state").get_json()
    assert state["running"] is False


def test_socketio_connect(socketio_client) -> None:
    """SocketIO client can connect."""
    assert socketio_client.is_connected()


def test_socketio_receives_events_after_bot_start(socketio_client) -> None:
    """After starting the bot, socket events should be emitted."""
    app, socketio = _create_app_and_socketio()
    if socketio is None:
        pytest.skip("SocketIO not configured")

    with app.test_client() as http_client:
        sio_client = socketio.test_client(app)
        try:
            resp = http_client.post("/api/bot/start")
            assert resp.status_code == 200

            import time
            time.sleep(2)

            received = sio_client.get_received()
            event_names = [r["name"] for r in received]
            assert "log_update" in event_names or len(received) > 0

            http_client.post("/api/bot/stop")
            time.sleep(1)
        finally:
            sio_client.disconnect()


def test_prices_endpoint(flask_client) -> None:
    """GET /api/prices returns a dict."""
    resp = flask_client.get("/api/prices")
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, dict)


def test_strategies_endpoint(flask_client) -> None:
    """GET /api/strategies returns current and options."""
    resp = flask_client.get("/api/strategies")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "current" in data
    assert "options" in data
