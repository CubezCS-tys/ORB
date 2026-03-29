"""Simple ORB breakout strategy: first break of the range, configurable R:R."""

from typing import List, Dict, Optional

from config import POINT_VALUE, MAX_DAILY_LOSS


def run_orb_strategy(
    candles: List[Dict],
    orb_high: float,
    orb_low: float,
    orb_end_index: int,
    contracts: int = 1,
    account_size: float = 50000.0,
    rr_ratio: float = 1.0,
) -> Optional[Dict]:
    """
    Run the simplest ORB breakout strategy.

    Rules:
    - After the ORB period ends, wait for a candle to CLOSE above orb_high or below orb_low.
    - Long: entry = close, stop = orb_low, TP = entry + (entry - orb_low)  → 1:1 R:R
    - Short: entry = close, stop = orb_high, TP = entry - (orb_high - entry) → 1:1 R:R
    - One trade per session. First breakout direction wins.
    - Walk forward candle by candle to determine outcome.

    Returns:
        Trade dict with direction, entry, stop, target, result, pnl, etc.
        None if no breakout occurred.
    """
    if orb_high is None or orb_low is None:
        return None

    trade = None

    # Scan candles after ORB period for a breakout
    for i in range(orb_end_index + 1, len(candles)):
        c = candles[i]

        if c["close"] > orb_high:
            # Long breakout
            entry = c["close"]
            stop = orb_low
            risk = entry - stop
            target = entry + risk * rr_ratio
            trade = {
                "direction": "LONG",
                "entry_price": entry,
                "stop_loss": stop,
                "take_profit": target,
                "risk": risk,
                "entry_time": c["time"],
                "entry_index": i,
            }
            break

        elif c["close"] < orb_low:
            # Short breakout
            entry = c["close"]
            stop = orb_high
            risk = stop - entry
            target = entry - risk * rr_ratio
            trade = {
                "direction": "SHORT",
                "entry_price": entry,
                "stop_loss": stop,
                "take_profit": target,
                "risk": risk,
                "entry_time": c["time"],
                "entry_index": i,
            }
            break

    if trade is None:
        return None

    # Check if risk exceeds max daily loss
    risk_dollars = trade["risk"] * POINT_VALUE * contracts
    if risk_dollars > MAX_DAILY_LOSS:
        return None

    # Walk forward to resolve the trade
    for i in range(trade["entry_index"] + 1, len(candles)):
        c = candles[i]

        if trade["direction"] == "LONG":
            # Check stop first (worst case assumption)
            if c["low"] <= trade["stop_loss"]:
                trade["result"] = "LOSS"
                trade["exit_price"] = trade["stop_loss"]
                trade["exit_time"] = c["time"]
                trade["pnl"] = -trade["risk"]
                break
            # Check target
            if c["high"] >= trade["take_profit"]:
                trade["result"] = "WIN"
                trade["exit_price"] = trade["take_profit"]
                trade["exit_time"] = c["time"]
                trade["pnl"] = trade["risk"] * rr_ratio
                break

        else:  # SHORT
            # Check stop first
            if c["high"] >= trade["stop_loss"]:
                trade["result"] = "LOSS"
                trade["exit_price"] = trade["stop_loss"]
                trade["exit_time"] = c["time"]
                trade["pnl"] = -trade["risk"]
                break
            # Check target
            if c["low"] <= trade["take_profit"]:
                trade["result"] = "WIN"
                trade["exit_price"] = trade["take_profit"]
                trade["exit_time"] = c["time"]
                trade["pnl"] = trade["risk"] * rr_ratio
                break
    else:
        # Session ended without hitting SL or TP — close at last candle
        last = candles[-1]
        if trade["direction"] == "LONG":
            trade["pnl"] = last["close"] - trade["entry_price"]
        else:
            trade["pnl"] = trade["entry_price"] - last["close"]
        trade["exit_price"] = last["close"]
        trade["exit_time"] = last["time"]
        trade["result"] = "WIN" if trade["pnl"] > 0 else "LOSS"

    # Round values
    trade["pnl"] = round(trade["pnl"], 2)
    trade["risk"] = round(trade["risk"], 2)
    trade["entry_price"] = round(trade["entry_price"], 2)
    trade["exit_price"] = round(trade["exit_price"], 2)
    trade["take_profit"] = round(trade["take_profit"], 2)
    trade["stop_loss"] = round(trade["stop_loss"], 2)

    # Dollar values
    trade["contracts"] = contracts
    trade["pnl_dollars"] = round(trade["pnl"] * POINT_VALUE * contracts, 2)
    trade["risk_dollars"] = round(trade["risk"] * POINT_VALUE * contracts, 2)
    trade["account_size"] = account_size
    trade["account_after"] = round(account_size + trade["pnl_dollars"], 2)
    trade["pnl_pct"] = round((trade["pnl_dollars"] / account_size) * 100, 2)

    return trade
