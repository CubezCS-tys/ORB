"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  ColorType,
} from "lightweight-charts";
import type { ORBData } from "@/lib/types";

interface ChartProps {
  data: ORBData | null;
}

function parseTime(timeStr: string): number {
  // lightweight-charts needs UTC timestamp in seconds
  return Math.floor(new Date(timeStr + "Z").getTime() / 1000);
}

export default function CandlestickChart({ data }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    // Clear previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0f" },
        textColor: "#71717a",
      },
      grid: {
        vertLines: { color: "#1e1e2e" },
        horzLines: { color: "#1e1e2e" },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: "#1e1e2e",
      },
      timeScale: {
        borderColor: "#1e1e2e",
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#6366f1",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
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

  // Initialize chart on mount
  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [initChart]);

  // Update data when it changes
  useEffect(() => {
    if (!data) return;

    // Re-initialize chart to clear old price lines/markers
    const cleanup = initChart();
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const candles = data.all_candles;
    if (!candles || !candles.length) return;

    // Map to lightweight-charts format
    const candleData: CandlestickData[] = candles.map((c) => ({
      time: parseTime(c.time) as CandlestickData["time"],
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = candles.map((c) => ({
      time: parseTime(c.time) as CandlestickData["time"],
      value: c.volume,
      color: c.close >= c.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Draw ORB levels as price lines
    if (data.orb_high !== null) {
      candleSeriesRef.current.createPriceLine({
        price: data.orb_high,
        color: "#22c55e",
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "ORB High",
      });
    }

    if (data.orb_low !== null) {
      candleSeriesRef.current.createPriceLine({
        price: data.orb_low,
        color: "#ef4444",
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "ORB Low",
      });
    }

    // Highlight ORB candles with markers
    const markers: Array<{
      time: CandlestickData["time"];
      position: "aboveBar" | "belowBar";
      color: string;
      shape: "circle" | "arrowUp" | "arrowDown" | "square";
      text: string;
    }> = [];

    if (data.orb_candles.length > 0) {
      markers.push({
        time: parseTime(data.orb_candles[0].time) as CandlestickData["time"],
        position: "aboveBar",
        color: "#6366f1",
        shape: "circle",
        text: "ORB",
      });
    }

    // Add trade markers
    const trade = data.trade;
    if (trade) {
      // Entry marker
      markers.push({
        time: parseTime(trade.entry_time) as CandlestickData["time"],
        position: trade.direction === "LONG" ? "belowBar" : "aboveBar",
        color: trade.direction === "LONG" ? "#22c55e" : "#ef4444",
        shape: trade.direction === "LONG" ? "arrowUp" : "arrowDown",
        text: `${trade.direction} ${trade.entry_price.toFixed(2)}`,
      });

      // Exit marker
      if (trade.exit_time) {
        markers.push({
          time: parseTime(trade.exit_time) as CandlestickData["time"],
          position: "aboveBar",
          color: trade.result === "WIN" ? "#22c55e" : "#ef4444",
          shape: "square",
          text: `${trade.result} ${trade.pnl > 0 ? "+" : ""}${trade.pnl.toFixed(2)}`,
        });
      }

      // TP price line
      candleSeriesRef.current.createPriceLine({
        price: trade.take_profit,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 3, // Dotted
        axisLabelVisible: true,
        title: "TP",
      });

      // SL price line
      candleSeriesRef.current.createPriceLine({
        price: trade.stop_loss,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 3, // Dotted
        axisLabelVisible: true,
        title: "SL",
      });
    }

    // Sort markers by time (required by lightweight-charts)
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    if (markers.length > 0) {
      createSeriesMarkers(candleSeriesRef.current, markers);
    }

    chartRef.current?.timeScale().fitContent();

    return cleanup;
  }, [data, initChart]);

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ height: "calc(100vh - 200px)", minHeight: "400px" }}
    />
  );
}
