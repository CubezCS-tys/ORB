"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createChart, LineSeries, ColorType, type IChartApi } from "lightweight-charts";
import type { SimulationResult } from "@/lib/types";
import { fetchSimulation } from "@/lib/api";

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color ?? "text-zinc-200"}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function EquityCurveChart({ curves, accountSize }: { curves: number[][]; accountSize: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !curves.length) return;
    if (chartRef.current) chartRef.current.remove();

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0a0a0f" }, textColor: "#71717a" },
      grid: { vertLines: { color: "#1e1e2e" }, horzLines: { color: "#1e1e2e" } },
      rightPriceScale: { borderColor: "#1e1e2e" },
      timeScale: { borderColor: "#1e1e2e", visible: false },
      crosshair: { mode: 0 },
      width: containerRef.current.clientWidth,
      height: 350,
    });

    // Target line
    const targetSeries = chart.addSeries(LineSeries, {
      color: "#22c55e33",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    // Show up to 100 sample curves
    const displayCurves = curves.slice(0, 100);
    let maxLen = 0;

    for (const curve of displayCurves) {
      const passed = curve[curve.length - 1] > accountSize;
      const series = chart.addSeries(LineSeries, {
        color: passed ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.1)",
        lineWidth: 1,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      const lineData = curve.map((v, i) => ({ time: (i + 1) as unknown as import("lightweight-charts").UTCTimestamp, value: v }));
      series.setData(lineData);
      if (curve.length > maxLen) maxLen = curve.length;
    }

    // Draw target line across the full width
    if (maxLen > 0) {
      const tgt = displayCurves[0] ? accountSize : accountSize;
      targetSeries.setData(
        Array.from({ length: maxLen + 1 }, (_, i) => ({
          time: (i + 1) as unknown as import("lightweight-charts").UTCTimestamp,
          value: tgt,
        }))
      );
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [curves, accountSize]);

  return <div ref={containerRef} className="w-full" />;
}

export default function SimulatorPage() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Strategy params
  const [orbMinutes, setOrbMinutes] = useState(30);
  const [contracts, setContracts] = useState(10);
  const [accountSize, setAccountSize] = useState(50000);
  const [rrRatio, setRrRatio] = useState(0.5);

  // Challenge params
  const [profitTarget, setProfitTarget] = useState(3000);
  const [maxDrawdown, setMaxDrawdown] = useState(2000);
  const [maxDailyLoss, setMaxDailyLoss] = useState(2000);
  const [tradingDays, setTradingDays] = useState(30);
  const [challengeFee, setChallengeFee] = useState(109);
  const [numSimulations, setNumSimulations] = useState(10000);

  // Funded phase params
  const [payoutSplit, setPayoutSplit] = useState(80);
  const [fundedMaxDrawdown, setFundedMaxDrawdown] = useState(2000);
  const [fundedMaxDailyLoss, setFundedMaxDailyLoss] = useState(2000);
  const [fundedTradingDays, setFundedTradingDays] = useState(60);
  const [fundedDailyProfitCap, setFundedDailyProfitCap] = useState(1000);
  const [fundedDailyLossCap, setFundedDailyLossCap] = useState(500);

  const runSimulation = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSimulation({
        orbMinutes,
        contracts,
        accountSize,
        rrRatio,
        numSimulations,
        profitTarget,
        maxDrawdown,
        maxDailyLoss,
        tradingDays,
        challengeFee,
        payoutSplit: payoutSplit / 100,
        fundedMaxDrawdown,
        fundedMaxDailyLoss,
        fundedTradingDays,
        fundedDailyProfitCap,
        fundedDailyLossCap,
      });
      if (!data.passes && data.passes !== 0) {
        const raw = data as Record<string, unknown>;
        let msg = "Unexpected response from server";
        if (raw.detail) {
          msg = Array.isArray(raw.detail)
            ? (raw.detail as Array<{ msg: string }>).map(e => e.msg).join("; ")
            : String(raw.detail);
        } else if (raw.error) {
          msg = String(raw.error);
        }
        setResult({ error: msg } as SimulationResult);
      } else {
        setResult(data);
      }
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setLoading(false);
    }
  }, [orbMinutes, contracts, accountSize, rrRatio, numSimulations, profitTarget, maxDrawdown, maxDailyLoss, tradingDays, challengeFee, payoutSplit, fundedMaxDrawdown, fundedMaxDailyLoss, fundedTradingDays, fundedDailyProfitCap, fundedDailyLossCap]);

  function inputField(label: string, value: number, setter: (v: number) => void, opts?: { min?: number; max?: number; step?: number; prefix?: string }) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">{label}</label>
        <input
          type="number"
          min={opts?.min}
          max={opts?.max}
          step={opts?.step ?? 1}
          value={value}
          onChange={(e) => setter(Number(e.target.value))}
          className="w-28 rounded border px-2 py-1.5 text-sm"
          style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Challenge Simulator
          <span className="ml-2 text-sm font-normal text-zinc-500">Monte Carlo</span>
        </h1>
      </div>

      {/* Controls */}
      <div className="mb-4 rounded-lg border p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-3 flex flex-wrap items-end gap-4">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider self-center mr-2">Strategy</div>
          {inputField("ORB Minutes", orbMinutes, setOrbMinutes, { min: 1, max: 60 })}
          {inputField("R:R Ratio", rrRatio, setRrRatio, { min: 0.1, max: 5, step: 0.1 })}
          {inputField("Contracts", contracts, setContracts, { min: 1, max: 40 })}
          {inputField("Account Size ($)", accountSize, setAccountSize, { min: 1000, step: 1000 })}
          {inputField("Simulations", numSimulations, setNumSimulations, { min: 100, max: 100000, step: 1000 })}
        </div>
        <div className="mb-3 border-t pt-3 flex flex-wrap items-end gap-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider self-center mr-2">Challenge</div>
          {inputField("Profit Target ($)", profitTarget, setProfitTarget, { min: 100, step: 100 })}
          {inputField("Max Drawdown ($)", maxDrawdown, setMaxDrawdown, { min: 100, step: 100 })}
          {inputField("Max Daily Loss ($)", maxDailyLoss, setMaxDailyLoss, { min: 100, step: 100 })}
          {inputField("Trading Days", tradingDays, setTradingDays, { min: 5, max: 365 })}
          {inputField("Challenge Fee ($)", challengeFee, setChallengeFee, { min: 0, step: 10 })}
        </div>
        <div className="border-t pt-3 flex flex-wrap items-end gap-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider self-center mr-2">Funded</div>
          {inputField("Payout Split (%)", payoutSplit, setPayoutSplit, { min: 1, max: 100 })}
          {inputField("Max Drawdown ($)", fundedMaxDrawdown, setFundedMaxDrawdown, { min: 100, step: 100 })}
          {inputField("Max Daily Loss ($)", fundedMaxDailyLoss, setFundedMaxDailyLoss, { min: 100, step: 100 })}
          {inputField("Daily Profit Cap ($)", fundedDailyProfitCap, setFundedDailyProfitCap, { min: 100, step: 100 })}
          {inputField("Daily Loss Cap ($)", fundedDailyLossCap, setFundedDailyLossCap, { min: 100, step: 100 })}
          {inputField("Trading Days", fundedTradingDays, setFundedTradingDays, { min: 5, max: 365 })}

          <button
            onClick={runSimulation}
            disabled={loading}
            className="rounded bg-indigo-600 px-6 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Simulating..." : "Run Simulation"}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && !result.error && result.passes !== undefined && (
        <>
          {/* Stat cards */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <StatCard
              label="Pass Rate"
              value={`${result.pass_rate}%`}
              sub={`${result.passes.toLocaleString()} / ${result.num_simulations.toLocaleString()}`}
              color={result.pass_rate >= 50 ? "text-green-500" : result.pass_rate >= 25 ? "text-amber-500" : "text-red-500"}
            />
            <StatCard
              label="EV per Attempt"
              value={`${result.ev_per_attempt >= 0 ? "+" : ""}$${result.ev_per_attempt.toLocaleString()}`}
              sub={`Fee: $${result.challenge_fee} | Split: ${(result.payout_split * 100).toFixed(0)}%`}
              color={result.ev_per_attempt >= 0 ? "text-green-500" : "text-red-500"}
            />
            <StatCard
              label="Avg Funded Profit"
              value={`$${result.avg_funded_profit.toLocaleString()}`}
              sub={`Per pass: $${result.avg_profit_when_passed.toLocaleString()}`}
              color="text-blue-400"
            />
            <StatCard
              label="Funded Accounts"
              value={`${result.funded_blown + result.funded_survived}`}
              sub={`Blown: ${result.funded_blown} | Survived: ${result.funded_survived}`}
              color="text-zinc-300"
            />
            <StatCard
              label="Backtest Win Rate"
              value={`${result.backtest.win_rate}%`}
              sub={`${result.backtest.traded_days} trades over ${result.backtest.total_days} days`}
            />
            <StatCard
              label="Fail Breakdown"
              value={`${(result.fails_drawdown + result.fails_daily_loss + result.fails_time).toLocaleString()}`}
              sub={`DD: ${result.fails_drawdown} | Daily: ${result.fails_daily_loss} | Time: ${result.fails_time}`}
              color="text-red-400"
            />
          </div>

          {/* Charts side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="px-4 py-2 border-b text-xs text-zinc-500" style={{ borderColor: "var(--border)" }}>
                Challenge Phase — {Math.min(100, result.sample_challenge_curves.length)} of {result.num_simulations.toLocaleString()} simulations
              </div>
              <EquityCurveChart curves={result.sample_challenge_curves} accountSize={accountSize} />
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="px-4 py-2 border-b text-xs text-zinc-500" style={{ borderColor: "var(--border)" }}>
                Funded Phase — {Math.min(100, result.sample_funded_curves.length)} equity curves (passed only)
              </div>
              <EquityCurveChart curves={result.sample_funded_curves} accountSize={accountSize} />
            </div>
          </div>
        </>
      )}

      {result?.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          {result.error}
        </div>
      )}

      {!result && !loading && (
        <div
          className="flex items-center justify-center rounded-lg border text-zinc-500"
          style={{ height: "calc(100vh - 320px)", minHeight: "300px", backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
        >
          Configure challenge parameters and click &quot;Run Simulation&quot;
        </div>
      )}
    </div>
  );
}
