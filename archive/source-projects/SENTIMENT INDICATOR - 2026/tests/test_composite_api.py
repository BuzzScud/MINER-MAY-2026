"""Smoke tests for composite API. Override get_db to avoid real DB."""
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db


def _mock_db_session():
    session = MagicMock()
    session.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
    session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
    session.query.return_value.order_by.return_value.first.return_value = None
    session.query.return_value.order_by.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
    return session


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = _mock_db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_composite_current_returns_200_and_valid_json(client):
    r = client.get("/api/composite/current")
    assert r.status_code == 200
    data = r.json()
    assert "composite" in data
    assert "timestamp" in data
    assert "indices" in data
    assert "composite_components" in data
    assert isinstance(data["indices"], dict)


def test_composite_history_returns_200_and_valid_json(client):
    r = client.get("/api/composite/history", params={"limit": 5})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
