"""Tests for composite fetchers. Use mocks to avoid network calls."""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from backend.composite.fetchers import (
    _norm_0_100_to_neg1_1,
    fetch_aaii,
    fetch_cnn_fear_greed,
    fetch_crypto_fear_greed,
    fetch_funding_rate_btc,
    fetch_on_chain_volume,
    fetch_put_call_ratio,
    fetch_vix,
    _funding_rate_binance_rest,
)


def test_norm_0_100_to_neg1_1():
    assert _norm_0_100_to_neg1_1(0) == -1.0
    assert _norm_0_100_to_neg1_1(50) == 0.0
    assert _norm_0_100_to_neg1_1(100) == 1.0
    assert -1.0 <= _norm_0_100_to_neg1_1(25) <= 1.0
    assert -1.0 <= _norm_0_100_to_neg1_1(75) <= 1.0


def test_fetch_crypto_fear_greed_success():
    with patch("requests.get") as mget:
        mget.return_value.json.return_value = {
            "data": [{"value": "50", "timestamp": 1700000000}],
        }
        mget.return_value.raise_for_status = MagicMock()
        out = fetch_crypto_fear_greed()
    assert out is not None
    source, value, ts = out
    assert source == "crypto_fear_greed"
    assert -1.0 <= value <= 1.0
    assert isinstance(ts, datetime)


def test_fetch_cnn_fear_greed_fallback():
    out = fetch_cnn_fear_greed(crypto_fallback=-0.5)
    assert out is not None
    source, value, ts = out
    assert source == "cnn_fear_greed"
    assert value == -0.5
    assert isinstance(ts, datetime)


def test_fetch_cnn_fear_greed_no_fallback_returns_none():
    with patch("requests.get") as mget:
        mget.side_effect = Exception("fail")
        out = fetch_cnn_fear_greed(crypto_fallback=None)
    assert out is None


def test_fetch_vix_returns_none_on_failure():
    with patch("yfinance.Ticker") as T:
        T.return_value.history.return_value = None
        out = fetch_vix()
    assert out is None


def test_fetch_vix_success_mocked():
    with patch("yfinance.Ticker") as T:
        close_series = MagicMock()
        close_series.iloc.__getitem__.return_value = 15.0
        hist = MagicMock()
        hist.empty = False
        hist.__getitem__.return_value = close_series
        T.return_value.history.return_value = hist
        out = fetch_vix()
    assert out is not None
    source, value, ts = out
    assert source == "vix"
    assert -1.0 <= value <= 1.0


def test_funding_rate_binance_rest_success():
    with patch("requests.get") as mget:
        mget.return_value.json.return_value = {"lastFundingRate": "0.0001"}
        mget.return_value.raise_for_status = MagicMock()
        out = _funding_rate_binance_rest()
    assert out is not None
    source, value, ts = out
    assert source == "funding_rate_btc"
    assert -1.0 <= value <= 1.0


def test_fetch_put_call_ratio_mocked():
    with patch("yfinance.Ticker") as T:
        chain = MagicMock()
        chain.puts.columns = ["openInterest"]
        chain.puts.__getitem__.return_value.sum.return_value = 100
        chain.calls.columns = ["openInterest"]
        chain.calls.__getitem__.return_value.sum.return_value = 100
        ticker = MagicMock()
        ticker.options = ["2024-01-19"]
        ticker.option_chain.return_value = chain
        T.return_value = ticker
        out = fetch_put_call_ratio()
    assert out is not None
    source, value, ts = out
    assert source == "put_call_ratio"
    assert -1.0 <= value <= 1.0


def test_fetch_on_chain_volume_success():
    with patch("requests.get") as mget:
        mget.return_value.json.return_value = {"n_tx": 300000}
        mget.return_value.raise_for_status = MagicMock()
        out = fetch_on_chain_volume()
    assert out is not None
    source, value, ts = out
    assert source == "on_chain_volume"
    assert -1.0 <= value <= 1.0


def test_fetch_aaii_returns_stub():
    out = fetch_aaii()
    assert out is not None
    source, value, ts = out
    assert source == "aaii_sentiment"
    assert value == 0.0
    assert isinstance(ts, datetime)
