"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  ColorType,
} from "lightweight-charts";
import { fetchPracticeDay } from "@/lib/api";
import type { PracticeDayData, PracticeTrade } from "@/lib/types";

/* ── helpers ─────────────────────────────────────────────────── */
function parseTime(timeStr: string): number {
  return Math.floor(new Date(timeStr + "Z").getTime() / 1000);
}

type Speed = 1 | 2 | 5 | 10 | 30 | 60;
const SPEEDS: Speed[] = [1, 2, 5, 10, 30, 60];

/* interval (ms) per intra-candle tick at 1× speed
   10 ticks per candle × 6000ms = 60 000ms = 1 real minute per candle */
const BASE_TICK_MS = 6000;

/* ── component ───────────────────────────────────────────────── */
export default function PracticePage() {
  /* data state */
  const [dayData, setDayData] = useState<PracticeDayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateHidden, setDateHidden] = useState(true);

  /* playback state */
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(2);
  const [candleIdx, setCandleIdx] = useState(0); // how many full candles revealed
  const [tickIdx, setTickIdx] = useState(0); // tick within current forming candle
  const playingRef = useRef(false);
  const speedRef = useRef<Speed>(2);

  /* trade state */
  const [trades, setTrades] = useState<PracticeTrade[]>([]);
  const [tradeForm, setTradeForm] = useState<{
    direction: "LONG" | "SHORT";
    sl: string;
    tp: string;
    contracts: string;
  }>({ direction: "LONG", sl: "", tp: "", contracts: "1" });
  const [accountBalance, setAccountBalance] = useState(50000);
  const nextTradeId = useRef(1);

  /* chart refs */
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const hasFittedRef = useRef(false);
  const activePriceLines = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);

  /* keep refs in sync */
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  /* ── fetch a random day ─────────────────────────────────── */
  const loadNewDay = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    setCandleIdx(0);
    setTickIdx(0);
    setTrades([]);
    setAccountBalance(50000);
    setDateHidden(true);
    nextTradeId.current = 1;
    hasFittedRef.current = false;
    try {
      const data = await fetchPracticeDay();
      if (data.error) { setError(data.error); return; }
      setDayData(data);
    } catch {
      setError("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  /* load on mount */
  useEffect(() => { loadNewDay(); }, [loadNewDay]);

  /* ── init chart ─────────────────────────────────────────── */
  const initChart = useCallback(() => {
    if (!containerRef.current) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0f" },
        textColor: "#71717a",
      },
      grid: { vertLines: { color: "#1e1e2e" }, horzLines: { color: "#1e1e2e" } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: "#1e1e2e" },
      timeScale: { borderColor: "#1e1e2e", timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const cs = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444",
      borderDownColor: "#ef4444", borderUpColor: "#22c55e",
      wickDownColor: "#ef4444", wickUpColor: "#22c55e",
    });

    const vs = chart.addSeries(HistogramSeries, {
      color: "#6366f1", priceFormat: { type: "volume" }, priceScaleId: "",
    });
    vs.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    // Realtime price line (shows current tick price)
    const pl = chart.addSeries(LineSeries, {
      color: "#fbbf24",
      lineWidth: 1,
      priceScaleId: "right",
      lastValueVisible: true,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = cs;
    volumeSeriesRef.current = vs;
    priceLineRef.current = pl;

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const cleanup = initChart();
    return () => { cleanup?.(); chartRef.current?.remove(); chartRef.current = null; };
  }, [initChart]);

  /* ── current price (for trade entry default) ───────────── */
  const getCurrentPrice = useCallback((): number | null => {
    if (!dayData) return null;
    if (candleIdx === 0 && tickIdx === 0) return dayData.candles[0]?.open ?? null;
    const ci = Math.min(candleIdx, dayData.candles.length - 1);
    const candle = dayData.candles[ci];
    if (candleIdx < dayData.candles.length && tickIdx < candle.ticks.length) {
      return candle.ticks[tickIdx].price;
    }
    return candle.close;
  }, [dayData, candleIdx, tickIdx]);

  /* ── render chart with current state ────────────────────── */
  const renderChart = useCallback(
    (cIdx: number, tIdx: number, currentTrades: PracticeTrade[]) => {
      if (!dayData || !candleSeriesRef.current || !volumeSeriesRef.current || !priceLineRef.current) return;

      // Remove old price lines before drawing new ones
      for (const pl of activePriceLines.current) {
        candleSeriesRef.current.removePriceLine(pl);
      }
      activePriceLines.current = [];

      const candles = dayData.candles;
      const completedCandles: CandlestickData[] = [];
      const volumeData: { time: CandlestickData["time"]; value: number; color: string }[] = [];

      // Add completed candles
      for (let i = 0; i < Math.min(cIdx, candles.length); i++) {
        const c = candles[i];
        const t = parseTime(c.time) as CandlestickData["time"];
        completedCandles.push({ time: t, open: c.open, high: c.high, low: c.low, close: c.close });
        volumeData.push({
          time: t,
          value: c.volume,
          color: c.close >= c.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
        });
      }

      // Add the forming candle (partial) if we haven't finished all candles
      let currentPrice: number | null = null;
      if (cIdx < candles.length) {
        const forming = candles[cIdx];
        const ticks = forming.ticks;
        const safeTick = Math.min(tIdx, ticks.length - 1);

        let fOpen = forming.open;
        let fHigh = forming.open;
        let fLow = forming.open;
        let fClose = forming.open;

        for (let t = 0; t <= safeTick; t++) {
          const p = ticks[t].price;
          fHigh = Math.max(fHigh, p);
          fLow = Math.min(fLow, p);
          fClose = p;
        }

        currentPrice = fClose;
        const ft = parseTime(forming.time) as CandlestickData["time"];
        completedCandles.push({ time: ft, open: fOpen, high: fHigh, low: fLow, close: fClose });
        volumeData.push({
          time: ft,
          value: Math.round(forming.volume * ((safeTick + 1) / ticks.length)),
          color: fClose >= fOpen ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
        });
      }

      candleSeriesRef.current.setData(completedCandles);
      volumeSeriesRef.current.setData(volumeData);

      // Price line — just put a single point at the last visible candle time
      if (completedCandles.length > 0 && currentPrice !== null) {
        const lastTime = completedCandles[completedCandles.length - 1].time;
        priceLineRef.current.setData([{ time: lastTime, value: currentPrice }]);
      } else {
        priceLineRef.current.setData([]);
      }

      // Draw trade markers & price lines
      const markers: Array<{
        time: CandlestickData["time"];
        position: "aboveBar" | "belowBar";
        color: string;
        shape: "circle" | "arrowUp" | "arrowDown" | "square";
        text: string;
      }> = [];

      // Clear existing price lines by re-creating candle series price lines
      // We need to track and remove — easier to just redraw markers
      for (const trade of currentTrades) {
        const entryTime = parseTime(trade.entry_time) as CandlestickData["time"];
        markers.push({
          time: entryTime,
          position: trade.direction === "LONG" ? "belowBar" : "aboveBar",
          color: trade.direction === "LONG" ? "#22c55e" : "#ef4444",
          shape: trade.direction === "LONG" ? "arrowUp" : "arrowDown",
          text: `${trade.direction} @${trade.entry_price.toFixed(2)}`,
        });

        if (trade.exit_time) {
          const exitTime = parseTime(trade.exit_time) as CandlestickData["time"];
          markers.push({
            time: exitTime,
            position: "aboveBar",
            color: trade.result === "WIN" ? "#22c55e" : "#ef4444",
            shape: "square",
            text: `${trade.result} $${(trade.pnl_dollars ?? 0).toFixed(0)}`,
          });
        }

        // Draw SL/TP price lines for open trades
        if (!trade.exit_time) {
          activePriceLines.current.push(
            candleSeriesRef.current!.createPriceLine({
              price: trade.take_profit,
              color: "#22c55e",
              lineWidth: 1,
              lineStyle: 3,
              axisLabelVisible: true,
              title: `TP ${trade.take_profit.toFixed(2)}`,
            }),
            candleSeriesRef.current!.createPriceLine({
              price: trade.stop_loss,
              color: "#ef4444",
              lineWidth: 1,
              lineStyle: 3,
              axisLabelVisible: true,
              title: `SL ${trade.stop_loss.toFixed(2)}`,
            }),
            candleSeriesRef.current!.createPriceLine({
              price: trade.entry_price,
              color: "#6366f1",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `Entry ${trade.entry_price.toFixed(2)}`,
            }),
          );
        }
      }

      markers.sort((a, b) => (a.time as number) - (b.time as number));
      if (markers.length > 0) {
        createSeriesMarkers(candleSeriesRef.current, markers);
      }

      // Only auto-fit once when the first few candles appear, then let user zoom/scroll freely
      if (!hasFittedRef.current && completedCandles.length >= 3) {
        chartRef.current?.timeScale().fitContent();
        hasFittedRef.current = true;
      }
    },
    [dayData],
  );

  /* re-render when state changes (manual scrubbing etc.) */
  useEffect(() => {
    renderChart(candleIdx, tickIdx, trades);
  }, [candleIdx, tickIdx, trades, renderChart]);

  /* ── check open trades against current price ───────────── */
  const checkTrades = useCallback(
    (price: number, time: string, currentTrades: PracticeTrade[]): PracticeTrade[] => {
      if (!dayData) return currentTrades;
      let changed = false;
      const pv = dayData.point_value;

      const updated = currentTrades.map((t) => {
        if (t.exit_time) return t; // already closed

        let hit = false;
        let exitPrice = 0;

        if (t.direction === "LONG") {
          if (price <= t.stop_loss) { hit = true; exitPrice = t.stop_loss; }
          else if (price >= t.take_profit) { hit = true; exitPrice = t.take_profit; }
        } else {
          if (price >= t.stop_loss) { hit = true; exitPrice = t.stop_loss; }
          else if (price <= t.take_profit) { hit = true; exitPrice = t.take_profit; }
        }

        if (hit) {
          changed = true;
          const pnlPts = t.direction === "LONG"
            ? exitPrice - t.entry_price
            : t.entry_price - exitPrice;
          const pnlDollars = pnlPts * pv * t.contracts;
          return {
            ...t,
            exit_price: exitPrice,
            exit_time: time,
            result: pnlDollars > 0 ? "WIN" as const : pnlDollars < 0 ? "LOSS" as const : "SCRATCH" as const,
            pnl_dollars: pnlDollars,
          };
        }
        return t;
      });

      if (changed) {
        // update balance
        const newPnl = updated.reduce((sum, t) => sum + (t.pnl_dollars ?? 0), 0);
        const oldPnl = currentTrades.reduce((sum, t) => sum + (t.pnl_dollars ?? 0), 0);
        setAccountBalance((prev) => prev + (newPnl - oldPnl));
      }

      return changed ? updated : currentTrades;
    },
    [dayData],
  );

  /* ── playback loop ──────────────────────────────────────── */
  useEffect(() => {
    if (!playing || !dayData) return;

    let cIdx = candleIdx;
    let tIdx = tickIdx;
    let localTrades = trades;
    let cancelled = false;

    const step = () => {
      if (cancelled || !playingRef.current) return;

      const candles = dayData.candles;
      if (cIdx >= candles.length) {
        setPlaying(false);
        return;
      }

      const currentCandle = candles[cIdx];
      const ticks = currentCandle.ticks;

      tIdx++;
      if (tIdx >= ticks.length) {
        // Move to next candle
        cIdx++;
        tIdx = 0;
      }

      // Get current price
      let price: number;
      if (cIdx < candles.length) {
        const safeTick = Math.min(tIdx, candles[cIdx].ticks.length - 1);
        price = candles[cIdx].ticks[safeTick].price;
      } else {
        price = candles[candles.length - 1].close;
      }

      // Check trades
      const time = cIdx < candles.length ? candles[cIdx].time : candles[candles.length - 1].time;
      const updatedTrades = checkTrades(price, time, localTrades);
      if (updatedTrades !== localTrades) {
        localTrades = updatedTrades;
        setTrades(updatedTrades);
      }

      setCandleIdx(cIdx);
      setTickIdx(tIdx);
      renderChart(cIdx, tIdx, localTrades);

      const interval = BASE_TICK_MS / speedRef.current;
      setTimeout(step, interval);
    };

    const interval = BASE_TICK_MS / speedRef.current;
    const timer = setTimeout(step, interval);

    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, dayData]);

  /* ── place a trade ──────────────────────────────────────── */
  const placeTrade = () => {
    if (!dayData || candleIdx >= dayData.candles.length) return;

    const price = getCurrentPrice();
    if (price === null) return;

    const sl = parseFloat(tradeForm.sl);
    const tp = parseFloat(tradeForm.tp);
    const contracts = parseInt(tradeForm.contracts, 10);

    if (isNaN(sl) || isNaN(tp) || isNaN(contracts) || contracts < 1) return;

    // Validate SL/TP direction
    if (tradeForm.direction === "LONG") {
      if (sl >= price || tp <= price) return;
    } else {
      if (sl <= price || tp >= price) return;
    }

    const ci = Math.min(candleIdx, dayData.candles.length - 1);
    const time = dayData.candles[ci].time;

    const trade: PracticeTrade = {
      id: nextTradeId.current++,
      direction: tradeForm.direction,
      entry_price: price,
      entry_time: time,
      stop_loss: sl,
      take_profit: tp,
      contracts,
    };

    setTrades((prev) => [...prev, trade]);
    setTradeForm((f) => ({ ...f, sl: "", tp: "" }));
  };

  /* ── close trade at market ──────────────────────────────── */
  const closeTrade = (tradeId: number) => {
    const price = getCurrentPrice();
    if (price === null || !dayData) return;

    const ci = Math.min(candleIdx, dayData.candles.length - 1);
    const time = dayData.candles[ci].time;
    const pv = dayData.point_value;

    setTrades((prev) =>
      prev.map((t) => {
        if (t.id !== tradeId || t.exit_time) return t;
        const pnlPts = t.direction === "LONG" ? price - t.entry_price : t.entry_price - price;
        const pnlDollars = pnlPts * pv * t.contracts;
        setAccountBalance((b) => b + pnlDollars);
        return {
          ...t,
          exit_price: price,
          exit_time: time,
          result: pnlDollars > 0 ? "WIN" : pnlDollars < 0 ? "LOSS" : "SCRATCH",
          pnl_dollars: pnlDollars,
        };
      }),
    );
  };

  /* ── auto-fill SL/TP helper ─────────────────────────────── */
  const autoFillSLTP = (dir: "LONG" | "SHORT") => {
    const price = getCurrentPrice();
    if (price === null) return;
    const offset = 20; // 20 points default
    if (dir === "LONG") {
      setTradeForm((f) => ({
        ...f,
        direction: dir,
        sl: (price - offset).toFixed(2),
        tp: (price + offset).toFixed(2),
      }));
    } else {
      setTradeForm((f) => ({
        ...f,
        direction: dir,
        sl: (price + offset).toFixed(2),
        tp: (price - offset).toFixed(2),
      }));
    }
  };

  /* ── derived ────────────────────────────────────────────── */
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl_dollars ?? 0), 0);
  const openTrades = trades.filter((t) => !t.exit_time);
  const closedTrades = trades.filter((t) => !!t.exit_time);
  const winCount = closedTrades.filter((t) => t.result === "WIN").length;
  const currentPrice = getCurrentPrice();
  const isFinished = dayData ? candleIdx >= dayData.candles.length : false;
  const progress = dayData ? Math.min(100, ((candleIdx / dayData.candles.length) * 100)) : 0;

  // Dollar values for SL / TP
  const pv = dayData?.point_value ?? 2;
  const contracts = parseInt(tradeForm.contracts, 10) || 1;
  const slPrice = parseFloat(tradeForm.sl);
  const tpPrice = parseFloat(tradeForm.tp);
  const slDollars = currentPrice !== null && !isNaN(slPrice)
    ? Math.abs(currentPrice - slPrice) * pv * contracts
    : null;
  const tpDollars = currentPrice !== null && !isNaN(tpPrice)
    ? Math.abs(tpPrice - currentPrice) * pv * contracts
    : null;

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="flex h-[calc(100vh-41px)] overflow-hidden">
      {/* LEFT: Chart area */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <div
          className="flex items-center gap-3 border-b px-4 py-2"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
        >
          {/* Date (hidden until revealed) */}
          <button
            onClick={() => setDateHidden(!dateHidden)}
            className="rounded px-2 py-1 text-xs font-mono transition-colors hover:bg-white/5"
          >
            {dateHidden ? "🙈 Date Hidden" : `📅 ${dayData?.date ?? "..."}`}
          </button>

          <div className="h-4 w-px bg-zinc-700" />

          {/* Playback controls */}
          <button
            onClick={() => setPlaying(!playing)}
            disabled={loading || isFinished}
            className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>

          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded px-2 py-1 text-xs font-mono transition-colors ${
                  speed === s
                    ? "bg-indigo-600/30 text-indigo-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-zinc-700" />

          {/* New Day */}
          <button
            onClick={loadNewDay}
            disabled={loading}
            className="rounded border px-3 py-1 text-sm text-zinc-400 transition-colors hover:border-indigo-500 hover:text-white disabled:opacity-40"
            style={{ borderColor: "var(--border)" }}
          >
            🎲 New Day
          </button>

          {/* Progress */}
          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
              <span className="text-zinc-400">Loading day…</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
              <span className="text-red-400">{error}</span>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>

      {/* RIGHT: Trade panel */}
      <div
        className="flex w-80 flex-col border-l overflow-y-auto"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Account info */}
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Account</div>
          <div className="text-2xl font-bold font-mono">
            ${accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`text-sm font-mono mt-1 ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} today
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {closedTrades.length} trades · {closedTrades.length > 0 ? ((winCount / closedTrades.length) * 100).toFixed(0) : 0}% win rate
          </div>
        </div>

        {/* Current price */}
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Current Price</div>
          <div className="text-xl font-mono font-bold text-amber-400">
            {currentPrice !== null ? currentPrice.toFixed(2) : "—"}
          </div>
        </div>

        {/* Place trade */}
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Place Trade</div>

          {/* Direction buttons */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => autoFillSLTP("LONG")}
              className={`rounded py-2 text-sm font-bold transition-colors ${
                tradeForm.direction === "LONG"
                  ? "bg-green-600 text-white"
                  : "bg-green-600/10 text-green-400 hover:bg-green-600/20"
              }`}
            >
              ▲ LONG
            </button>
            <button
              onClick={() => autoFillSLTP("SHORT")}
              className={`rounded py-2 text-sm font-bold transition-colors ${
                tradeForm.direction === "SHORT"
                  ? "bg-red-600 text-white"
                  : "bg-red-600/10 text-red-400 hover:bg-red-600/20"
              }`}
            >
              ▼ SHORT
            </button>
          </div>

          {/* SL / TP / Contracts */}
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500">Stop Loss</label>
                {slDollars !== null && (
                  <span className="text-xs font-mono text-red-400">-${slDollars.toFixed(2)}</span>
                )}
              </div>
              <input
                type="number"
                step="0.25"
                value={tradeForm.sl}
                onChange={(e) => setTradeForm((f) => ({ ...f, sl: e.target.value }))}
                className="mt-0.5 w-full rounded border bg-black/30 px-2 py-1.5 text-sm font-mono text-red-400 outline-none focus:border-red-500"
                style={{ borderColor: "var(--border)" }}
                placeholder="Stop Loss price"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500">Take Profit</label>
                {tpDollars !== null && (
                  <span className="text-xs font-mono text-green-400">+${tpDollars.toFixed(2)}</span>
                )}
              </div>
              <input
                type="number"
                step="0.25"
                value={tradeForm.tp}
                onChange={(e) => setTradeForm((f) => ({ ...f, tp: e.target.value }))}
                className="mt-0.5 w-full rounded border bg-black/30 px-2 py-1.5 text-sm font-mono text-green-400 outline-none focus:border-green-500"
                style={{ borderColor: "var(--border)" }}
                placeholder="Take Profit price"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Contracts</label>
              <input
                type="number"
                min="1"
                max="40"
                value={tradeForm.contracts}
                onChange={(e) => setTradeForm((f) => ({ ...f, contracts: e.target.value }))}
                className="mt-0.5 w-full rounded border bg-black/30 px-2 py-1.5 text-sm font-mono text-white outline-none focus:border-indigo-500"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
          </div>

          <button
            onClick={placeTrade}
            disabled={!dayData || isFinished || candleIdx === 0}
            className="mt-3 w-full rounded bg-indigo-600 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            Place Trade
          </button>
        </div>

        {/* Open trades */}
        {openTrades.length > 0 && (
          <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Open Positions</div>
            <div className="space-y-2">
              {openTrades.map((t) => {
                const unrealized = currentPrice !== null
                  ? (t.direction === "LONG" ? currentPrice - t.entry_price : t.entry_price - currentPrice) *
                    (dayData?.point_value ?? 2) * t.contracts
                  : 0;
                return (
                  <div
                    key={t.id}
                    className="rounded border p-2 text-xs"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-bold ${t.direction === "LONG" ? "text-green-400" : "text-red-400"}`}>
                        {t.direction} ×{t.contracts}
                      </span>
                      <span className={`font-mono ${unrealized >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {unrealized >= 0 ? "+" : ""}${unrealized.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between text-zinc-500">
                      <span>Entry: {t.entry_price.toFixed(2)}</span>
                      <span>SL: {t.stop_loss.toFixed(2)}</span>
                      <span>TP: {t.take_profit.toFixed(2)}</span>
                    </div>
                    <button
                      onClick={() => closeTrade(t.id)}
                      className="mt-1.5 w-full rounded bg-amber-600/20 py-1 text-amber-400 text-xs hover:bg-amber-600/30 transition-colors"
                    >
                      Close at Market
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trade history */}
        {closedTrades.length > 0 && (
          <div className="p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Trade History</div>
            <div className="space-y-1.5">
              {closedTrades.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-xs"
                  style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                >
                  <span className={`font-bold ${t.direction === "LONG" ? "text-green-400" : "text-red-400"}`}>
                    {t.direction} ×{t.contracts}
                  </span>
                  <span className="text-zinc-500 font-mono">
                    {t.entry_price.toFixed(2)} → {t.exit_price?.toFixed(2)}
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      t.result === "WIN" ? "text-green-400" : t.result === "LOSS" ? "text-red-400" : "text-zinc-400"
                    }`}
                  >
                    {(t.pnl_dollars ?? 0) >= 0 ? "+" : ""}${(t.pnl_dollars ?? 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
