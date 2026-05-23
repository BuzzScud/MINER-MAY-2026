"""Fetchers for pre-computed indices, derivatives, funding, and news. Each returns (source, value, timestamp) or None."""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def _norm_0_100_to_neg1_1(value: float) -> float:
    """Map 0-100 to -1 (fear) to +1 (greed)."""
    return max(-1.0, min(1.0, (value / 50.0) - 1.0))


def fetch_crypto_fear_greed() -> tuple[str, float, datetime] | None:
    """Crypto Fear & Greed from alternative.me. Value 0-100 -> normalize to -1..1."""
    try:
        import requests
        r = requests.get(
            "https://api.alternative.me/fng/?limit=1",
            timeout=10,
            headers={"Accept": "application/json"},
        )
        r.raise_for_status()
        data = r.json()
        items = data.get("data") or []
        if not items:
            return None
        item = items[0]
        raw = int(item.get("value", 50))
        ts = int(item.get("timestamp", 0))
        dt = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else datetime.now(timezone.utc)
        return ("crypto_fear_greed", _norm_0_100_to_neg1_1(float(raw)), dt)
    except Exception as e:
        logger.warning("Crypto Fear & Greed fetch failed: %s", e)
        return None


def fetch_cnn_fear_greed(crypto_fallback: float | None = None) -> tuple[str, float, datetime] | None:
    """CNN Fear & Greed. Uses public dataviz endpoint; on failure uses crypto F&G value when provided."""
    try:
        import requests
        r = requests.get(
            "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
            timeout=10,
            headers={"Accept": "application/json"},
        )
        if r.status_code == 418:
            logger.debug("CNN Fear & Greed endpoint returned 418 (unavailable).")
            if crypto_fallback is not None:
                now = datetime.now(timezone.utc)
                return ("cnn_fear_greed", max(-1.0, min(1.0, crypto_fallback)), now)
            return None
        r.raise_for_status()
        data = r.json()
        score = None
        if isinstance(data, dict):
            fg = data.get("fear_and_greed") or data.get("score")
            if isinstance(fg, dict):
                score = fg.get("score") or fg.get("value")
            elif isinstance(fg, (int, float)):
                score = fg
        if score is None and isinstance(data, list) and len(data) > 0:
            score = data[-1].get("score") or data[-1].get("value") if isinstance(data[-1], dict) else None
        if score is not None:
            now = datetime.now(timezone.utc)
            return ("cnn_fear_greed", _norm_0_100_to_neg1_1(float(score)), now)
    except Exception as e:
        logger.warning("CNN Fear & Greed fetch failed: %s", e)
    if crypto_fallback is not None:
        now = datetime.now(timezone.utc)
        return ("cnn_fear_greed", max(-1.0, min(1.0, crypto_fallback)), now)
    return None


def fetch_vix() -> tuple[str, float, datetime] | None:
    """VIX from yfinance. Raw VIX 10-80 -> normalize to 0-1 fear scale then to -1..1 (high VIX = fear = negative)."""
    try:
        from backend.sentiment.providers.rate_limit import record_call, wait_if_needed
        wait_if_needed("yfinance")
        import yfinance as yf
        ticker = yf.Ticker("^VIX")
        hist = ticker.history(period="1d")
        if hist is None or hist.empty:
            return None
        last = hist["Close"].iloc[-1]
        vix = float(last)
        # VIX ~10-20 low fear, 20-30 moderate, 30+ fear. Map so high VIX -> -1
        norm = max(-1.0, min(1.0, -((vix - 10) / 35)))  # 10->0, 45->-1
        now = datetime.now(timezone.utc)
        record_call("yfinance")
        return ("vix", norm, now)
    except Exception as e:
        logger.warning("VIX fetch failed: %s", e)
    return None


def _funding_rate_from_exchange(exchange_name: str, exchange_factory) -> tuple[str, float, datetime] | None:
    """Try to get BTC funding rate from one exchange. Returns (source, value, ts) or None."""
    try:
        exchange = exchange_factory({"enableRateLimit": True})
        ticker = exchange.fetch_funding_rate("BTC/USDT:USDT")
        rate = ticker.get("fundingRate")
        if rate is None:
            return None
        norm = max(-1.0, min(1.0, float(rate) * 100))
        return ("funding_rate_btc", norm, datetime.now(timezone.utc))
    except Exception as e:
        logger.debug("%s funding rate: %s", exchange_name, e)
        return None


