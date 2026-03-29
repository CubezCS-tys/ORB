"use client";

import { useState, useCallback } from "react";
import CandlestickChart from "@/components/CandlestickChart";
import type { ORBData } from "@/lib/types";
import { fetchRandomCandles, fetchRealData } from "@/lib/api";

export default function ORBPage() {
  const [data, setData] = useState<ORBData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"random" | "real">("random");
  const [volatility, setVolatility] = useState(0.001);
  const [startPrice, setStartPrice] = useState(18000);
  const [orbMinutes, setOrbMinutes] = useState(5);
  const [showOrb, setShowOrb] = useState(true);
  const [runStrategy, setRunStrategy] = useState(true);
  const [contracts, setContracts] = useState(1);
  const [accountSize, setAccountSize] = useState(50000);
  const [date, setDate] = useState("");

  const generateRandom = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fetchRandomCandles({
        numMinutes: 390,
        startPrice,
        volatility,
        orbMinutes,
        showOrb,
        runStrategy,
        contracts,
        accountSize,
      });
      setData(json);
    } catch (err) {
      console.error("Failed to fetch random candles:", err);
    } finally {
      setLoading(false);
    }
  }, [startPrice, volatility, orbMinutes, showOrb, runStrategy, contracts, accountSize]);

  const loadRealData = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fetchRealData({
        date: date || undefined,
        orbMinutes,
        showOrb,
        runStrategy,
        contracts,
        accountSize,
      });
      if (json.error) {
        console.error(json.error);
      } else {
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch real data:", err);
    } finally {
      setLoading(false);
    }
  }, [date, orbMinutes, showOrb, runStrategy, contracts, accountSize]);

  const handleGenerate = () => {
    if (mode === "random") generateRandom();
    else loadRealData();
  };

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          ORB Strategy
          <span className="ml-2 text-sm font-normal text-zinc-500">
            Opening Range Breakout
          </span>
        </h1>

        {data && data.orb_high !== null && (
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-zinc-500">ORB High: </span>
              <span className="font-mono text-green-500">
                {data.orb_high?.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">ORB Low: </span>
              <span className="font-mono text-red-500">
                {data.orb_low?.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Range: </span>
              <span className="font-mono text-indigo-400">
                {data.orb_high !== null && data.orb_low !== null
                  ? (data.orb_high - data.orb_low).toFixed(2)
                  : "—"}
              </span>
            </div>
            {data.trade && (
              <>
                <div className="border-l border-zinc-700 pl-6">
                  <span className="text-zinc-500">Trade: </span>
                  <span className={`font-mono ${data.trade.direction === "LONG" ? "text-green-500" : "text-red-500"}`}>
                    {data.trade.direction}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Entry: </span>
                  <span className="font-mono text-zinc-300">{data.trade.entry_price.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Result: </span>
                  <span className={`font-mono font-bold ${data.trade.result === "WIN" ? "text-green-500" : "text-red-500"}`}>
                    {data.trade.result} ({data.trade.pnl > 0 ? "+" : ""}{data.trade.pnl.toFixed(2)} pts)
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">P&L: </span>
                  <span className={`font-mono font-bold ${data.trade.pnl_dollars >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {data.trade.pnl_dollars >= 0 ? "+" : ""}${data.trade.pnl_dollars.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Account: </span>
                  <span className="font-mono text-zinc-300">
                    ${data.trade.account_after.toLocaleString()}
                  </span>
                  <span className={`font-mono text-xs ml-1 ${data.trade.pnl_pct >= 0 ? "text-green-500" : "text-red-500"}`}>
                    ({data.trade.pnl_pct >= 0 ? "+" : ""}{data.trade.pnl_pct}%)
                  </span>
                </div>
              </>
            )}
            {data.trade === null && (
              <div className="border-l border-zinc-700 pl-6">
                <span className="font-mono text-zinc-500">No breakout</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border p-4"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        {/* Mode toggle */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Data Source</label>
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={() => setMode("random")}
              className={`px-3 py-1.5 text-sm transition-colors ${
                mode === "random"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
              style={mode !== "random" ? { backgroundColor: "var(--bg)" } : {}}
            >
              Random
            </button>
            <button
              onClick={() => setMode("real")}
              className={`px-3 py-1.5 text-sm transition-colors ${
                mode === "real"
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
              style={mode !== "real" ? { backgroundColor: "var(--bg)" } : {}}
            >
              Real MNQ Data
            </button>
          </div>
        </div>

        {/* ORB minutes */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">ORB Minutes</label>
          <input
            type="number"
            min={1}
            max={60}
            value={orbMinutes}
            onChange={(e) => setOrbMinutes(Number(e.target.value))}
            className="w-20 rounded border px-2 py-1.5 text-sm"
            style={{
              backgroundColor: "var(--bg)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        {mode === "random" ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Start Price</label>
              <input
                type="number"
                value={startPrice}
                onChange={(e) => setStartPrice(Number(e.target.value))}
                className="w-28 rounded border px-2 py-1.5 text-sm"
                style={{
                  backgroundColor: "var(--bg)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Volatility</label>
              <input
                type="number"
                step={0.0001}
                min={0.0001}
                max={1}
                value={volatility}
                onChange={(e) => setVolatility(Number(e.target.value))}
                className="w-28 rounded border px-2 py-1.5 text-sm"
                style={{
                  backgroundColor: "var(--bg)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Date (YYYY-MM-DD)</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm"
              style={{
                backgroundColor: "var(--bg)",
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
            />
          </div>
        )}

        {/* Contracts & Account */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Contracts</label>
          <input
            type="number"
            min={1}
            max={40}
            value={contracts}
            onChange={(e) => setContracts(Number(e.target.value))}
            className="w-20 rounded border px-2 py-1.5 text-sm"
            style={{
              backgroundColor: "var(--bg)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">Account Size ($)</label>
          <input
            type="number"
            min={1000}
            step={1000}
            value={accountSize}
            onChange={(e) => setAccountSize(Number(e.target.value))}
            className="w-28 rounded border px-2 py-1.5 text-sm"
            style={{
              backgroundColor: "var(--bg)",
              borderColor: "var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "Loading..." : mode === "random" ? "Generate" : "Load Data"}
        </button>

        {/* Toggles */}
        <div className="flex items-center gap-4 ml-2 border-l pl-4" style={{ borderColor: "var(--border)" }}>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showOrb}
              onChange={(e) => setShowOrb(e.target.checked)}
              className="accent-indigo-600"
            />
            <span className="text-zinc-400">Show ORB</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={runStrategy}
              onChange={(e) => setRunStrategy(e.target.checked)}
              disabled={!showOrb}
              className="accent-indigo-600"
            />
            <span className={showOrb ? "text-zinc-400" : "text-zinc-600"}>Run Strategy</span>
          </label>
        </div>
      </div>

      {/* Chart */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        {data ? (
          <CandlestickChart data={data} />
        ) : (
          <div
            className="flex items-center justify-center text-zinc-500"
            style={{ height: "calc(100vh - 200px)", minHeight: "400px" }}
          >
            Click &quot;Generate&quot; to create random candlesticks or load real MNQ data
          </div>
        )}
      </div>
    </div>
  );
}
