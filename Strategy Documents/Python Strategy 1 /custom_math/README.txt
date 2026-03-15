Put your proprietary math files here (e.g. indicators.py).
Export a function such as your_signal_function(symbol, bar_data, broker) returning 'buy' | 'sell' | 'hold'.
Then in custom_math/__init__.py add: from custom_math.your_module import your_signal_function
