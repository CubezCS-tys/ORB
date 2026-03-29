"""FastAPI backend for ORB trading strategy."""

import random
from contextlib import asynccontextmanager
from typing import List, Dict, Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from config import DEFAULT_ACCOUNT_SIZE, DEFAULT_ORB_MINUTES, DEFAULT_NUM_MINUTES, MAX_CONTRACTS, MAX_DAILY_LOSS, POINT_VALUE
from data_loader import load_day_candles, get_available_dates as _get_dates, warmup_cache
from generator import generate_random_candles
from orb import compute_orb_levels
from strategy import run_orb_strategy
from backtest import run_backtest
from simulator import simulate_challenges


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-build the days cache on server start so first request is fast."""
    print("Warming up data cache...")
    warmup_cache()
    print("Cache ready.")
    yield


app = FastAPI(title="ORB Strategy", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_result(
    candles: List[Dict],
    orb_minutes: int,
    show_orb: bool,
    run_strategy: bool,
    contracts: int,
    account_size: float,
    rr_ratio: float = 1.0,
) -> Dict:
    """Shared pipeline: compute ORB levels and optionally run strategy."""
    result: Dict = {
        "all_candles": candles,
        "orb_high": None,
        "orb_low": None,
        "orb_candles": [],
        "trade": None,
    }

    if not show_orb:
        return result

    result = compute_orb_levels(candles, orb_minutes=orb_minutes)
    result["trade"] = None

    if not run_strategy or result["orb_high"] is None:
        return result

    orb_end_time = result.get("orb_end")
    orb_end_idx = next(
        (i for i, c in enumerate(candles) if c["time"] == orb_end_time),
        orb_minutes - 1,
    )
    result["trade"] = run_orb_strategy(
        candles, result["orb_high"], result["orb_low"], orb_end_idx,
        contracts=contracts, account_size=account_size,
        rr_ratio=rr_ratio,
    )

    return result


@app.get("/api/random-candles")
def api_random_candles(
    num_minutes: int = Query(DEFAULT_NUM_MINUTES, ge=10, le=780),
    start_price: float = Query(18000.0, ge=100),
    volatility: float = Query(0.001, ge=0.0001, le=1.0),
    orb_minutes: int = Query(DEFAULT_ORB_MINUTES, ge=1, le=60),
    show_orb: bool = Query(True),
    run_strategy: bool = Query(True),
    contracts: int = Query(1, ge=1, le=MAX_CONTRACTS),
    account_size: float = Query(DEFAULT_ACCOUNT_SIZE, ge=1000),
    rr_ratio: float = Query(1.0, ge=0.1, le=5.0),
):
    """Generate random candlesticks, optionally compute ORB and run strategy."""
    candles = generate_random_candles(
        num_minutes=num_minutes,
        start_price=start_price,
        volatility=volatility,
    )
    return _build_result(candles, orb_minutes, show_orb, run_strategy, contracts, account_size, rr_ratio)


@app.get("/api/real-data")
def api_real_data(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    orb_minutes: int = Query(DEFAULT_ORB_MINUTES, ge=1, le=60),
    show_orb: bool = Query(True),
    run_strategy: bool = Query(True),
    contracts: int = Query(1, ge=1, le=MAX_CONTRACTS),
    account_size: float = Query(DEFAULT_ACCOUNT_SIZE, ge=1000),
    rr_ratio: float = Query(1.0, ge=0.1, le=5.0),
):
    """Load real MNQ data for a specific date and compute ORB levels."""
    candles, error = load_day_candles(date)
    if error:
        return {"error": error}
    return _build_result(candles, orb_minutes, show_orb, run_strategy, contracts, account_size, rr_ratio)


@app.get("/api/available-dates")
def api_available_dates():
    """Return list of available trading dates in the dataset."""
    return {"dates": _get_dates()}


@app.get("/api/backtest")
def api_backtest(
    orb_minutes: int = Query(DEFAULT_ORB_MINUTES, ge=1, le=60),
    contracts: int = Query(1, ge=1, le=MAX_CONTRACTS),
    account_size: float = Query(DEFAULT_ACCOUNT_SIZE, ge=1000),
    rr_ratio: float = Query(1.0, ge=0.1, le=5.0),
):
    """Run ORB strategy backtest across all available trading days."""
    return run_backtest(
        orb_minutes=orb_minutes,
        contracts=contracts,
        account_size=account_size,
        rr_ratio=rr_ratio,
    )


@app.get("/api/simulate")
def api_simulate(
    orb_minutes: int = Query(DEFAULT_ORB_MINUTES, ge=1, le=60),
    contracts: int = Query(1, ge=1, le=MAX_CONTRACTS),
    account_size: float = Query(DEFAULT_ACCOUNT_SIZE, ge=1000),
    rr_ratio: float = Query(0.5, ge=0.1, le=5.0),
    num_simulations: int = Query(10000, ge=100, le=100000),
    profit_target: float = Query(3000.0, ge=100),
    max_drawdown: float = Query(2000.0, ge=100),
    max_daily_loss: float = Query(MAX_DAILY_LOSS, ge=100),
    trading_days: int = Query(30, ge=5, le=365),
    challenge_fee: float = Query(109.0, ge=0),
    payout_split: float = Query(0.8, ge=0.0, le=1.0),
    funded_max_drawdown: float = Query(2000.0, ge=100),
    funded_max_daily_loss: float = Query(MAX_DAILY_LOSS, ge=100),
    funded_trading_days: int = Query(60, ge=5, le=365),
    funded_daily_profit_cap: float = Query(1000.0, ge=100),
    funded_daily_loss_cap: float = Query(500.0, ge=100),
):
    """Run Monte Carlo simulation of challenge + funded phases."""
    # Always backtest with contracts=1 to get the raw point P&L distribution.
    bt = run_backtest(
        orb_minutes=orb_minutes,
        contracts=1,
        account_size=account_size,
        rr_ratio=rr_ratio,
    )
    trade_pairs = bt.get("trade_pairs", [])
    if not trade_pairs:
        return {"error": "Backtest produced no trades"}

    sim = simulate_challenges(
        trade_pairs=trade_pairs,
        num_simulations=num_simulations,
        account_size=account_size,
        profit_target=profit_target,
        max_drawdown=max_drawdown,
        max_daily_loss=max_daily_loss,
        trading_days=trading_days,
        contracts=contracts,
        challenge_fee=challenge_fee,
        payout_split=payout_split,
        funded_max_drawdown=funded_max_drawdown,
        funded_max_daily_loss=funded_max_daily_loss,
        funded_trading_days=funded_trading_days,
        funded_daily_profit_cap=funded_daily_profit_cap,
        funded_daily_loss_cap=funded_daily_loss_cap,
    )

    # Include backtest summary in the response
    sim["backtest"] = {
        "total_days": bt["total_days"],
        "traded_days": bt["traded_days"],
        "win_rate": bt["win_rate"],
        "avg_win_pts": bt["avg_win_pts"],
        "avg_loss_pts": bt["avg_loss_pts"],
        "total_pnl_pts": bt["total_pnl_pts"],
        "total_pnl_dollars": bt["total_pnl_dollars"],
    }

    return sim


# ---------------------------------------------------------------------------
# Practice Arena — random day with intra-candle ticks
# ---------------------------------------------------------------------------

def _generate_intra_candle_ticks(candle: Dict, num_ticks: int = 10) -> List[Dict]:
    """Generate a realistic price path within a single 1-min candle.

    Returns a list of tick-like price points that walk from open through
    high/low to close, so the frontend can animate price movement.
    """
    o, h, l, c = candle["open"], candle["high"], candle["low"], candle["close"]

    if h == l:
        # Flat candle — just return open=close
        return [{"price": o}] * num_ticks

    # Decide path order: if close >= open (bullish), go open→low→high→close
    # else (bearish) open→high→low→close
    if c >= o:
        waypoints = [o, l, h, c]
    else:
        waypoints = [o, h, l, c]

    # Distribute ticks across the 3 segments proportionally to price distance
    segments = []
    for i in range(len(waypoints) - 1):
        segments.append((waypoints[i], waypoints[i + 1]))

    total_dist = sum(abs(b - a) for a, b in segments) or 1.0
    ticks: List[Dict] = []

    for seg_start, seg_end in segments:
        seg_dist = abs(seg_end - seg_start)
        n = max(1, round(num_ticks * seg_dist / total_dist))
        for j in range(n):
            frac = j / max(n - 1, 1)
            price = seg_start + (seg_end - seg_start) * frac
            ticks.append({"price": round(price, 2)})

    # Ensure last tick is exactly close
    if ticks:
        ticks[-1]["price"] = c
    else:
        ticks = [{"price": c}]

    return ticks


@app.get("/api/practice/random-day")
def api_practice_random_day():
    """Pick a random trading day and return candles with intra-candle ticks."""
    dates = _get_dates()
    if not dates:
        return {"error": "No data available"}

    date = random.choice(dates)
    candles, error = load_day_candles(date)
    if error:
        return {"error": error}

    # Filter to regular session only (9:30 - 16:00 ET)
    session_candles = []
    for c in candles:
        hour = int(c["time"][11:13])
        minute = int(c["time"][14:16])
        total_min = hour * 60 + minute
        if 9 * 60 + 30 <= total_min < 16 * 60:
            session_candles.append(c)

    if not session_candles:
        return {"error": "No session candles for this date"}

    # Add intra-candle ticks to each candle
    candles_with_ticks = []
    for c in session_candles:
        candle = dict(c)
        candle["ticks"] = _generate_intra_candle_ticks(c, num_ticks=10)
        candles_with_ticks.append(candle)

    return {
        "date": date,
        "candles": candles_with_ticks,
        "point_value": POINT_VALUE,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
