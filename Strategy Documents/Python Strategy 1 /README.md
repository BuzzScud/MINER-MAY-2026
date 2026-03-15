# AlpacaPaperTrader

Paper-only trading bot with a dark CustomTkinter GUI, Alpaca broker, and a pluggable strategy hook for your custom math (e.g. Crystalline/Babylonian indicators).

## Requirements

- Python 3.11+
- Dependencies: `alpaca-py`, `customtkinter`, `python-dotenv`, `pandas` (see `requirements.txt`)

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and set your Alpaca **paper** API keys:
   ```bash
   cp .env.example .env
   ```
   Get keys from [Alpaca Paper Dashboard](https://app.alpaca.markets/paper/dashboard). Never commit `.env`.  
   API reference: [Alpaca API Docs](https://docs.alpaca.markets) (Market Data API, Trading API, [Issue tokens](https://docs.alpaca.markets/reference/issuetokens) for OAuth).

3. Run the app:
   ```bash
   python main.py
   ```
   On startup the bot verifies the Alpaca connection; if keys are invalid or network fails, it exits with a clear error. Once the app window opens, the bot is ready: add symbols and click **Start**.

## Usage

- **Start**: Add at least one symbol via the symbol manager (search, then "Add selected to watch"), then click **Start** to begin paper trading and live bar streaming.
- **Stop**: Click **Stop**. Optionally check "Flatten on stop" to close all positions when stopping.
- **PNL / Positions / Orders**: Updated every second and when orders change.
- **Activity log**: Shows buys (green), sells (red), and info (blue). Logs are also written to `logs/bot.log`.

### Restarting the bot

There is no separate server process; the bot is the application (GUI or headless). To restart:

1. **Stop**: In GUI mode, click **Stop** and close the window; in headless mode, press Ctrl+C in the terminal.
2. **Start**: From the `alpaca_paper_trader` directory run `python main.py`, or from the repo root run `python -m alpaca_paper_trader.main`. If you use a virtualenv, activate it first (e.g. `.venv/bin/activate`).

## Adding custom math

1. Add a module under `custom_math/` (e.g. `indicators.py`).
2. Implement a function with this signature:
   ```python
   def your_signal_function(symbol: str, bar_data, broker) -> str:
       # bar_data has: symbol, open, high, low, close, volume, timestamp
       # Return "buy", "sell", or "hold"
       return "hold"
   ```
3. In `custom_math/__init__.py`, export it:
   ```python
   from custom_math.indicators import your_signal_function
   ```
4. The strategy in `strategy.py` will call this on every new bar. If the module or function is missing, the bot runs with no signals (hold only).

**Market Data (Alpaca API):** The bot uses Alpaca’s [Market Data API](https://docs.alpaca.markets/docs/getting-started-with-alpaca-market-data): **stocks** (StockDataStream live bars), **crypto** (CryptoDataStream when available; symbols like `BTC/USD`, `ETH/USD`), and **forex**-style pairs (e.g. `EUR/USD`, `GBP/USD` via crypto stream where supported). Add symbols in the UI (e.g. `AAPL`, `BTC/USD` or `BTCUSD`); the broker classifies each symbol and subscribes to the correct stream.

This bot uses **Custom Math** (Crystalline/Babylonian thesis): clock-lattice mapping, statistics, half-series trend, risk ratio, ring distribution, and Crystalline score. **Decision windows:** signals run 5 minutes before and 5 minutes after the 20- and 50-minute marks each hour (minutes 15, 20, 25, 45, 50, 55). Asset-agnostic: stocks, crypto, and forex-style pairs.

## Development / IDE

- **customtkinter import and the type checker:** `ui.py` uses `# pyright: ignore[reportMissingImports]` on the `customtkinter` import because the type checker (e.g. basedpyright) may use a different Python than the project venv, so the import can appear unresolved even though the app runs. To resolve the import in the IDE instead, select the project’s `.venv` as the Python interpreter (e.g. `alpaca_paper_trader/.venv/bin/python`) and run `pip install -r requirements.txt` in that environment.

## Warnings

- **Paper only**: This project is configured for paper trading by default. Do not switch to live trading without reviewing and changing the broker configuration and understanding the risks.
- **No financial advice**: This software is for educational and development use. Always consult a financial advisor before making investment decisions.
- **API keys**: Keep your `.env` file secret and never commit it to version control.
