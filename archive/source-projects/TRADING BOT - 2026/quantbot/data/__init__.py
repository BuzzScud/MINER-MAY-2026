"""Data layer: feed, historical, storage.

Pipeline (single path, no parallel implementations):
  Market Data Feed (YahooFeed/FinnhubFeed/MassiveFeed/BarchartFeed)
    → fetch_all_ohlcv(); each feed normalizes to standard OHLCV.
  Data processing: in feed (normalize), in bot_runner (_resample_ohlcv, _build_chart_bars).
  Storage: in-memory caches (_ohlcv_cache, _chart_ohlcv_cache, _prices); optional storage.write_ohlcv.
  Backtest uses the same feed path: YahooFeed().fetch_all_ohlcv() via backtest_runner / run_backtest_nq.
"""
