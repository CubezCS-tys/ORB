"""Opening Range Breakout (ORB) level computation."""

from typing import List, Dict
from datetime import datetime

from config import MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE


def compute_orb_levels(
    candles: List[Dict],
    orb_minutes: int = 5,
    market_open_hour: int = MARKET_OPEN_HOUR,
    market_open_minute: int = MARKET_OPEN_MINUTE,
) -> Dict:
    """
    Compute the ORB high/low from the first N minutes of 1-min candles.

    Args:
        candles: List of 1-min candle dicts with time, open, high, low, close.
        orb_minutes: Number of minutes for the opening range (default 5).
        market_open_hour: Hour of market open (24h format, default 9).
        market_open_minute: Minute of market open (default 30).

    Returns:
        Dict with orb_high, orb_low, orb_candles (the candles in the range),
        and all_candles with the full dataset.
    """
    if not candles:
        return {"orb_high": None, "orb_low": None, "orb_candles": [], "all_candles": []}

    # Find market open candle
    open_idx = None
    for i, c in enumerate(candles):
        t = datetime.strptime(c["time"], "%Y-%m-%d %H:%M:%S")
        if t.hour == market_open_hour and t.minute == market_open_minute:
            open_idx = i
            break

    if open_idx is None:
        # Fallback: use first candle as "open"
        open_idx = 0

    # Get ORB candles (first N minutes from open)
    orb_candles = candles[open_idx: open_idx + orb_minutes]

    if not orb_candles:
        return {"orb_high": None, "orb_low": None, "orb_candles": [], "all_candles": candles}

    orb_high = max(c["high"] for c in orb_candles)
    orb_low = min(c["low"] for c in orb_candles)

    return {
        "orb_high": orb_high,
        "orb_low": orb_low,
        "orb_start": orb_candles[0]["time"],
        "orb_end": orb_candles[-1]["time"],
        "orb_candles": orb_candles,
        "all_candles": candles,
    }
