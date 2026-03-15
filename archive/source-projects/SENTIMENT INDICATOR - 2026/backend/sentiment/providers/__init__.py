"""On-demand sentiment providers: Massive, Finnhub, Alpha Vantage, Yahoo Finance. Return RawSignal-compatible lists."""
from backend.sentiment.gatherers import RawSignal

VALID_PROVIDERS = ("massive", "finnhub", "alphavantage", "yfinance")


def fetch_raw_signals(provider: str, symbol: str) -> list[RawSignal]:
    """
    Fetch raw signals for the given symbol from the specified provider.
    Raises ValueError if provider is invalid or API key is missing.
    Raises RuntimeError on rate limit (429) or HTTP errors with message for the client.
    """
    symbol_upper = symbol.strip().upper()
    if not symbol_upper:
        raise ValueError("Symbol is required")
    if provider not in VALID_PROVIDERS:
        raise ValueError(f"Invalid provider: {provider}")

    if provider == "massive":
        from backend.sentiment.providers.massive import fetch_massive
        return fetch_massive(symbol_upper)
    if provider == "finnhub":
        from backend.sentiment.providers.finnhub import fetch_finnhub
        return fetch_finnhub(symbol_upper)
    if provider == "alphavantage":
        from backend.sentiment.providers.alphavantage import fetch_alphavantage
        return fetch_alphavantage(symbol_upper)
    if provider == "yfinance":
        from backend.sentiment.providers.yfinance import fetch_yfinance
        return fetch_yfinance(symbol_upper)
    raise ValueError(f"Unknown provider: {provider}")