def _funding_rate_binance_rest() -> tuple[str, float, datetime] | None:
    """Direct REST call to Binance public funding rate (no ccxt)."""
    try:
        import requests
        r = requests.get(
            "https://fapi.binance.com/fapi/v1/premiumIndex",
            params={"symbol": "BTCUSDT"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        rate = data.get("lastFundingRate")
        if rate is None:
            return None
        norm = max(-1.0, min(1.0, float(rate) * 100))
        return ("funding_rate_btc", norm, datetime.now(timezone.utc))
    except Exception as e:
        logger.debug("Binance REST funding rate: %s", e)
        return None


def fetch_funding_rate_btc() -> tuple[str, float, datetime] | None:
    """BTC perpetual funding rate. Tries ccxt (Binance, Bybit, Kraken, OKX) then Binance REST."""
    try:
        import ccxt
    except ImportError:
        logger.debug("ccxt not installed; using Binance REST only for funding rate.")
        out = _funding_rate_binance_rest()
        return out
    for name, factory in [
        ("Binance", ccxt.binance),
        ("Bybit", ccxt.bybit),
        ("Kraken", ccxt.kraken),
        ("OKX", ccxt.okx),
    ]:
        out = _funding_rate_from_exchange(name, factory)
        if out is not None:
            return out
    out = _funding_rate_binance_rest()
    if out is not None:
        return out
    logger.warning("Funding rate BTC: all sources failed")
    return None


def fetch_put_call_ratio() -> tuple[str, float, datetime] | None:
    """Put/call ratio from SPY options via yfinance. High ratio = fear -> negative."""
    try:
        from backend.sentiment.providers.rate_limit import record_call, wait_if_needed
        wait_if_needed("yfinance")
        import yfinance as yf
        ticker = yf.Ticker("SPY")
        expirations = ticker.options
        if not expirations:
            return None
        chain = ticker.option_chain(expirations[0])
        puts_oi = chain.puts["openInterest"].sum() if "openInterest" in chain.puts.columns else 0
        calls_oi = chain.calls["openInterest"].sum() if "openInterest" in chain.calls.columns else 0
        if calls_oi <= 0:
            return None
        ratio = float(puts_oi) / float(calls_oi)
        # High ratio = fear = negative. Map ratio ~0.5-2.0 to 1..-1
        norm = max(-1.0, min(1.0, (1.25 - ratio) / 0.75))
        now = datetime.now(timezone.utc)
        record_call("yfinance")
        return ("put_call_ratio", norm, now)
    except Exception as e:
        logger.warning("Put/call fetch failed: %s", e)
        return None


def fetch_google_trends_btc() -> tuple[str, float, datetime] | None:
    """Google Trends interest for Bitcoin (0-100 scale). Normalize to -1..1."""
    try:
        from pytrends.request import TrendReq
    except ImportError:
        logger.debug("pytrends not installed; Google Trends BTC unavailable. Run: pip install -r backend/requirements.txt")
        return None
    try:
        pytrends = TrendReq(hl="en-US", tz=360)
        pytrends.build_payload(["Bitcoin"], timeframe="now 7-d")
        df = pytrends.interest_over_time()
        if df is None or df.empty or "Bitcoin" not in df.columns:
            return None
        latest = float(df["Bitcoin"].iloc[-1])
        norm = _norm_0_100_to_neg1_1(latest)
        return ("google_trends_btc", norm, datetime.now(timezone.utc))
    except Exception as e:
        logger.warning("Google Trends BTC fetch failed: %s", e)
        return None


def fetch_on_chain_volume() -> tuple[str, float, datetime] | None:
    """BTC on-chain metric from blockchain.info stats (n_tx). Normalize to -1..1."""
    try:
        import math
        import requests
        r = requests.get(
            "https://api.blockchain.info/stats",
            timeout=10,
            headers={"Accept": "application/json"},
        )
        r.raise_for_status()
        data = r.json()
        n_tx = data.get("n_tx")
        if n_tx is None:
            return None
        vol = float(n_tx)
        log_vol = math.log1p(vol)
        norm = max(-1.0, min(1.0, (log_vol - 10.3) / 2.0))
        return ("on_chain_volume", norm, datetime.now(timezone.utc))
    except Exception as e:
        logger.warning("On-chain volume fetch failed: %s", e)
        return None


def fetch_aaii() -> tuple[str, float, datetime] | None:
    """AAII sentiment. Stub: return neutral until RSS/source is wired."""
    try:
        now = datetime.now(timezone.utc)
        return ("aaii_sentiment", 0.0, now)
    except Exception as e:
        logger.warning("AAII fetch failed: %s", e)
    return None


def fetch_news_polarity_from_db(db: Any) -> tuple[str, float, datetime] | None:
    """Derive news/text polarity from latest aggregates (average score). Returns source, value, timestamp."""
    try:
        from sqlalchemy import desc
        from backend.sentiment.models import Aggregate
        row = (
            db.query(Aggregate)
            .order_by(desc(Aggregate.window_end))
            .limit(100)
            .all()
        )
        if not row:
            return None
        avg = sum(r.aggregated_score for r in row) / len(row)
        latest_ts = row[0].window_end
        return ("news_polarity", max(-1.0, min(1.0, avg)), latest_ts)
    except Exception as e:
        logger.warning("News polarity from DB failed: %s", e)
    return None


def run_all_fetchers(db_session: Any) -> None:
    """Run all fetchers and persist to IndexSnapshot. Does not commit."""
    from backend.composite.models import IndexSnapshot
    results: list[tuple[str, float, datetime]] = []

    try:
        out = fetch_crypto_fear_greed()
        if out:
            results.append(out)
        crypto_val = out[1] if out and out[0] == "crypto_fear_greed" else None
    except Exception as e:
        logger.warning("Crypto Fear & Greed fetcher failed: %s", e)
        crypto_val = None

    try:
        out = fetch_cnn_fear_greed(crypto_fallback=crypto_val)
        if out:
            results.append(out)
    except Exception as e:
        logger.warning("CNN Fear & Greed fetcher failed: %s", e)

    for fetcher in [
        fetch_vix,
        fetch_funding_rate_btc,
        fetch_put_call_ratio,
        fetch_aaii,
        fetch_google_trends_btc,
        fetch_on_chain_volume,
    ]:
        try:
            out = fetcher()
            if out:
                results.append(out)
        except Exception as e:
            logger.warning("Fetcher %s failed: %s", fetcher.__name__, e)

    try:
        np = fetch_news_polarity_from_db(db_session)
        if np:
            results.append(np)
    except Exception as e:
        logger.warning("News polarity fetcher failed: %s", e)

    for source, value, ts in results:
        snap = IndexSnapshot(source=source, value=value, timestamp=ts)
        db_session.add(snap)
