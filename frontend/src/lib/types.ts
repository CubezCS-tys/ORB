/** Shared TypeScript types for the ORB strategy app. */

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk: number;
  entry_time: string;
  exit_price: number;
  exit_time: string;
  result: string;
  pnl: number;
  contracts: number;
  pnl_dollars: number;
  risk_dollars: number;
  account_size: number;
  account_after: number;
  pnl_pct: number;
}

export interface ORBData {
  orb_high: number | null;
  orb_low: number | null;
  orb_start?: string;
  orb_end?: string;
  orb_candles: Candle[];
  all_candles: Candle[];
  trade?: Trade | null;
}

export interface StrategyParams {
  orbMinutes: number;
  showOrb: boolean;
  runStrategy: boolean;
  contracts: number;
  accountSize: number;
}

export interface RandomParams extends StrategyParams {
  numMinutes: number;
  startPrice: number;
  volatility: number;
}

export interface RealDataParams extends StrategyParams {
  date?: string;
}

export interface BacktestSummary {
  total_days: number;
  traded_days: number;
  win_rate: number;
  avg_win_pts: number;
  avg_loss_pts: number;
  total_pnl_pts: number;
  total_pnl_dollars: number;
}

export interface SimulationResult {
  num_simulations: number;
  pass_rate: number;
  passes: number;
  fails_drawdown: number;
  fails_daily_loss: number;
  fails_time: number;
  ev_per_attempt: number;
  challenge_fee: number;
  payout_split: number;
  avg_funded_profit: number;
  avg_profit_when_passed: number;
  funded_blown: number;
  funded_survived: number;
  sample_challenge_curves: number[][];
  sample_funded_curves: number[][];
  backtest: BacktestSummary;
  error?: string;
}

export interface SimulationParams {
  orbMinutes: number;
  contracts: number;
  accountSize: number;
  rrRatio: number;
  numSimulations: number;
  profitTarget: number;
  maxDrawdown: number;
  maxDailyLoss: number;
  tradingDays: number;
  challengeFee: number;
  payoutSplit: number;
  fundedMaxDrawdown: number;
  fundedMaxDailyLoss: number;
  fundedTradingDays: number;
  fundedDailyProfitCap: number;
  fundedDailyLossCap: number;
}

/* ── Practice Arena ── */

export interface Tick {
  price: number;
}

export interface PracticeCandle extends Candle {
  ticks: Tick[];
}

export interface PracticeDayData {
  date: string;
  candles: PracticeCandle[];
  point_value: number;
  error?: string;
}

export interface PracticeTrade {
  id: number;
  direction: "LONG" | "SHORT";
  entry_price: number;
  entry_time: string;
  stop_loss: number;
  take_profit: number;
  contracts: number;
  exit_price?: number;
  exit_time?: string;
  result?: "WIN" | "LOSS" | "SCRATCH";
  pnl_dollars?: number;
}
