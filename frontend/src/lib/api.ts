/** API client for the ORB strategy backend. */

import type { ORBData, RandomParams, RealDataParams, SimulationParams, SimulationResult, PracticeDayData } from "./types";

function toSearchParams(obj: Record<string, string | number | boolean>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    params.set(key, String(value));
  }
  return params;
}

function strategyParams(p: { orbMinutes: number; showOrb: boolean; runStrategy: boolean; contracts: number; accountSize: number }) {
  return {
    orb_minutes: p.orbMinutes,
    show_orb: p.showOrb,
    run_strategy: p.runStrategy,
    contracts: p.contracts,
    account_size: p.accountSize,
  };
}

export async function fetchRandomCandles(params: RandomParams): Promise<ORBData> {
  const searchParams = toSearchParams({
    num_minutes: params.numMinutes,
    start_price: params.startPrice,
    volatility: params.volatility,
    ...strategyParams(params),
  });
  const res = await fetch(`/api/random-candles?${searchParams}`);
  return res.json();
}

export async function fetchRealData(params: RealDataParams): Promise<ORBData & { error?: string }> {
  const searchParams = toSearchParams(strategyParams(params));
  if (params.date) searchParams.set("date", params.date);
  const res = await fetch(`/api/real-data?${searchParams}`);
  return res.json();
}

export async function fetchSimulation(params: SimulationParams): Promise<SimulationResult> {
  const searchParams = toSearchParams({
    orb_minutes: params.orbMinutes,
    contracts: params.contracts,
    account_size: params.accountSize,
    rr_ratio: params.rrRatio,
    num_simulations: params.numSimulations,
    profit_target: params.profitTarget,
    max_drawdown: params.maxDrawdown,
    max_daily_loss: params.maxDailyLoss,
    trading_days: params.tradingDays,
    challenge_fee: params.challengeFee,
    payout_split: params.payoutSplit,
    funded_max_drawdown: params.fundedMaxDrawdown,
    funded_max_daily_loss: params.fundedMaxDailyLoss,
    funded_trading_days: params.fundedTradingDays,
    funded_daily_profit_cap: params.fundedDailyProfitCap,
    funded_daily_loss_cap: params.fundedDailyLossCap,
  });
  const res = await fetch(`/api/simulate?${searchParams}`);
  return res.json();
}

export async function fetchPracticeDay(): Promise<PracticeDayData> {
  const res = await fetch("/api/practice/random-day");
  return res.json();
}
