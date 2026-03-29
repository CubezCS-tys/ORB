"""Random/stochastic candlestick generator for testing ORB strategy."""

import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict


def generate_random_candles(
    num_minutes: int = 390,
    start_price: float = 18000.0,
    volatility: float = 0.001,
    start_time: datetime | None = None,
) -> List[Dict]:
    """
    Generate random 1-minute OHLCV candlesticks using geometric Brownian motion.

    Args:
        num_minutes: Number of 1-min candles to generate (390 = full trading day 9:30-16:00).
        start_price: Starting price level.
        volatility: Per-minute volatility (std dev of returns).
        start_time: Starting timestamp. Defaults to today at 9:30 AM ET.

    Returns:
        List of candle dicts with keys: time, open, high, low, close, volume.
    """
    if start_time is None:
        today = datetime.now().replace(hour=9, minute=30, second=0, microsecond=0)
        start_time = today

    candles = []
    price = start_price

    for i in range(num_minutes):
        timestamp = start_time + timedelta(minutes=i)

        # Generate intra-candle price path (10 ticks per minute)
        ticks = 10
        returns = np.random.normal(0, volatility / np.sqrt(ticks), ticks)
        tick_prices = [price]
        for r in returns:
            tick_prices.append(tick_prices[-1] * (1 + r))

        open_price = tick_prices[0]
        close_price = tick_prices[-1]
        high_price = max(tick_prices)
        low_price = min(tick_prices)
        volume = int(np.random.exponential(500) + 50)

        # Round to NQ tick size (0.25)
        open_price = round(open_price / 0.25) * 0.25
        high_price = round(high_price / 0.25) * 0.25
        low_price = round(low_price / 0.25) * 0.25
        close_price = round(close_price / 0.25) * 0.25

        candles.append({
            "time": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "volume": volume,
        })

        price = close_price

    return candles
