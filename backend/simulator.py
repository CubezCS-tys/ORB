"""Monte Carlo prop firm challenge simulator.

Models two distinct phases:
1. Challenge Phase: Pay a fee, trade within rules (profit target, max drawdown,
   max daily loss, time limit). Binary pass/fail — no payout.
2. Funded Phase: For each challenge pass, trade a funded account with daily
   discipline (profit cap, loss cap). Contracts are dynamically sized per trade
   so max single-trade loss stays within the daily loss cap. Trader keeps
   payout_split % of peak profits.

Dynamic contract sizing:
  contracts_today = min(max_contracts, floor(daily_loss_cap / (risk_pts * POINT_VALUE)))
This models a real trader who sees the ORB range before entry and sizes accordingly.

EV = avg_funded_profit_per_sim - challenge_fee
"""

import math
import random
from typing import List, Dict, Tuple

from config import POINT_VALUE


def _run_phase(
    trade_pairs: List[Tuple[float, float]],
    max_contracts: int,
    account_size: float,
    max_drawdown: float,
    max_daily_loss: float,
    trading_days: int,
    profit_target: float | None,
    daily_profit_cap: float | None = None,
    daily_loss_cap: float | None = None,
) -> tuple[float, str, List[float]]:
    """
    Simulate one trading phase (challenge or funded).

    Contract sizing per trade:
    - Funded (daily_loss_cap set): size so max loss <= daily_loss_cap.
    - Challenge (no cap): size so max loss <= max_daily_loss.
    - If risk is too wide for even 1 contract, skip that day.

    Returns:
        (final_balance, exit_reason, equity_curve)
        exit_reason: "target" | "drawdown" | "daily_loss" | "time"
    """
    balance = account_size
    peak = account_size
    curve = [balance]

    for day in range(trading_days):
        pnl_pts, risk_pts = random.choice(trade_pairs)

        # Dynamic contract sizing based on the trade's risk
        if daily_loss_cap is not None:
            # Funded: size so max loss <= daily_loss_cap
            day_contracts = min(max_contracts, int(daily_loss_cap / (risk_pts * POINT_VALUE)))
        else:
            # Challenge: size so max loss <= max_daily_loss
            day_contracts = min(max_contracts, int(max_daily_loss / (risk_pts * POINT_VALUE)))

        if day_contracts <= 0:
            # Risk too wide for even 1 contract — skip this day
            curve.append(round(balance, 2))
            continue

        daily_pnl = pnl_pts * POINT_VALUE * day_contracts

        # Clamp to daily profit cap (trader stops after hitting target for the day)
        if daily_profit_cap is not None and daily_pnl > daily_profit_cap:
            daily_pnl = daily_profit_cap

        # Safety clamp for daily loss cap (should already be within cap from sizing)
        if daily_loss_cap is not None and daily_pnl < -daily_loss_cap:
            daily_pnl = -daily_loss_cap

        # Challenge: hard daily loss breach ends the phase (prop firm rule)
        if daily_loss_cap is None and daily_pnl < 0 and abs(daily_pnl) >= max_daily_loss:
            daily_pnl = -max_daily_loss
            balance += daily_pnl
            curve.append(round(balance, 2))
            return balance, "daily_loss", curve

        balance += daily_pnl
        curve.append(round(balance, 2))

        # Check drawdown from peak
        if balance > peak:
            peak = balance
        drawdown = peak - balance
        if drawdown >= max_drawdown:
            return balance, "drawdown", curve

        # Check profit target (challenge phase only)
        if profit_target is not None:
            profit = balance - account_size
            if profit >= profit_target:
                return balance, "target", curve

    return balance, "time", curve


