"""Backtest the ORB strategy across all available trading days."""

from typing import List, Dict

from data_loader import get_available_dates, load_day_candles
from orb import compute_orb_levels
from strategy import run_orb_strategy
from config import POINT_VALUE

_backtest_cache: Dict[tuple, Dict] = {}


def run_backtest(
    orb_minutes: int = 5,
    contracts: int = 1,
    account_size: float = 50000.0,
    rr_ratio: float = 1.0,
) -> Dict:
    """
    Run the ORB breakout strategy on every trading day in the dataset.
    Results are cached by (orb_minutes, contracts, account_size).

    Returns:
        Dict with summary stats and per-day trade list.
    """
    cache_key = (orb_minutes, contracts, account_size, rr_ratio)
    if cache_key in _backtest_cache:
        return _backtest_cache[cache_key]

    dates = get_available_dates()
    trades: List[Dict] = []
    skipped = 0
    no_data = 0

    for date_str in dates:
        candles, error = load_day_candles(date_str)
        if error or not candles:
            no_data += 1
            continue

        orb = compute_orb_levels(candles, orb_minutes=orb_minutes)
        if orb["orb_high"] is None:
            skipped += 1
            continue

        orb_end_time = orb.get("orb_end")
        orb_end_idx = next(
            (i for i, c in enumerate(candles) if c["time"] == orb_end_time),
            orb_minutes - 1,
        )

        trade = run_orb_strategy(
            candles, orb["orb_high"], orb["orb_low"], orb_end_idx,
            contracts=contracts, account_size=account_size,
            rr_ratio=rr_ratio,
        )

        if trade is None:
            skipped += 1
            continue

        trade["date"] = date_str
        trades.append(trade)

    # Compute summary stats
    total = len(trades)
    wins = [t for t in trades if t["result"] == "WIN"]
    losses = [t for t in trades if t["result"] == "LOSS"]
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = round(win_count / total * 100, 2) if total else 0.0

    pnl_points = [t["pnl"] for t in trades]
    pnl_dollars = [t["pnl_dollars"] for t in trades]
    avg_win_pts = round(sum(t["pnl"] for t in wins) / win_count, 2) if wins else 0.0
    avg_loss_pts = round(sum(t["pnl"] for t in losses) / loss_count, 2) if losses else 0.0

    total_pnl_pts = round(sum(pnl_points), 2)
    total_pnl_dollars = round(sum(pnl_dollars), 2)

    # Equity curve
    equity = account_size
    equity_curve = []
    for t in trades:
        equity += t["pnl_dollars"]
        equity_curve.append(round(equity, 2))

    # Max drawdown on equity curve
    peak = account_size
    max_dd = 0.0
    for eq in equity_curve:
        if eq > peak:
            peak = eq
        dd = peak - eq
        if dd > max_dd:
            max_dd = dd
    max_dd = round(max_dd, 2)

    result = {
        "total_days": len(dates),
        "traded_days": total,
        "skipped_days": skipped,
        "no_data_days": no_data,
        "win_count": win_count,
        "loss_count": loss_count,
        "win_rate": win_rate,
        "avg_win_pts": avg_win_pts,
        "avg_loss_pts": avg_loss_pts,
        "total_pnl_pts": total_pnl_pts,
        "total_pnl_dollars": total_pnl_dollars,
        "max_drawdown": max_dd,
        "equity_curve": equity_curve,
        "pnl_distribution": pnl_points,
        "risk_distribution": [t["risk"] for t in trades],
        "trade_pairs": [(t["pnl"], t["risk"]) for t in trades],
        "trades": trades,
    }

    _backtest_cache[cache_key] = result
    return result