def simulate_challenges(
    trade_pairs: List[Tuple[float, float]],
    num_simulations: int = 10000,
    account_size: float = 50000.0,
    profit_target: float = 3000.0,
    max_drawdown: float = 2000.0,
    max_daily_loss: float = 2000.0,
    trading_days: int = 30,
    contracts: int = 1,
    challenge_fee: float = 109.0,
    payout_split: float = 0.8,
    funded_max_drawdown: float = 2000.0,
    funded_max_daily_loss: float = 2000.0,
    funded_trading_days: int = 60,
    funded_daily_profit_cap: float = 1000.0,
    funded_daily_loss_cap: float = 500.0,
) -> Dict:
    """
    Run Monte Carlo simulation of prop firm challenge + funded phase.

    Args:
        trade_pairs: List of (pnl_pts, risk_pts) tuples from backtest (1 contract).
            pnl_pts = actual P&L outcome in points.
            risk_pts = stop loss distance (ORB range) in points.
        contracts: Max contracts per trade. Actual sizing is dynamic based on risk.
    """
    if not trade_pairs:
        return {"error": "No trade data — run backtest first"}

    passes = 0
    fails_drawdown = 0
    fails_daily = 0
    fails_time = 0

    # Funded phase stats
    funded_profits: List[float] = []
    funded_blown = 0
    funded_survived = 0

    sample_challenge_curves: List[List[float]] = []
    sample_funded_curves: List[List[float]] = []
    save_samples = min(num_simulations, 200)

    for sim in range(num_simulations):
        # --- Challenge Phase ---
        balance, reason, curve = _run_phase(
            trade_pairs, contracts, account_size,
            max_drawdown, max_daily_loss, trading_days,
            profit_target=profit_target,
        )

        if sim < save_samples:
            sample_challenge_curves.append(curve)

        if reason == "target":
            passes += 1

            # --- Funded Phase (dynamic contract sizing) ---
            funded_balance, funded_reason, funded_curve = _run_phase(
                trade_pairs, contracts, account_size,
                funded_max_drawdown, funded_max_daily_loss, funded_trading_days,
                profit_target=None,
                daily_profit_cap=funded_daily_profit_cap,
                daily_loss_cap=funded_daily_loss_cap,
            )

            if sim < save_samples:
                sample_funded_curves.append(funded_curve)

            # Profit = peak balance minus starting balance
            funded_peak = max(funded_curve)
            raw_profit = max(0.0, funded_peak - account_size)
            trader_profit = raw_profit * payout_split
            funded_profits.append(round(trader_profit, 2))

            if funded_reason in ("drawdown", "daily_loss"):
                funded_blown += 1
            else:
                funded_survived += 1
        else:
            if reason == "drawdown":
                fails_drawdown += 1
            elif reason == "daily_loss":
                fails_daily += 1
            else:
                fails_time += 1
            funded_profits.append(0.0)

    pass_rate = round(passes / num_simulations * 100, 2)

    # EV = avg funded profit per attempt - challenge fee
    avg_funded_profit = sum(funded_profits) / num_simulations
    ev_per_attempt = round(avg_funded_profit - challenge_fee, 2)

    # Funded profit stats (only for passes)
    pass_profits = [p for p in funded_profits if p > 0]
    avg_profit_when_passed = round(sum(pass_profits) / len(pass_profits), 2) if pass_profits else 0.0

    return {
        "num_simulations": num_simulations,
        "pass_rate": pass_rate,
        "passes": passes,
        "fails_drawdown": fails_drawdown,
        "fails_daily_loss": fails_daily,
        "fails_time": fails_time,
        "ev_per_attempt": ev_per_attempt,
        "challenge_fee": challenge_fee,
        "payout_split": payout_split,
        "avg_funded_profit": round(avg_funded_profit, 2),
        "avg_profit_when_passed": avg_profit_when_passed,
        "funded_blown": funded_blown,
        "funded_survived": funded_survived,
        "sample_challenge_curves": sample_challenge_curves,
        "sample_funded_curves": sample_funded_curves,
        "trades_in_distribution": len(trade_pairs),
    }
